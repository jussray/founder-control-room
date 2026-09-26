import { describe, expect, it } from 'vitest';
import type {
  GitHubChangeGenealogyEvidence,
  GitHubChangeGenealogyReaderLike,
} from '../../providers/GitHubChangeGenealogyReader.js';
import { auditGitHubChangeGenealogy } from './changeGenealogy.js';

const MAIN = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const COMMIT_A = 'c'.repeat(40);
const COMMIT_B = 'd'.repeat(40);
const DIRECT = 'e'.repeat(40);
const NOW = new Date('2026-09-23T04:30:00.000Z');

function evidence(overrides: Partial<GitHubChangeGenealogyEvidence> = {}): GitHubChangeGenealogyEvidence {
  return {
    repository: 'jussray/founder-control-room',
    defaultBranch: 'main',
    finalDefaultBranch: 'main',
    initialDefaultBranchSha: MAIN,
    finalDefaultBranchSha: MAIN,
    observedAt: '2026-09-23T04:29:59.000Z',
    limit: 10,
    includeComments: true,
    includeDiff: true,
    pullRequests: [{
      pullRequest: {
        number: 900,
        title: 'genealogy',
        state: 'open',
        draft: false,
        baseSha: MAIN,
        headSha: HEAD,
        mergeCommitSha: null,
        createdAt: '2026-09-22T00:00:00.000Z',
        updatedAt: '2026-09-23T00:00:00.000Z',
        mergedAt: null,
        authorIdentity: 'jussray',
      },
      commits: [
        {
          sha: COMMIT_A,
          parents: [MAIN],
          message: 'first change',
          authorIdentity: 'jussray',
          authoredAt: '2026-09-22T01:00:00.000Z',
          committedAt: '2026-09-22T01:00:00.000Z',
        },
        {
          sha: COMMIT_B,
          parents: [COMMIT_A],
          message: 'repair first change',
          authorIdentity: 'jussray',
          authoredAt: '2026-09-22T02:00:00.000Z',
          committedAt: '2026-09-22T02:00:00.000Z',
        },
      ],
      comments: [{
        id: '1',
        kind: 'review',
        authorIdentity: 'reviewer',
        createdAt: '2026-09-22T03:00:00.000Z',
        updatedAt: '2026-09-22T03:00:00.000Z',
        commitSha: COMMIT_B,
        path: null,
        state: 'approved',
        bodyExcerpt: 'reviewed',
      }],
      files: [{ path: 'src/a.ts', status: 'modified', additions: 3, deletions: 1, changes: 4 }],
    }],
    defaultBranchCommits: [{
      sha: DIRECT,
      parents: [MAIN],
      message: 'unattributed branch change',
      authorIdentity: 'jussray',
      authoredAt: '2026-09-23T01:00:00.000Z',
      committedAt: '2026-09-23T01:00:00.000Z',
      associatedPullRequests: [],
      attribution: 'direct_candidate',
    }],
    findings: [],
    ...overrides,
  };
}

function reader(value: GitHubChangeGenealogyEvidence): GitHubChangeGenealogyReaderLike {
  return { readGenealogyEvidence: async () => value };
}

describe('GitHub change genealogy audit', () => {
  it('defaults to ten PRs with comments and diff evidence while preserving every indexed commit', async () => {
    const result = await auditGitHubChangeGenealogy(
      reader(evidence()),
      { repository: 'jussray/founder-control-room' },
      () => NOW,
    );

    expect(result.verdict).toBe('evidence_complete');
    expect(result.window).toMatchObject({
      limit: 10,
      includeComments: true,
      includeDiff: true,
      indexedPullRequestCommits: 2,
    });
    expect(result.pullRequests[0]?.commits.map((commit) => commit.sha)).toEqual([COMMIT_A, COMMIT_B]);
    expect(result.defaultBranchCommits[0]).toMatchObject({
      sha: DIRECT,
      attribution: 'direct_candidate',
      associatedPullRequests: [],
    });
    expect(result.proof).toMatchObject({
      defaultBranchStableAcrossRead: true,
      evidenceStableAcrossRead: true,
    });
    expect(result.boundary).toMatchObject({
      evidenceAuditOnly: true,
      patchBodiesReturned: false,
      commitIdentitiesIndexed: true,
      directCommitClassificationIsCandidateOnly: true,
      mergeApproved: false,
      mutationPerformed: false,
    });
  });

  it('keeps independent collection failures as independent receipts', async () => {
    const result = await auditGitHubChangeGenealogy(
      reader(evidence({
        findings: [
          { code: 'pr_comment_collection_unavailable', scope: 'pr:900:comments' },
          { code: 'default_branch_history_truncated', scope: 'branch:main:commits' },
        ],
      })),
      { repository: 'jussray/founder-control-room' },
      () => NOW,
    );

    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.failureReceipts).toHaveLength(2);
    expect(new Set(result.failureReceipts.map((receipt) => receipt.receiptId)).size).toBe(2);
    expect(result.failureReceipts.map((receipt) => receipt.scope)).toEqual([
      'pr:900:comments',
      'branch:main:commits',
    ]);
  });

  it('expires the window when the default branch SHA moves during collection', async () => {
    const moved = 'f'.repeat(40);
    const result = await auditGitHubChangeGenealogy(
      reader(evidence({
        finalDefaultBranchSha: moved,
        findings: [{ code: 'default_branch_changed_during_collection', scope: 'repository:default_branch' }],
      })),
      { repository: 'jussray/founder-control-room' },
      () => NOW,
    );

    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.proof?.defaultBranchStableAcrossRead).toBe(false);
    expect(result.failureReceipts[0]?.code).toBe('default_branch_changed_during_collection');
  });

  it('expires the window when the repository default branch name changes', async () => {
    const result = await auditGitHubChangeGenealogy(
      reader(evidence({
        finalDefaultBranch: 'release',
        findings: [{ code: 'default_branch_changed_during_collection', scope: 'repository:default_branch' }],
      })),
      { repository: 'jussray/founder-control-room' },
      () => NOW,
    );

    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.finalDefaultBranch).toBe('release');
    expect(result.proof?.defaultBranchStableAcrossRead).toBe(false);
  });

  it('classifies a pull request moving during collection as conflicted evidence', async () => {
    const result = await auditGitHubChangeGenealogy(
      reader(evidence({
        findings: [{ code: 'pull_request_changed_during_collection', scope: 'pr:900' }],
      })),
      { repository: 'jussray/founder-control-room' },
      () => NOW,
    );

    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.proof?.evidenceStableAcrossRead).toBe(false);
    expect(result.failureReceipts[0]?.code).toBe('pull_request_changed_during_collection');
  });
});
