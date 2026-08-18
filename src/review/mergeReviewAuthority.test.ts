import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryProvider } from '../providers/RepositoryProvider.js';

const { mockEvaluate, mockDiffHash, mockPolicyHash } = vi.hoisted(() => ({
  mockEvaluate: vi.fn(),
  mockDiffHash: vi.fn(),
  mockPolicyHash: vi.fn(),
}));

vi.mock('./independentReviewGate.js', () => ({
  evaluateIndependentReviewGate: mockEvaluate,
  independentReviewDiffHash: mockDiffHash,
  independentReviewPolicyHash: mockPolicyHash,
}));

import {
  enforceMergeReviewAuthority,
  prepareMergeReviewAuthority,
  serverOwnedIndependentReviewPolicy,
} from './mergeReviewAuthority.js';

const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const DIFF_HASH = '1'.repeat(64);
const POLICY_HASH = '2'.repeat(64);
const REVIEW_HASH = '3'.repeat(64);

function env(reviewers = 'trusted-human-reviewer'): NodeJS.ProcessEnv {
  return { FCR_TRUSTED_SEMANTIC_REVIEWER_IDS: reviewers };
}

function reviewReceipt() {
  return {
    pullRequestNumber: 491,
    diffHash: 'caller-controlled-diff-hash',
    policyHash: 'caller-controlled-policy-hash',
    reviewHash: REVIEW_HASH,
  };
}

function provider() {
  return {
    name: 'github',
    resolveRef: vi.fn().mockResolvedValue(BASE_SHA),
    getPullRequestReviewContext: vi.fn().mockResolvedValue({
      number: 491,
      repository: 'jussray/founder-control-room',
      headRepository: 'jussray/founder-control-room',
      baseRef: 'main',
      headRef: 'fix/provider-grounded-review',
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      authorIdentity: 'patch-author',
    }),
    compare: vi.fn().mockResolvedValue({
      base: BASE_SHA,
      head: HEAD_SHA,
      aheadBy: 1,
      behindBy: 0,
      files: [{
        path: 'src/review/example.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: '@@ -1 +1 @@',
      }],
    }),
    getRef: vi.fn().mockResolvedValue({ name: HEAD_SHA, commitSha: HEAD_SHA }),
    listVerificationSignals: vi.fn().mockResolvedValue([]),
    listReviewSignals: vi.fn().mockResolvedValue([]),
  } as unknown as RepositoryProvider;
}

function pinned() {
  return {
    pullRequestNumber: 491,
    baseSha: BASE_SHA,
    authorIdentity: 'patch-author',
    policyHash: POLICY_HASH,
  };
}

