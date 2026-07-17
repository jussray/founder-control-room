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

const mockEnqueue = vi.fn();
vi.mock('../../../events/outbox.js', () => ({ enqueueReconcile: mockEnqueue }));

const mockControllerRun = vi.fn();
vi.mock('../../../controllers/ProofGateController.js', () => ({
  ProofGateController: vi.fn().mockImplementation(() => ({ run: mockControllerRun })),
}));

import express from 'express';
import request from 'supertest';
import { approvalsRouter } from '../approvals.js';

const MISSION_ID = 'mission-uuid-001';
const PROJECT_ID = 'project-uuid-001';
const EXECUTION_ID = 'execution-uuid-001';
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

function twoEqUpdate(error: { message: string } | null = null) {
  return {
    eq: () => ({
      eq: () => Promise.resolve({ error }),
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
        update: () => twoEqUpdate(),
      };
    }
    return {};
  });
}

interface ExecutionRecord {
  id: string;
  status: 'pending' | 'succeeded' | 'failed';
  result: Record<string, unknown>;
  success: boolean | null;
}

interface ExecuteOptions {
  proofRecord?: unknown;
  missionStatus?: 'proposed' | 'approved';
  existingExecution?: ExecutionRecord | null;
  racedExecution?: ExecutionRecord | null;
  reservationError?: { message: string } | null;
  auditUpdateError?: { message: string } | null;
  missionUpdateError?: { message: string } | null;
  evidenceRows?: Array<{ kind: string; status: string; commit_sha: string; created_at: string }>;
  currentHead?: string;
  integrateError?: Error | null;
}

function executeStack(options: ExecuteOptions = {}) {
  authSuccess();
  mockResolveRef.mockResolvedValue(options.currentHead ?? EXPECTED_SHA);
  mockCreateBranch.mockResolvedValue('mission/test');
  if (options.integrateError) mockIntegrate.mockRejectedValue(options.integrateError);
  else mockIntegrate.mockResolvedValue('merge-commit-sha');

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

  let executionLookupCount = 0;
  const auditUpdate = vi.fn(() => twoEqUpdate(options.auditUpdateError ?? null));
  const reservationInsert = vi.fn(() => ({
    select: () => ({
      single: () => Promise.resolve(
        options.reservationError
          ? { data: null, error: options.reservationError }
          : { data: { id: EXECUTION_ID }, error: null },
      ),
    }),
  }));

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'missions') {
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: mission, error: null }) }),
        }),
        update: () => twoEqUpdate(options.missionUpdateError ?? null),
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
                      maybeSingle: () => Promise.resolve({
                        data: options.proofRecord === undefined
                          ? { id: 'proof', status: 'pass' }
                          : options.proofRecord,
                        error: null,
                      }),
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
          eq: () => ({
            maybeSingle: () => {
              const data = executionLookupCount === 0
                ? options.existingExecution ?? null
                : options.racedExecution ?? options.existingExecution ?? null;
              executionLookupCount += 1;
              return Promise.resolve({ data, error: null });
            },
          }),
        }),
        insert: reservationInsert,
        update: auditUpdate,
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
    return {};
  });

  return { auditUpdate, reservationInsert };
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

describe('reservation-first exact-head execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_TOKEN = 'test-token';
  });

  it('rejects merge without a fresh proof record before reserving or calling GitHub', async () => {
    const { reservationInsert } = executeStack({ proofRecord: null });
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
    expect(reservationInsert).not.toHaveBeenCalled();
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it('returns a prior succeeded execution without repeating the provider action', async () => {
    executeStack({
      existingExecution: {
        id: EXECUTION_ID,
        status: 'succeeded',
        result: { mergeCommitSha: 'already-merged' },
        success: true,
      },
    });
    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'merge-existing',
        payload: { head: 'codex/test', base: 'main', expectedHeadSha: EXPECTED_SHA },
      });
    expect(response.status).toBe(200);
    expect(response.body.idempotent).toBe(true);
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it('blocks a pending reservation because the provider may already have mutated state', async () => {
    executeStack({
      existingExecution: {
        id: EXECUTION_ID,
        status: 'pending',
        result: {},
        success: null,
      },
    });
    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'merge-pending',
        payload: { head: 'codex/test', base: 'main', expectedHeadSha: EXPECTED_SHA },
      });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ACTION_ALREADY_PENDING');
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it('does not call the provider when reservation persistence fails', async () => {
    executeStack({ reservationError: { message: 'database unavailable' } });
    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'merge-reservation-failed',
        payload: { head: 'codex/test', base: 'main', expectedHeadSha: EXPECTED_SHA },
      });
    expect(response.status).toBe(500);
    expect(response.body.code).toBe('ACTION_RESERVATION_FAILED');
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it('records stale exact-head evidence as a failed reserved action', async () => {
    const { auditUpdate } = executeStack({
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
    expect(auditUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('rejects a branch that moved after verification and finalizes the reservation as failed', async () => {
    const { auditUpdate } = executeStack({ currentHead: 'c'.repeat(40) });
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
    expect(auditUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('integrates only after reservation, exact-head proof, and immutable ref confirmation', async () => {
    const { auditUpdate, reservationInsert } = executeStack();
    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'merge-safe',
        payload: { head: 'codex/test', base: 'main', expectedHeadSha: EXPECTED_SHA },
      });

    expect(response.status).toBe(200);
    expect(reservationInsert).toHaveBeenCalled();
    expect(mockResolveRef).toHaveBeenCalledWith('test-project', 'codex/test');
    expect(mockIntegrate).toHaveBeenCalledWith('test-project', 'main', 'codex/test');
    expect(auditUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded' }));
  });

  it('leaves the reservation pending and forbids automatic retry when audit finalization fails', async () => {
    executeStack({ auditUpdateError: { message: 'write interrupted' } });
    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'merge-audit-incomplete',
        payload: { head: 'codex/test', base: 'main', expectedHeadSha: EXPECTED_SHA },
      });

    expect(mockIntegrate).toHaveBeenCalled();
    expect(response.status).toBe(500);
    expect(response.body.code).toBe('ACTION_AUDIT_INCOMPLETE');
  });

  it('records provider failure and does not silently retry it', async () => {
    const { auditUpdate } = executeStack({ integrateError: new Error('merge conflict') });
    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'merge-provider-failed',
        payload: { head: 'codex/test', base: 'main', expectedHeadSha: EXPECTED_SHA },
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/merge conflict/);
    expect(auditUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('creates a branch only after reserving a proposed mission action', async () => {
    const { reservationInsert, auditUpdate } = executeStack({ missionStatus: 'proposed' });
    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'create_branch',
        idempotencyKey: 'branch-safe',
        payload: { branchName: 'mission/test', baseRef: 'main' },
      });

    expect(response.status).toBe(200);
    expect(reservationInsert).toHaveBeenCalled();
    expect(mockCreateBranch).toHaveBeenCalledWith('test-project', 'main', 'mission/test');
    expect(auditUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded' }));
  });
});
