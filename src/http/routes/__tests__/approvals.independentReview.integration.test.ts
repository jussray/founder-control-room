import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetUser,
  supabaseMock,
  mockControllerRun,
  mockProviderConfigurationError,
  mockProviderForProject,
  mockEnqueue,
  mockResolveRef,
  mockIntegrate,
  mockPrepareReviewAuthority,
  mockEnforceReviewAuthority,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  mockControllerRun: vi.fn(),
  mockProviderConfigurationError: vi.fn(),
  mockProviderForProject: vi.fn(),
  mockEnqueue: vi.fn(),
  mockResolveRef: vi.fn(),
  mockIntegrate: vi.fn(),
  mockPrepareReviewAuthority: vi.fn(),
  mockEnforceReviewAuthority: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../controllers/ProofGateController.js', () => ({
  ProofGateController: class MockProofGateController {
    run = mockControllerRun;
  },
}));
vi.mock('../../../providers/providerFactory.js', () => ({
  providerConfigurationError: mockProviderConfigurationError,
  providerForProject: mockProviderForProject,
}));
vi.mock('../../../events/outbox.js', () => ({ enqueueReconcile: mockEnqueue }));
vi.mock('../../../review/mergeReviewAuthority.js', () => ({
  prepareMergeReviewAuthority: mockPrepareReviewAuthority,
  enforceMergeReviewAuthority: mockEnforceReviewAuthority,
}));

import express from 'express';
import request from 'supertest';
import { approvalsRouter } from '../approvals.js';

const MISSION_ID = 'mission-review-authority';
const PROJECT_ID = 'project-review-authority';
const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const POLICY_HASH = '2'.repeat(64);
const PINNED = {
  pullRequestNumber: 493,
  baseSha: BASE_SHA,
  authorIdentity: 'patch-author',
  policyHash: POLICY_HASH,
};

const provider = {
  name: 'github',
  resolveRef: mockResolveRef,
  integrate: mockIntegrate,
  getRef: vi.fn(),
  listVerificationSignals: vi.fn(),
  listReviewSignals: vi.fn(),
  getPullRequestReviewContext: vi.fn(),
  compare: vi.fn(),
  createBranch: vi.fn(),
  commitPatch: vi.fn(),
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/approvals', approvalsRouter);
  return app;
}

function authSuccess() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user', email: FOUNDER_EMAIL } },
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

function twoEqUpdate(onUpdate = vi.fn()) {
  return (fields: Record<string, unknown>) => {
    onUpdate(fields);
    return {
      eq: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    };
  };
}

function setupProvider() {
  mockProviderConfigurationError.mockReturnValue(null);
  mockProviderForProject.mockReturnValue(provider);
  mockIntegrate.mockResolvedValue('merge-sha');
  mockPrepareReviewAuthority.mockResolvedValue(PINNED);
  mockEnforceReviewAuthority.mockResolvedValue({
    required: true,
    pullRequestNumber: 493,
    baseSha: BASE_SHA,
    diffHash: 'd'.repeat(64),
    policyHash: POLICY_HASH,
    witnessedReviewHashes: ['e'.repeat(64)],
    semanticClearCount: 1,
    deterministicClearCount: 1,
  });
}

function setupProofApproval(onMissionUpdate: ReturnType<typeof vi.fn>) {
  authSuccess();
  setupProvider();
  mockResolveRef.mockResolvedValue(HEAD_SHA);
  mockControllerRun.mockResolvedValue({
    status: 'converged',
    proposedActions: [],
    observedChanges: [],
    evidenceIds: [],
    requiresApproval: false,
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'missions') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {
                id: MISSION_ID,
                project_id: PROJECT_ID,
                status: 'in_review',
                branch_ref: 'fix/provider-grounded-review-main-472580',
                base_ref: 'main',
                policy_snapshot: { existing: 'preserved' },
              },
              error: null,
            }),
          }),
        }),
        update: twoEqUpdate(onMissionUpdate),
      };
    }
    if (table === 'projects') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: {
                slug: 'founder-control-room',
                repo_provider: 'github',
                repo_identifier: 'jussray/founder-control-room',
              },
              error: null,
            }),
          }),
        }),
      };
    }
    return {};
  });
}

