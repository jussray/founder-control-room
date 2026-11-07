import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryProvider } from '../providers/RepositoryProvider.js';

const { mockEvaluate } = vi.hoisted(() => ({
  mockEvaluate: vi.fn(),
}));

vi.mock('./independentReviewGate.js', () => ({
  evaluateIndependentReviewGate: mockEvaluate,
}));

import { enforceMergeReviewAuthority } from './mergeReviewAuthority.js';

const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const DIFF_HASH = '1'.repeat(64);
const POLICY_HASH = '2'.repeat(64);

function provider() {
  return {
    getRef: vi.fn().mockResolvedValue({ name: 'main', commitSha: BASE_SHA }),
  } as unknown as RepositoryProvider;
}

function env(reviewers = 'independent-reviewer'): NodeJS.ProcessEnv {
  return { FCR_TRUSTED_SEMANTIC_REVIEWER_IDS: reviewers };
}

function payload() {
  return {
    independentReviewReceipts: [{
      pullRequestNumber: 484,
      diffHash: DIFF_HASH,
      policyHash: POLICY_HASH,
    }],
  };
}

describe('merge review authority bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvaluate.mockResolvedValue({
      reviewGateSatisfied: true,
      mergeAuthorized: false,
      executionAuthorized: false,
      witnessedReviewHashes: ['f'.repeat(64)],
      semanticClearCount: 1,
      deterministicClearCount: 1,
      blockers: [],
    });
  });

  it('does not widen the new gate to unrelated repositories', async () => {
    const repoProvider = provider();
    const result = await enforceMergeReviewAuthority({
      provider: repoProvider,
      projectId: 'other-project',
      repository: 'jussray/other-project',
      baseRef: 'main',
      headSha: HEAD_SHA,
      payload: {},
    });

    expect(result.required).toBe(false);
    expect(repoProvider.getRef).not.toHaveBeenCalled();
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('fails closed for FCR when review receipts are absent', async () => {
    await expect(enforceMergeReviewAuthority({
      provider: provider(),
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headSha: HEAD_SHA,
      payload: {},
      env: env(),
    })).rejects.toThrow(/independentReviewReceipts/);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('fails closed when server-owned trusted reviewer configuration is absent', async () => {
    await expect(enforceMergeReviewAuthority({
      provider: provider(),
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headSha: HEAD_SHA,
      payload: payload(),
      env: {},
    })).rejects.toThrow(/FCR_TRUSTED_SEMANTIC_REVIEWER_IDS/);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied reviewer policy instead of allowing trust redefinition', async () => {
    await expect(enforceMergeReviewAuthority({
      provider: provider(),
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headSha: HEAD_SHA,
      payload: {
        ...payload(),
        independentReviewPolicy: {
          requiredSemanticReviews: 1,
          requireDeterministicReview: false,
          blockOnP2: true,
          trustedSemanticReviewerIds: ['caller-chosen-reviewer'],
        },
      },
      env: env(),
    })).rejects.toThrow(/server-owned/);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('rejects duplicate server-configured reviewer identities', async () => {
    await expect(enforceMergeReviewAuthority({
      provider: provider(),
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headSha: HEAD_SHA,
      payload: payload(),
      env: env('Independent-Reviewer,independent-reviewer'),
    })).rejects.toThrow(/must be unique/);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('derives repository context and reviewer trust from server authority instead of caller policy', async () => {
    const repoProvider = provider();
    const requestPayload = payload();

    const result = await enforceMergeReviewAuthority({
      provider: repoProvider,
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headSha: HEAD_SHA,
      payload: requestPayload,
      env: env('trusted-human-reviewer'),
    });

    expect(repoProvider.getRef).toHaveBeenCalledWith('founder-control-room', 'main');
    expect(mockEvaluate).toHaveBeenCalledWith(
      repoProvider,
      {
        projectId: 'founder-control-room',
        repository: 'jussray/founder-control-room',
        pullRequestNumber: 484,
        baseSha: BASE_SHA,
        headSha: HEAD_SHA,
        diffHash: DIFF_HASH,
        policyHash: POLICY_HASH,
        authorIdentity: 'jussray',
      },
      requestPayload.independentReviewReceipts,
      {
        requiredSemanticReviews: 1,
        requireDeterministicReview: true,
        blockOnP2: true,
        trustedSemanticReviewerIds: ['trusted-human-reviewer'],
      },
    );
    expect(result).toMatchObject({
      required: true,
      semanticClearCount: 1,
      deterministicClearCount: 1,
    });
  });

  it('fails closed when the existing independent-review evaluator reports blockers', async () => {
    mockEvaluate.mockResolvedValue({
      reviewGateSatisfied: false,
      mergeAuthorized: false,
      executionAuthorized: false,
      witnessedReviewHashes: [],
      semanticClearCount: 0,
      deterministicClearCount: 1,
      blockers: ['Missing current exact-head provider PR-review witness for reviewer'],
    });

    await expect(enforceMergeReviewAuthority({
      provider: provider(),
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headSha: HEAD_SHA,
      payload: payload(),
      env: env(),
    })).rejects.toThrow(/exact-head provider PR-review witness/);
  });
});
