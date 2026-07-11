/**
 * Approvals route — unit tests
 *
 * Tests the exact-match, transactional-claim, and 501-deploy-stub behaviour
 * without hitting GitHub or Supabase. All DB and provider calls are stubbed.
 *
 * Run: npx vitest run src/http/routes/__tests__/approvals.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Stubs — set up before vi.mock so factories can reference them
// ---------------------------------------------------------------------------

const mockFounder = { email: 'mcgill.raylene@gmail.com' };

// Supabase fluent-builder stub
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  update: mockUpdate,
  insert: mockInsert,
  upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

const mockCreateBranch = vi.fn().mockResolvedValue(undefined);
const mockIntegrate = vi.fn().mockResolvedValue('abc123sha');

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('../../../providers/GitHubProvider.js', () => ({
  GitHubProvider: vi.fn().mockImplementation(() => ({
    createBranch: mockCreateBranch,
    integrate: mockIntegrate,
  })),
}));

vi.mock('../../../events/outbox.js', () => ({
  enqueueReconcile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../middleware/requireFounder.js', () => ({
  requireFounder: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { founder: typeof mockFounder }).founder = mockFounder;
    next();
  },
}));

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

import { approvalsRouter } from '../approvals.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/approvals', approvalsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers to configure the mock chain for each scenario
// ---------------------------------------------------------------------------

function setupMocks({
  existingExecution = null,
  proposal = null,
  mission = null,
  claimCount = 1,
  connection = { connection_config: { repository: 'jussray/Sekret-Bip' } },
}: {
  existingExecution?: object | null;
  proposal?: object | null;
  mission?: object | null;
  claimCount?: number;
  connection?: object | null;
}) {
  // Each call to mockFrom().select() returns different data depending on
  // call order. We use mockImplementationOnce chains.
  mockSelect
    // 1. approval_executions idempotency check
    .mockImplementationOnce(() => ({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existingExecution }),
    }))
    // 2. proposed_actions lookup
    .mockImplementationOnce(() => ({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: proposal }),
    }))
    // 3. missions lookup
    .mockImplementationOnce(() => ({
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mission, error: mission ? null : { message: 'not found' } }),
    }))
    // 4. project_connections lookup
    .mockImplementationOnce(() => ({
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: connection }),
    }));

  mockUpdate
    // 1. Claim proposed_action
    .mockImplementationOnce(() => ({
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ count: claimCount, error: null }),
    }))
    // 2. missions update (branch_name or status)
    .mockImplementationOnce(() => ({
      eq: vi.fn().mockReturnThis(),
    }))
    // 3. proposed_actions final status update
    .mockImplementationOnce(() => ({
      eq: vi.fn().mockReturnThis(),
    }));

  mockInsert.mockResolvedValue({ data: null, error: null });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const MISSION_ID = 'mission-uuid-0001';
const IDEM_KEY = 'test-idem-key-001';

describe('POST /approvals/:missionId/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when idempotencyKey is missing', async () => {
    const res = await request(makeApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/idempotencyKey/);
  });

  it('returns prior result when idempotency key already executed', async () => {
    setupMocks({ existingExecution: { id: 'exec-1', result: { branchName: 'mission/abc' }, success: true } });
    const res = await request(makeApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .send({ idempotencyKey: IDEM_KEY });
    expect(res.status).toBe(200);
    expect(res.body.idempotent).toBe(true);
  });

  it('returns 404 when no proposed action exists for key', async () => {
    setupMocks({ proposal: null });
    const res = await request(makeApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .send({ idempotencyKey: IDEM_KEY });
    expect(res.status).toBe(404);
  });

  it('returns 403 when idempotency key belongs to a different mission', async () => {
    setupMocks({
      proposal: {
        id: 'prop-1',
        mission_id: 'different-mission-uuid',
        project_id: 'proj-1',
        action_type: 'create_branch',
        status: 'pending',
        expected_mission_status: 'planned',
        branch_name: 'mission/abc',
        base_branch: 'main',
      },
    });
    const res = await request(makeApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .send({ idempotencyKey: IDEM_KEY });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/does not belong/);
  });

  it('returns 409 when proposal is already claimed', async () => {
    setupMocks({
      proposal: {
        id: 'prop-1',
        mission_id: MISSION_ID,
        project_id: 'proj-1',
        action_type: 'create_branch',
        status: 'claimed',
        expected_mission_status: 'planned',
        branch_name: 'mission/abc',
        base_branch: 'main',
      },
    });
    const res = await request(makeApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .send({ idempotencyKey: IDEM_KEY });
    expect(res.status).toBe(409);
    expect(res.body.status).toBe('claimed');
  });

  it('returns 501 for deploy action type', async () => {
    setupMocks({
      proposal: {
        id: 'prop-1',
        mission_id: MISSION_ID,
        project_id: 'proj-1',
        action_type: 'deploy',
        status: 'pending',
        expected_mission_status: 'awaiting_approval',
      },
    });
    const res = await request(makeApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .send({ idempotencyKey: IDEM_KEY });
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('DEPLOYMENT_NOT_SUPPORTED');
  });

  it('returns 409 when mission status does not match expected', async () => {
    setupMocks({
      proposal: {
        id: 'prop-1',
        mission_id: MISSION_ID,
        project_id: 'proj-1',
        action_type: 'create_branch',
        status: 'pending',
        expected_mission_status: 'planned',
        branch_name: 'mission/abc',
        base_branch: 'main',
      },
      mission: {
        id: MISSION_ID,
        project_id: 'proj-1',
        status: 'implementing',  // wrong — expected 'planned'
        branch_name: null,
      },
    });
    const res = await request(makeApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .send({ idempotencyKey: IDEM_KEY });
    expect(res.status).toBe(409);
    expect(res.body.missionStatus).toBe('implementing');
  });

  it('returns 409 when concurrent request already claimed the action', async () => {
    setupMocks({
      proposal: {
        id: 'prop-1',
        mission_id: MISSION_ID,
        project_id: 'proj-1',
        action_type: 'create_branch',
        status: 'pending',
        expected_mission_status: 'planned',
        branch_name: 'mission/abc',
        base_branch: 'main',
      },
      mission: {
        id: MISSION_ID,
        project_id: 'proj-1',
        status: 'planned',
        branch_name: null,
      },
      claimCount: 0,  // UPDATE matched 0 rows — already claimed
    });
    const res = await request(makeApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .send({ idempotencyKey: IDEM_KEY });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/concurrent/);
  });

  it('executes create_branch from proposal data and returns ok', async () => {
    process.env['GITHUB_TOKEN'] = 'test-token';
    setupMocks({
      proposal: {
        id: 'prop-1',
        mission_id: MISSION_ID,
        project_id: 'proj-1',
        action_type: 'create_branch',
        status: 'pending',
        expected_mission_status: 'planned',
        branch_name: 'mission/abcd1234',
        base_branch: 'main',
        payload: { branchName: 'mission/abcd1234', baseRef: 'main' },
      },
      mission: {
        id: MISSION_ID,
        project_id: 'proj-1',
        status: 'planned',
        branch_name: null,
      },
    });
    const res = await request(makeApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .send({ idempotencyKey: IDEM_KEY });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.result.branchName).toBe('mission/abcd1234');
    expect(mockCreateBranch).toHaveBeenCalledWith('proj-1', 'main', 'mission/abcd1234');
  });

  it('executes merge from proposal data and returns ok', async () => {
    process.env['GITHUB_TOKEN'] = 'test-token';
    setupMocks({
      proposal: {
        id: 'prop-2',
        mission_id: MISSION_ID,
        project_id: 'proj-1',
        action_type: 'merge',
        status: 'pending',
        expected_mission_status: 'awaiting_approval',
        head_branch: 'mission/abcd1234',
        base_branch: 'main',
        head_sha: 'deadbeef',
        payload: { head: 'mission/abcd1234', base: 'main', headSha: 'deadbeef' },
      },
      mission: {
        id: MISSION_ID,
        project_id: 'proj-1',
        status: 'awaiting_approval',
        branch_name: 'mission/abcd1234',
      },
    });
    const res = await request(makeApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .send({ idempotencyKey: IDEM_KEY });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.result.mergeCommitSha).toBe('abc123sha');
    expect(mockIntegrate).toHaveBeenCalledWith('proj-1', 'main', 'mission/abcd1234');
  });
});
