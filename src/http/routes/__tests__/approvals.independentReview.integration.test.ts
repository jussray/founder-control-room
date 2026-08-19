import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetUser,
  supabaseMock,
  mockControllerRun,
  mockProviderConfigurationError,
  mockProviderForProject,
  mockEnqueue,
  mockResolveRef,
  mockGetPullRequestReviewContext,
  mockCompare,
  mockIntegrate,
  mockEvaluateIndependentReviewGate,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  mockControllerRun: vi.fn(),
  mockProviderConfigurationError: vi.fn(),
  mockProviderForProject: vi.fn(),
  mockEnqueue: vi.fn(),
  mockResolveRef: vi.fn(),
  mockGetPullRequestReviewContext: vi.fn(),
  mockCompare: vi.fn(),
  mockIntegrate: vi.fn(),
  mockEvaluateIndependentReviewGate: vi.fn(),
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
vi.mock('../../../review/independentReviewGate.js', () => ({
  FCR_FOUNDER_FINAL_REVIEW_POLICY: {
    requiredSemanticReviews: 0,
    requireDeterministicReview: true,
    blockOnP2: true,
    trustedSemanticReviewerIds: [],
    founderFinalApprovalRequired: true,
  },
  evaluateIndependentReviewGate: mockEvaluateIndependentReviewGate,
  independentReviewDiffHash: () => 'd'.repeat(64),
  independentReviewPolicyHash: () => '2'.repeat(64),
}));

import express from 'express';
import request from 'supertest';
import { approvalsRouter } from '../approvals.js';

const MISSION_ID = 'mission-fcr-review-001';
const PROJECT_ID = 'project-fcr-review-001';
const EXECUTION_ID = 'execution-fcr-review-001';
const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const POLICY_HASH = '2'.repeat(64);
const REVIEW_HASH = '3'.repeat(64);

const reviewPolicy = {
  requiredSemanticReviews: 1,
  requireDeterministicReview: true,
  blockOnP2: true,
  trustedSemanticReviewerIds: ['trusted-reviewer'],
};

const founderFinalPolicy = {
  requiredSemanticReviews: 0,
  requireDeterministicReview: true,
  blockOnP2: true,
  trustedSemanticReviewerIds: [],
  founderFinalApprovalRequired: true,
};

const validEvidence = {
  filesChanged: ['src/example.ts'],
  behaviorChanged: 'Exact-head verification completed.',
  checksRun: ['typecheck'],
  failures: [],
  securityImpact: 'none',
  deploymentImpact: 'none',
  rollbackPath: 'Revert the merge commit.',
  unresolvedRisks: [],
};

const provider = {
  name: 'github',
  resolveRef: mockResolveRef,
  getPullRequestReviewContext: mockGetPullRequestReviewContext,
  compare: mockCompare,
  integrate: mockIntegrate,
  getRef: vi.fn(),
  listVerificationSignals: vi.fn(),
  listReviewSignals: vi.fn(),
  createBranch: vi.fn(),
  commitPatch: vi.fn(),
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/approvals', approvalsRouter);
  return app;
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

function authSuccess() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user', email: FOUNDER_EMAIL } },
    error: null,
  });
}

function providerDefaults() {
  mockProviderConfigurationError.mockReturnValue(null);
  mockProviderForProject.mockReturnValue(provider);
  mockResolveRef.mockResolvedValue(HEAD_SHA);
  mockGetPullRequestReviewContext.mockResolvedValue({
    number: 470,
    repository: 'jussray/founder-control-room',
    headRepository: 'jussray/founder-control-room',
    baseRef: 'main',
    headRef: 'mission/review-gate',
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    authorIdentity: 'patch-author',
  });
  mockCompare.mockResolvedValue({
    base: BASE_SHA,
    head: HEAD_SHA,
    aheadBy: 1,
    behindBy: 0,
    files: [{ path: 'src/example.ts', status: 'modified', additions: 1, deletions: 0, patch: '@@ example @@' }],
  });
  mockIntegrate.mockResolvedValue('merge-sha');
}

function proofGateStack(onMissionUpdate = vi.fn()) {
  authSuccess();
  providerDefaults();
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
                branch_ref: 'mission/review-gate',
                base_ref: 'main',
                policy_snapshot: { existing: 'preserved' },
              },
              error: null,
            }),
          }),
        }),
        update: (fields: Record<string, unknown>) => {
          onMissionUpdate(fields);
          return twoEqUpdate();
        },
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

