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

function payload() {
  return {
    independentReviewReceipts: [{
      pullRequestNumber: 484,
      diffHash: DIFF_HASH,
      policyHash: POLICY_HASH,
    }],
    independentReviewPolicy: {
      requiredSemanticReviews: 1,
      requireDeterministicReview: true,
      blockOnP2: true,
      trustedSemanticReviewerIds: ['independent-reviewer'],
    },
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
    })).rejects.toThrow(/independentReviewReceipts/);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('derives repository, current base SHA, exact head SHA, and founder author identity instead of trusting caller context', async () => {
    const repoProvider = provider();
    const requestPayload = payload();

    const result = await enforceMergeReviewAuthority({
      provider: repoProvider,
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headSha: HEAD_SHA,
      payload: requestPayload,
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
      requestPayload.independentReviewPolicy,
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
    })).rejects.toThrow(/exact-head provider PR-review witness/);
  });
});
