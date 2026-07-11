/**
 * Approvals route — integration tests.
 *
 * Tests the full HTTP layer including auth, validation, proof gate
 * enforcement, and execute bypass prevention.
 *
 * Strategy: Option B — requireFounder runs for real. Its two Supabase
 * dependencies (supabaseAuthClient and supabaseClient) are mocked so
 * network calls never leave the process. The 401 "no token" case works
 * without any mock because requireFounder short-circuits synchronously
 * before touching either client.
 *
 * Run: npx vitest run src/http/routes/__tests__/approvals.integration.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that pull in the modules under test.
// Vitest hoists vi.mock() calls, so these execute before module evaluation.
// ---------------------------------------------------------------------------

// --- supabaseAuthClient: controls requireFounder's JWT validation step ---
const mockGetUser = vi.fn();
vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: {
    auth: { getUser: mockGetUser },
  },
}));

// --- supabaseClient: controls all DB queries including founder_users ---
const supabaseMock = {
  from: vi.fn(),
};
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

vi.mock('../../../providers/GitHubProvider.js', () => ({
  GitHubProvider: vi.fn().mockImplementation(() => ({
    createBranch: vi.fn().mockResolvedValue(undefined),
    integrate: vi.fn().mockResolvedValue('abc123sha'),
  })),
}));
vi.mock('../../../events/outbox.js', () => ({ enqueueReconcile: vi.fn() }));

// ProofGateController — default to passing gate + successful persistence
const mockControllerRun = vi.fn();
vi.mock('../../../controllers/ProofGateController.js', () => ({
  ProofGateController: vi.fn().mockImplementation(() => ({ run: mockControllerRun })),
}));

// ---------------------------------------------------------------------------
// App bootstrap — after mocks
// ---------------------------------------------------------------------------

import express from 'express';
import request from 'supertest';
import { approvalsRouter } from '../approvals.js';

/**
 * Bare app — no founder-injection shim. requireFounder runs for real via
 * the router-level approvalsRouter.use(requireFounder) in approvals.ts.
 * Tests pass a Bearer token via supertest; requireFounder validates it
 * against the mocked supabaseAuth and mocked founder_users table.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/approvals', approvalsRouter);
  return app;
}

const MISSION_ID = 'mission-uuid-001';
const PROJECT_ID = 'project-uuid-001';
const FOUNDER_EMAIL = 'founder@example.com';
const FOUNDER_USER_ID = 'user-uuid-001';
const BEARER = 'Bearer test-token';

const validEvidence = {
  filesChanged: ['src/api/auth.ts'],
  behaviorChanged: 'RLS now enforced at DB level.',
  checksRun: ['tsc --noEmit', 'vitest run'],
  failures: [],
  securityImpact: 'RLS enforced.',
  deploymentImpact: 'Requires migration.',
  rollbackPath: 'Revert migration + redeploy.',
  unresolvedRisks: [],
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Returns a valid Supabase user for the mock getUser call.
 * Used standalone only in tests that don't call mockMissionFound() or
 * mockFullStack(), since those helpers embed the same getUser mock.
 */
function mockAuthSuccess() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: FOUNDER_USER_ID, email: FOUNDER_EMAIL } },
    error: null,
  });
}

function mockAuthInvalidToken() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'Invalid JWT' },
  });
}

// ---------------------------------------------------------------------------
// DB state helpers
// ---------------------------------------------------------------------------

/**
 * Shared founder_users allowlist row — returned by any table dispatch that
 * needs to satisfy requireFounder's second check. Kept here so the dispatch
 * branches in mockMissionFound() and mockFullStack() stay DRY.
 */
function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function mockMissionFound() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: FOUNDER_USER_ID, email: FOUNDER_EMAIL } },
    error: null,
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'missions') {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: { id: MISSION_ID, project_id: PROJECT_ID }, error: null }),
          }),
        }),
      };
    }
    return {
      select: vi.fn(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
  });
}

function mockMissionNotFound() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: FOUNDER_USER_ID, email: FOUNDER_EMAIL } },
    error: null,
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    return {
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
        }),
      }),
    };
  });
}

function mockProofGatePassed() {
  mockControllerRun.mockResolvedValue({
    status: 'converged',
    proposedActions: [{ actionType: 'proof_gate_passed', payload: { attestationType: 'manual' } }],
    observedChanges: [],
    evidenceIds: [],
    requiresApproval: false,
  });
}

function mockProofGateFailed(message = 'No checks reported') {
  mockControllerRun.mockResolvedValue({
    status: 'blocked',
    proposedActions: [],
    observedChanges: [],
    evidenceIds: [],
    requiresApproval: false,
    message,
  });
}

function mockProofGatePersistFailed() {
  mockControllerRun.mockResolvedValue({
    status: 'blocked',
    proposedActions: [],
    observedChanges: [],
    evidenceIds: [],
    requiresApproval: false,
    message: 'Proof gate result could not be persisted: connection refused',
  });
}