function executeStack(options: { founderFinal?: boolean; approvedAt?: string; founderIdentity?: string } = {}) {
  authSuccess();
  providerDefaults();

  const founderFinal = options.founderFinal === true;
  const independentReview = {
    pullRequestNumber: 470,
    baseSha: BASE_SHA,
    authorIdentity: 'patch-author',
    policy: founderFinal ? founderFinalPolicy : reviewPolicy,
    policyHash: POLICY_HASH,
  };
  const policySnapshot: Record<string, unknown> = {
    expectedHeadSha: HEAD_SHA,
    independentReview,
  };
  if (founderFinal) {
    policySnapshot.founderFinalReview = {
      contract: 'juss-v10/founder-final-merge@v1',
      pullRequestNumber: 470,
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      founderIdentity: options.founderIdentity ?? FOUNDER_EMAIL,
      approvedAt: options.approvedAt ?? new Date().toISOString(),
    };
  }

  const mission = {
    id: MISSION_ID,
    project_id: PROJECT_ID,
    status: 'approved',
    branch_ref: 'mission/review-gate',
    required_checks: ['typecheck'],
    policy_snapshot: policySnapshot,
  };

  const auditUpdate = vi.fn(() => twoEqUpdate());
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'missions') {
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: mission, error: null }) }),
        }),
        update: () => twoEqUpdate(),
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
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
        insert: () => ({
          select: () => ({ single: () => Promise.resolve({ data: { id: EXECUTION_ID }, error: null }) }),
        }),
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

