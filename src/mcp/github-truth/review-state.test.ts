import { describe, expect, it } from 'vitest';
import { evaluateGitHubPrAuditEvidence } from './verification.js';
import type { GitHubPrObservation, GitHubPrReviewObservation } from './types.js';

const HEAD = 'a'.repeat(40);
const OLD_HEAD = 'b'.repeat(40);
const BASE = 'c'.repeat(40);
const CHECKED_AT = '2026-08-28T20:00:00.000Z';

function pull(): GitHubPrObservation {
  return {
    number: 702,
    title: 'GitHub truth MCP',
    state: 'open',
    draft: false,
    baseRef: 'main',
    headRef: 'feat/github-truth-mcp-v0-core',
    baseSha: BASE,
    headSha: HEAD,
    mergeable: true,
    changedFiles: 1,
    additions: 1,
    deletions: 0,
    commits: 2,
    updatedAt: CHECKED_AT,
    url: 'https://github.com/jussray/founder-control-room/pull/702',
  };
}

function review(
  id: string,
  state: string,
  commitSha: string,
  submittedAt: string,
): GitHubPrReviewObservation {
  return {
    id,
    reviewer: 'reviewer-a',
    state,
    commitSha,
    submittedAt,
  };
}

function evaluate(reviews: GitHubPrReviewObservation[]) {
  return evaluateGitHubPrAuditEvidence({
    repository: 'jussray/founder-control-room',
    initialPullRequest: pull(),
    finalPullRequest: pull(),
    checks: [{
      id: 'check-1',
      name: 'CI',
      status: 'completed',
      conclusion: 'success',
      headSha: HEAD,
    }],
    commitStatuses: [],
    workflows: [],
    reviews,
    changedFiles: [{ path: 'src/example.ts', status: 'modified', additions: 1, deletions: 0 }],
    evidenceCoverage: {
      checksComplete: true,
      commitStatusesComplete: true,
      workflowsComplete: true,
      reviewsComplete: true,
      changedFilesComplete: true,
    },
    checkedAt: CHECKED_AT,
  });
}

describe('GitHub PR review-state reduction', () => {
  it('preserves an outstanding old-head change request after a new commit is pushed', () => {
    const result = evaluate([
      review('review-change', 'changes_requested', OLD_HEAD, '2026-08-28T18:00:00.000Z'),
    ]);

    expect(result.summary.reviewDecision).toBe('changes_requested');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'review_changes_requested', severity: 'blocker' }),
    ]));
  });

  it('does not let a later comment clear an outstanding change request', () => {
    const result = evaluate([
      review('review-change', 'changes_requested', OLD_HEAD, '2026-08-28T18:00:00.000Z'),
      review('review-comment', 'commented', HEAD, '2026-08-28T18:30:00.000Z'),
    ]);

    expect(result.summary.reviewDecision).toBe('changes_requested');
  });

  it('lets a later current-head approval clear the change request and count as approval', () => {
    const result = evaluate([
      review('review-change', 'changes_requested', OLD_HEAD, '2026-08-28T18:00:00.000Z'),
      review('review-approve', 'approved', HEAD, '2026-08-28T19:00:00.000Z'),
    ]);

    expect(result.summary.reviewDecision).toBe('approved');
    expect(result.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'review_changes_requested' }),
    ]));
  });

  it('lets an old-head approval clear the change request without counting as current approval', () => {
    const result = evaluate([
      review('review-change', 'changes_requested', OLD_HEAD, '2026-08-28T18:00:00.000Z'),
      review('review-approve-old', 'approved', OLD_HEAD, '2026-08-28T19:00:00.000Z'),
    ]);

    expect(result.summary.reviewDecision).toBe('none');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'review_approval_stale_for_head_sha', severity: 'warning' }),
    ]));
  });
});