describe('provider-grounded merge review authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPolicyHash.mockReturnValue(POLICY_HASH);
    mockDiffHash.mockReturnValue(DIFF_HASH);
    mockEvaluate.mockResolvedValue({
      reviewGateSatisfied: true,
      mergeAuthorized: false,
      executionAuthorized: false,
      witnessedReviewHashes: [REVIEW_HASH],
      semanticClearCount: 1,
      deterministicClearCount: 1,
      blockers: [],
    });
  });

  it('keeps server-owned reviewer trust fixed and rejects bot identities', () => {
    expect(serverOwnedIndependentReviewPolicy(env('reviewer-one'))).toEqual({
      requiredSemanticReviews: 1,
      requireDeterministicReview: true,
      blockOnP2: true,
      trustedSemanticReviewerIds: ['reviewer-one'],
    });
    expect(() => serverOwnedIndependentReviewPolicy({})).toThrow(/FCR_TRUSTED_SEMANTIC_REVIEWER_IDS/);
    expect(() => serverOwnedIndependentReviewPolicy(env('reviewer,REVIEWER'))).toThrow(/must be unique/);
    expect(() => serverOwnedIndependentReviewPolicy(env('review-app[bot]'))).toThrow(/cannot contain GitHub App bot/);
  });

  it('does not widen founder review authority to unrelated repositories', async () => {
    const repoProvider = provider();
    await expect(prepareMergeReviewAuthority({
      provider: repoProvider,
      projectId: 'other-project',
      repository: 'jussray/other-project',
      baseRef: 'main',
      headRef: 'feature',
      headSha: HEAD_SHA,
      request: undefined,
    })).resolves.toBeNull();
    expect(repoProvider.getPullRequestReviewContext).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied reviewer policy at founder approval time', async () => {
    await expect(prepareMergeReviewAuthority({
      provider: provider(),
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headRef: 'fix/provider-grounded-review',
      headSha: HEAD_SHA,
      request: {
        pullRequestNumber: 491,
        policy: { trustedSemanticReviewerIds: ['caller-reviewer'] },
      },
      env: env(),
    })).rejects.toThrow(/server-owned/);
  });

  it('pins provider PR base, author, and server policy hash at founder approval time', async () => {
    const repoProvider = provider();
    const result = await prepareMergeReviewAuthority({
      provider: repoProvider,
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headRef: 'fix/provider-grounded-review',
      headSha: HEAD_SHA,
      request: { pullRequestNumber: 491 },
      env: env(),
    });

    expect(repoProvider.getPullRequestReviewContext).toHaveBeenCalledWith('founder-control-room', 491);
    expect(repoProvider.resolveRef).toHaveBeenCalledWith('founder-control-room', 'main');
    expect(mockPolicyHash).toHaveBeenCalledWith(expect.objectContaining({
      trustedSemanticReviewerIds: ['trusted-human-reviewer'],
      requireDeterministicReview: true,
      blockOnP2: true,
    }));
    expect(result).toEqual({
      pullRequestNumber: 491,
      baseSha: BASE_SHA,
      authorIdentity: 'patch-author',
      policyHash: POLICY_HASH,
    });
  });

  it('fails founder approval when the mutable base already differs from provider PR identity', async () => {
    const repoProvider = provider();
    vi.mocked(repoProvider.resolveRef).mockResolvedValue('c'.repeat(40));
    await expect(prepareMergeReviewAuthority({
      provider: repoProvider,
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headRef: 'fix/provider-grounded-review',
      headSha: HEAD_SHA,
      request: { pullRequestNumber: 491 },
      env: env(),
    })).rejects.toThrow(/base branch moved/);
  });

  it('derives PR identity, diff hash, policy hash and author from provider/server truth rather than receipts', async () => {
    const repoProvider = provider();
    const receipts = [reviewReceipt()];
    const result = await enforceMergeReviewAuthority({
      provider: repoProvider,
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headRef: 'fix/provider-grounded-review',
      headSha: HEAD_SHA,
      pinned: pinned(),
      payload: { independentReviewReceipts: receipts },
      env: env(),
    });

    expect(repoProvider.getPullRequestReviewContext).toHaveBeenCalledWith('founder-control-room', 491);
    expect(repoProvider.compare).toHaveBeenCalledWith('founder-control-room', BASE_SHA, HEAD_SHA);
    expect(mockEvaluate).toHaveBeenCalledWith(
      repoProvider,
      {
        projectId: 'founder-control-room',
        repository: 'jussray/founder-control-room',
        pullRequestNumber: 491,
        baseSha: BASE_SHA,
        headSha: HEAD_SHA,
        diffHash: DIFF_HASH,
        policyHash: POLICY_HASH,
        authorIdentity: 'patch-author',
      },
      receipts,
      {
        requiredSemanticReviews: 1,
        requireDeterministicReview: true,
        blockOnP2: true,
        trustedSemanticReviewerIds: ['trusted-human-reviewer'],
      },
    );
    expect(result).toMatchObject({
      required: true,
      pullRequestNumber: 491,
      baseSha: BASE_SHA,
      diffHash: DIFF_HASH,
      policyHash: POLICY_HASH,
      semanticClearCount: 1,
      deterministicClearCount: 1,
    });
  });

  it('fails closed if server reviewer policy changes after founder approval', async () => {
    mockPolicyHash.mockReturnValue('9'.repeat(64));
    await expect(enforceMergeReviewAuthority({
      provider: provider(),
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headRef: 'fix/provider-grounded-review',
      headSha: HEAD_SHA,
      pinned: pinned(),
      payload: { independentReviewReceipts: [reviewReceipt()] },
      env: env(),
    })).rejects.toThrow(/policy changed after founder approval/);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('fails closed if provider PR identity changes after founder approval', async () => {
    const repoProvider = provider();
    vi.mocked(repoProvider.getPullRequestReviewContext!).mockResolvedValue({
      number: 491,
      repository: 'jussray/founder-control-room',
      headRepository: 'jussray/founder-control-room',
      baseRef: 'main',
      headRef: 'fix/provider-grounded-review',
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      authorIdentity: 'different-author',
    });
    await expect(enforceMergeReviewAuthority({
      provider: repoProvider,
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headRef: 'fix/provider-grounded-review',
      headSha: HEAD_SHA,
      pinned: pinned(),
      payload: { independentReviewReceipts: [reviewReceipt()] },
      env: env(),
    })).rejects.toThrow(/provider PR identity changed/);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it('keeps evaluator blockers merge-blocking', async () => {
    mockEvaluate.mockResolvedValue({
      reviewGateSatisfied: false,
      mergeAuthorized: false,
      executionAuthorized: false,
      witnessedReviewHashes: [],
      semanticClearCount: 0,
      deterministicClearCount: 1,
      blockers: ['Missing current exact-head provider PR-review witness for trusted-human-reviewer'],
    });
    await expect(enforceMergeReviewAuthority({
      provider: provider(),
      projectId: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      baseRef: 'main',
      headRef: 'fix/provider-grounded-review',
      headSha: HEAD_SHA,
      pinned: pinned(),
      payload: { independentReviewReceipts: [reviewReceipt()] },
      env: env(),
    })).rejects.toThrow(/exact-head provider PR-review witness/);
  });
});