function setupExecution(finalBaseSha = BASE_SHA) {
  authSuccess();
  setupProvider();
  mockResolveRef
    .mockResolvedValueOnce(HEAD_SHA)
    .mockResolvedValueOnce(finalBaseSha)
    .mockResolvedValueOnce(HEAD_SHA);

  const auditUpdate = vi.fn();
  const mission = {
    id: MISSION_ID,
    project_id: PROJECT_ID,
    status: 'approved',
    branch_ref: 'fix/provider-grounded-review-main-472580',
    required_checks: ['typecheck'],
    policy_snapshot: {
      expectedHeadSha: HEAD_SHA,
      independentReview: PINNED,
    },
  };

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'missions') {
      return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mission, error: null }) }) }),
        update: twoEqUpdate(),
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
                      maybeSingle: () => Promise.resolve({ data: { id: 'proof', status: 'pass' }, error: null }),
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
        insert: () => ({
          select: () => ({ single: () => Promise.resolve({ data: { id: 'execution-id' }, error: null }) }),
        }),
        update: (fields: Record<string, unknown>) => {
          auditUpdate(fields);
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        },
      };
    }
    if (table === 'projects') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {
                id: PROJECT_ID,
                slug: 'founder-control-room',
                repo_provider: 'github',
                repo_identifier: 'jussray/founder-control-room',
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
                data: [{
                  kind: 'typecheck',
                  status: 'pass',
                  commit_sha: HEAD_SHA,
                  provider: 'github',
                  created_at: new Date().toISOString(),
                }],
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    return {};
  });

  return { auditUpdate };
}

describe('approvals provider-grounded review membrane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pins provider-derived review authority together with the exact approved head', async () => {
    const onMissionUpdate = vi.fn();
    setupProofApproval(onMissionUpdate);

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({
        gateId: 'merge',
        evidence: {
          filesChanged: ['src/example.ts'],
          behaviorChanged: 'review membrane',
          checksRun: ['typecheck'],
          failures: [],
          securityImpact: 'review hardening',
          deploymentImpact: 'none',
          rollbackPath: 'revert',
          unresolvedRisks: [],
        },
        independentReview: { pullRequestNumber: 493 },
      });

    expect(response.status).toBe(200);
    expect(mockPrepareReviewAuthority).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headRef: 'fix/provider-grounded-review-main-472580',
      headSha: HEAD_SHA,
      request: { pullRequestNumber: 493 },
    }));
    expect(onMissionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved',
      policy_snapshot: {
        existing: 'preserved',
        expectedHeadSha: HEAD_SHA,
        independentReview: PINNED,
      },
    }));
  });

  it('re-reads both base and head after review before provider integration', async () => {
    setupExecution();

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'review-clear',
        payload: {
          head: 'fix/provider-grounded-review-main-472580',
          base: 'main',
          expectedHeadSha: HEAD_SHA,
          independentReviewReceipts: [{ reviewHash: 'e'.repeat(64) }],
        },
      });

    expect(response.status).toBe(200);
    expect(mockEnforceReviewAuthority).toHaveBeenCalledWith(expect.objectContaining({
      headRef: 'fix/provider-grounded-review-main-472580',
      headSha: HEAD_SHA,
      pinned: PINNED,
    }));
    expect(mockResolveRef).toHaveBeenNthCalledWith(1, 'founder-control-room', 'fix/provider-grounded-review-main-472580');
    expect(mockResolveRef).toHaveBeenNthCalledWith(2, 'founder-control-room', 'main');
    expect(mockResolveRef).toHaveBeenNthCalledWith(3, 'founder-control-room', 'fix/provider-grounded-review-main-472580');
    expect(mockEnforceReviewAuthority.mock.invocationCallOrder[0]).toBeLessThan(mockIntegrate.mock.invocationCallOrder[0]);
    expect(mockResolveRef.mock.invocationCallOrder[2]).toBeLessThan(mockIntegrate.mock.invocationCallOrder[0]);
    expect(mockIntegrate).toHaveBeenCalledWith(
      'founder-control-room',
      'main',
      'fix/provider-grounded-review-main-472580',
    );
  });

  it('fails closed when main moves after independent review', async () => {
    setupExecution('c'.repeat(40));

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'base-moved',
        payload: {
          head: 'fix/provider-grounded-review-main-472580',
          base: 'main',
          expectedHeadSha: HEAD_SHA,
          independentReviewReceipts: [{ reviewHash: 'e'.repeat(64) }],
        },
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/Base moved after independent review/);
    expect(mockIntegrate).not.toHaveBeenCalled();
  });
});
