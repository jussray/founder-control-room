import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUser = vi.fn();
vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));

const supabaseMock = { from: vi.fn() };
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

const mockCreateBranch = vi.fn();
const mockResolveRef = vi.fn();
const mockIntegrate = vi.fn();
vi.mock('../../../providers/GitHubProvider.js', () => ({
  GitHubProvider: vi.fn().mockImplementation(() => ({
    createBranch: mockCreateBranch,
    resolveRef: mockResolveRef,
    integrate: mockIntegrate,
  })),
}));

vi.mock('../../../events/outbox.js', () => ({ enqueueReconcile: vi.fn() }));

const mockControllerRun = vi.fn();
vi.mock('../../../controllers/ProofGateController.js', () => ({
  ProofGateController: vi.fn().mockImplementation(() => ({ run: mockControllerRun })),
}));

import express from 'express';
import request from 'supertest';
import { approvalsRouter } from '../approvals.js';

const MISSION_ID = 'mission-uuid-001';
const PROJECT_ID = 'project-uuid-001';
const FOUNDER_EMAIL = 'founder@example.com';
const FOUNDER_USER_ID = 'user-uuid-001';
const BEARER = 'Bearer test-token';
const EXPECTED_SHA = 'a'.repeat(40);

const validEvidence = {
  filesChanged: ['src/example.ts'],
  behaviorChanged: 'Exact-head verification completed.',
  checksRun: ['typecheck', 'browser_test'],
  failures: [],
  securityImpact: 'none',
  deploymentImpact: 'none',
  rollbackPath: 'Revert the merge commit.',
  unresolvedRisks: [],
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/approvals', approvalsRouter);
  return app;
}

function authSuccess() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: FOUNDER_USER_ID, email: FOUNDER_EMAIL } },
    error: null,
  });
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function proofGateMission() {
  authSuccess();
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'missions') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: { id: MISSION_ID, project_id: PROJECT_ID, status: 'in_review' },
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }),
      };
    }
    return { insert: vi.fn().mockResolvedValue({ error: null }) };
  });
}

interface ExecuteOptions {
  proofRecord: unknown;
  missionStatus?: 'proposed' | 'approved';
  evidenceRows?: Array<{ kind: string; status: string; commit_sha: string; created_at: string }>;
  currentHead?: string;
}

function executeStack(options: ExecuteOptions) {
  authSuccess();
  mockResolveRef.mockResolvedValue(options.currentHead ?? EXPECTED_SHA);
  mockIntegrate.mockResolvedValue('merge-commit-sha');
  mockCreateBranch.mockResolvedValue('mission/test');

  const missionStatus = options.missionStatus ?? 'approved';
  const mission = {
    id: MISSION_ID,
    project_id: PROJECT_ID,
    status: missionStatus,
    branch_ref: 'codex/test',
    required_checks: ['typecheck', 'browser_test'],
    policy_snapshot: {
      expectedHeadSha: EXPECTED_SHA,
      rollbackPath: 'Revert merge commit.',
    },
  };

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'missions') {
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: mission, error: null }) }),
        }),
        update: () => ({
          eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }),
      };
    }
    if (table === 'proof_gate_results') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({ data: options.proofRecord, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'approval_executions') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
        insert: () => Promise.resolve({ error: null }),
      };
    }
    if (table === 'projects') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {
                id: PROJECT_ID,
                slug: 'test-project',
                repo_provider: 'github',
                repo_identifier: 'jussray/test-project',
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'evidence') {
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              order: () => Promise.resolve({
                data: options.evidenceRows ?? [
                  { kind: 'typecheck', status: 'pass', commit_sha: EXPECTED_SHA, created_at: new Date().toISOString() },
                  { kind: 'browser_test', status: 'pass', commit_sha: EXPECTED_SHA, created_at: new Date().toISOString() },
                ],
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    return { insert: vi.fn().mockResolvedValue({ error: null }) };
  });
}

describe('approval proof gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  it('rejects requests without a founder session', async () => {
    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .send({ gateId: 'merge', evidence: validEvidence });
    expect(response.status).toBe(401);
  });

  it('rejects malformed evidence', async () => {
    proofGateMission();
    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({ gateId: 'merge', evidence: { ...validEvidence, checksRun: 'nope' } });
    expect(response.status).toBe(400);
  });

  it('sources founder approval from the verified JWT and advances review to approved', async () => {
    proofGateMission();
    mockControllerRun.mockResolvedValue({
      status: 'converged',
      proposedActions: [],
      observedChanges: [],
      evidenceIds: [],
      requiresApproval: false,
    });

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({ gateId: 'merge', evidence: validEvidence });

    expect(response.status).toBe(200);
    expect(mockControllerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ approvedBy: FOUNDER_EMAIL }),
      }),
    );
  });

  it('fails closed when proof persistence fails', async () => {
    proofGateMission();
    mockControllerRun.mockResolvedValue({
      status: 'blocked',
      proposedActions: [],
      observedChanges: [],
      evidenceIds: [],
      requiresApproval: false,
      message: 'Proof gate result could not be persisted: connection refused',
    });

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({ gateId: 'merge', evidence: validEvidence });
    expect(response.status).toBe(500);
  });
});

describe('exact-head action execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_TOKEN = 'test-token';
  });

  it('rejects merge without a fresh proof record', async () => {
    executeStack({ proofRecord: null });
    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'merge-no-proof',
        payload: { head: 'codex/test', base: 'main', expectedHeadSha: EXPECTED_SHA },
      });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PROOF_GATE_REQUIRED');
  });

  it('rejects stale or wrong-SHA machine evidence', async () => {
    executeStack({
      proofRecord: { id: 'proof', status: 'pass' },
      evidenceRows: [
        { kind: 'typecheck', status: 'pass', commit_sha: 'b'.repeat(40), created_at: new Date().toISOString() },
        { kind: 'browser_test', status: 'pass', commit_sha: EXPECTED_SHA, created_at: new Date().toISOString() },
      ],
    });

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'merge-stale-evidence',
        payload: { head: 'codex/test', base: 'main', expectedHeadSha: EXPECTED_SHA },
      });
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/Exact-head machine evidence/);
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it('rejects a branch that moved after verification', async () => {
    executeStack({
      proofRecord: { id: 'proof', status: 'pass' },
      currentHead: 'c'.repeat(40),
    });

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'merge-moved-head',
        payload: { head: 'codex/test', base: 'main', expectedHeadSha: EXPECTED_SHA },
      });
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/Branch moved/);
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it('integrates only after fresh proof, exact-head evidence, and ref confirmation', async () => {
    executeStack({ proofRecord: { id: 'proof', status: 'pass' } });

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'merge-safe',
        payload: { head: 'codex/test', base: 'main', expectedHeadSha: EXPECTED_SHA },
      });

    expect(response.status).toBe(200);
    expect(mockResolveRef).toHaveBeenCalledWith('test-project', 'codex/test');
    expect(mockIntegrate).toHaveBeenCalledWith('test-project', 'main', 'codex/test');
  });

  it('creates a branch only from a proposed mission with fresh branch proof', async () => {
    executeStack({
      proofRecord: { id: 'proof', status: 'pass' },
      missionStatus: 'proposed',
    });

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'create_branch',
        idempotencyKey: 'branch-safe',
        payload: { branchName: 'mission/test', baseRef: 'main' },
      });

    expect(response.status).toBe(200);
    expect(mockCreateBranch).toHaveBeenCalledWith('test-project', 'main', 'mission/test');
  });
});