describe('FCR independent review merge membrane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses to approve an FCR merge without founder-final or legacy review metadata', async () => {
    const onMissionUpdate = vi.fn();
    proofGateStack(onMissionUpdate);

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({ gateId: 'merge', evidence: validEvidence });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('FOUNDER_FINAL_REVIEW_REQUIRED');
    expect(onMissionUpdate).not.toHaveBeenCalled();
  });

  it('pins exact provider PR identity and founder-final authority from the authenticated founder', async () => {
    const onMissionUpdate = vi.fn();
    proofGateStack(onMissionUpdate);

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({
        gateId: 'merge',
        evidence: validEvidence,
        founderFinalReview: { pullRequestNumber: 470, confirmExactCandidate: true },
      });

    expect(response.status).toBe(200);
    expect(mockGetPullRequestReviewContext).toHaveBeenCalledWith('founder-control-room', 470);
    expect(onMissionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved',
      policy_snapshot: expect.objectContaining({
        existing: 'preserved',
        expectedHeadSha: HEAD_SHA,
        independentReview: {
          pullRequestNumber: 470,
          baseSha: BASE_SHA,
          authorIdentity: 'patch-author',
          policy: founderFinalPolicy,
          policyHash: POLICY_HASH,
        },
        founderFinalReview: expect.objectContaining({
          contract: 'juss-v10/founder-final-merge@v1',
          pullRequestNumber: 470,
          baseSha: BASE_SHA,
          headSha: HEAD_SHA,
          founderIdentity: FOUNDER_EMAIL,
          approvedAt: expect.any(String),
        }),
      }),
    }));
  });

  it('keeps the prior trusted-human review mode compatible for already-pinned missions', async () => {
    const onMissionUpdate = vi.fn();
    proofGateStack(onMissionUpdate);

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/run-proof-gate`)
      .set('Authorization', BEARER)
      .send({
        gateId: 'merge',
        evidence: validEvidence,
        independentReview: { pullRequestNumber: 470, policy: reviewPolicy },
      });

    expect(response.status).toBe(200);
    expect(onMissionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      policy_snapshot: expect.objectContaining({
        independentReview: expect.objectContaining({ policy: reviewPolicy }),
      }),
    }));
  });

  it('records a failed reservation and never integrates when independent review is not satisfied', async () => {
    const { auditUpdate } = executeStack();
    mockEvaluateIndependentReviewGate.mockResolvedValue({
      reviewGateSatisfied: false,
      mergeAuthorized: false,
      executionAuthorized: false,
      witnessedReviewHashes: [],
      semanticClearCount: 0,
      deterministicClearCount: 0,
      blockers: ['Missing current exact-head provider PR-review witness for trusted-reviewer'],
    });

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'review-blocked',
        payload: {
          head: 'mission/review-gate',
          base: 'main',
          expectedHeadSha: HEAD_SHA,
          independentReviews: [],
        },
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/Independent review gate blocked/);
    expect(mockIntegrate).not.toHaveBeenCalled();
    expect(auditUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('integrates founder-final only after deterministic review and exact authenticated founder receipt both match', async () => {
    executeStack({ founderFinal: true });
    mockEvaluateIndependentReviewGate.mockResolvedValue({
      reviewGateSatisfied: true,
      mergeAuthorized: false,
      executionAuthorized: false,
      witnessedReviewHashes: [REVIEW_HASH],
      semanticClearCount: 0,
      deterministicClearCount: 1,
      blockers: [],
    });

    const independentReviews = [{ reviewHash: REVIEW_HASH }];
    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'founder-final-clear',
        payload: {
          head: 'mission/review-gate',
          base: 'main',
          expectedHeadSha: HEAD_SHA,
          independentReviews,
        },
      });

    expect(response.status).toBe(200);
    expect(mockEvaluateIndependentReviewGate).toHaveBeenCalledWith(
      provider,
      expect.objectContaining({
        pullRequestNumber: 470,
        baseSha: BASE_SHA,
        headSha: HEAD_SHA,
        authorIdentity: 'patch-author',
      }),
      independentReviews,
      founderFinalPolicy,
    );
    expect(mockResolveRef).toHaveBeenLastCalledWith('founder-control-room', 'mission/review-gate');
    expect(mockIntegrate).toHaveBeenCalledWith('founder-control-room', 'main', 'mission/review-gate');
    expect(response.body.result.independentReview).toMatchObject({
      semanticClearCount: 0,
      deterministicClearCount: 1,
      authorityMode: 'deterministic-review-then-founder-final',
    });
    expect(response.body.result.founderFinalReview).toMatchObject({
      contract: 'juss-v10/founder-final-merge@v1',
      pullRequestNumber: 470,
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      founderIdentity: FOUNDER_EMAIL,
    });
  });

  it('fails closed when the founder-final receipt belongs to another founder identity', async () => {
    executeStack({ founderFinal: true, founderIdentity: 'other-founder@example.com' });
    mockEvaluateIndependentReviewGate.mockResolvedValue({
      reviewGateSatisfied: true,
      mergeAuthorized: false,
      executionAuthorized: false,
      witnessedReviewHashes: [REVIEW_HASH],
      semanticClearCount: 0,
      deterministicClearCount: 1,
      blockers: [],
    });

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'founder-final-wrong-founder',
        payload: {
          head: 'mission/review-gate',
          base: 'main',
          expectedHeadSha: HEAD_SHA,
          independentReviews: [{ reviewHash: REVIEW_HASH }],
        },
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/founder receipt does not match/i);
    expect(mockEvaluateIndependentReviewGate).not.toHaveBeenCalled();
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it('fails closed when the founder-final receipt is stale', async () => {
    executeStack({ founderFinal: true, approvedAt: new Date(Date.now() - 16 * 60 * 1_000).toISOString() });

    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'founder-final-stale',
        payload: {
          head: 'mission/review-gate',
          base: 'main',
          expectedHeadSha: HEAD_SHA,
          independentReviews: [{ reviewHash: REVIEW_HASH }],
        },
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/stale or future-dated/i);
    expect(mockEvaluateIndependentReviewGate).not.toHaveBeenCalled();
    expect(mockIntegrate).not.toHaveBeenCalled();
  });

  it('integrates legacy mode only after exact provider PR identity, diff, policy, and independent gate all match', async () => {
    executeStack();
    mockEvaluateIndependentReviewGate.mockResolvedValue({
      reviewGateSatisfied: true,
      mergeAuthorized: false,
      executionAuthorized: false,
      witnessedReviewHashes: [REVIEW_HASH],
      semanticClearCount: 1,
      deterministicClearCount: 1,
      blockers: [],
    });

    const independentReviews = [{ reviewHash: REVIEW_HASH }];
    const response = await request(buildApp())
      .post(`/approvals/${MISSION_ID}/execute`)
      .set('Authorization', BEARER)
      .send({
        actionType: 'merge',
        idempotencyKey: 'review-clear',
        payload: {
          head: 'mission/review-gate',
          base: 'main',
          expectedHeadSha: HEAD_SHA,
          independentReviews,
        },
      });

    expect(response.status).toBe(200);
    expect(mockCompare).toHaveBeenCalledWith('founder-control-room', BASE_SHA, HEAD_SHA);
    expect(mockEvaluateIndependentReviewGate).toHaveBeenCalledWith(
      provider,
      expect.objectContaining({
        projectId: 'founder-control-room',
        repository: 'jussray/founder-control-room',
        pullRequestNumber: 470,
        baseSha: BASE_SHA,
        headSha: HEAD_SHA,
        diffHash: 'd'.repeat(64),
        policyHash: POLICY_HASH,
        authorIdentity: 'patch-author',
      }),
      independentReviews,
      reviewPolicy,
    );
    expect(mockIntegrate).toHaveBeenCalledWith('founder-control-room', 'main', 'mission/review-gate');
  });
});