// ---------------------------------------------------------------------------
// Proof-gate endpoint tests
// ---------------------------------------------------------------------------

describe('POST /approvals/:missionId/run-proof-gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 — no Authorization header (requireFounder short-circuits)', async () => {
    // No mock needed: requireFounder returns 401 before calling getUser
    // when the Authorization header is absent.
    const app = buildApp();
    const res = await request(app)
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .send({ gateId: 'merge', evidence: validEvidence });
    expect(res.status).toBe(401);
  });

  it('401 — invalid token rejected by supabaseAuth', async () => {
    mockAuthInvalidToken();
    // founder_users is never reached — no supabaseMock.from setup needed
    const app = buildApp();
    const res = await request(app)
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({ gateId: 'merge', evidence: validEvidence });
    expect(res.status).toBe(401);
  });

  it('400 — missing gateId', async () => {
    mockMissionFound();
    const app = buildApp();
    const res = await request(app)
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({ evidence: validEvidence });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/gateId/);
  });

  it('400 — malformed evidence (checksRun not an array)', async () => {
    mockMissionFound();
    const app = buildApp();
    const res = await request(app)
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({ gateId: 'merge', evidence: { ...validEvidence, checksRun: 'not-an-array' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/checksRun/);
  });

  it('400 — malformed evidence (rollbackPath empty)', async () => {
    mockMissionFound();
    const app = buildApp();
    const res = await request(app)
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({ gateId: 'merge', evidence: { ...validEvidence, rollbackPath: '' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rollbackPath/);
  });

  it('404 — mission not found', async () => {
    mockMissionNotFound();
    mockProofGatePassed();
    const app = buildApp();
    const res = await request(app)
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({ gateId: 'merge', evidence: validEvidence });
    expect(res.status).toBe(404);
  });

  it('422 — proof gate blocked', async () => {
    mockMissionFound();
    mockProofGateFailed();
    const app = buildApp();
    const res = await request(app)
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({ gateId: 'merge', evidence: validEvidence });
    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
  });

  it('200 — gate passed and persisted; approvedBy sourced from JWT not caller', async () => {
    mockMissionFound();
    mockProofGatePassed();
    const app = buildApp();
    const res = await request(app)
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({ gateId: 'merge', evidence: validEvidence });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.attestationType).toBe('manual');
    // Verify controller received founder email from the verified JWT,
    // not from any caller-supplied field.
    expect(mockControllerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ approvedBy: FOUNDER_EMAIL }),
      }),
    );
  });

  it('500 — persistence failure blocks response', async () => {
    mockMissionFound();
    mockProofGatePersistFailed();
    const app = buildApp();
    const res = await request(app)
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({ gateId: 'merge', evidence: validEvidence });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/persist/);
  });
});

// ---------------------------------------------------------------------------
// Execute endpoint — proof gate enforcement
// ---------------------------------------------------------------------------

describe('POST /approvals/:missionId/execute — proof gate enforcement', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockFullStack(proofRecord: unknown) {
    mockGetUser.mockResolvedValue({
      data: { user: { id: FOUNDER_USER_ID, email: FOUNDER_EMAIL } },
      error: null,
    });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'missions') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: MISSION_ID,
                    project_id: PROJECT_ID,
                    status: 'awaiting_approval',
                    branch_name: 'feat/test',
                  },
                  error: null,
                }),
            }),
          }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
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
                        maybeSingle: () => Promise.resolve({ data: proofRecord, error: null }),
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
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      if (table === 'project_connections') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  single: () =>
                    Promise.resolve({
                      data: { connection_config: { repository: 'jussray/sekret-bip' } },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }
      return { select: vi.fn(), insert: vi.fn().mockResolvedValue({ error: null }) };
    });
  }

  it('403 — merge rejected without proof record', async () => {
    mockFullStack(null);
    process.env['GITHUB_TOKEN'] = 'token';
    const app = buildApp();
    const res = await request(app)
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({ actionType: 'merge', idempotencyKey: 'key-1', payload: { head: 'feat/test', base: 'main' } });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROOF_GATE_REQUIRED');
  });

  it('200 — merge succeeds with valid proof record', async () => {
    mockFullStack({ id: 'proof-1', status: 'pass', gate_id: 'merge', created_at: new Date().toISOString() });
    process.env['GITHUB_TOKEN'] = 'token';
    const app = buildApp();
    const res = await request(app)
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({ actionType: 'merge', idempotencyKey: 'key-2', payload: { head: 'feat/test', base: 'main' } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('403 — create_branch rejected without proof record', async () => {
    mockFullStack(null);
    const app = buildApp();
    const res = await request(app)
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({ actionType: 'create_branch', idempotencyKey: 'key-3', payload: { branchName: 'feat/new', baseRef: 'main' } });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROOF_GATE_REQUIRED');
  });
});
