import { describe, expect, it } from 'vitest';
import { evaluateGitHubPrAuditEvidence } from './verification.js';
import type { GitHubPrObservation } from './types.js';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const CHECKED_AT = '2026-08-28T21:15:00.000Z';

function pull(updatedAt = '2026-08-28T21:00:00.000Z'): GitHubPrObservation {
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
    commits: 1,
    updatedAt,
    url: 'https://github.com/jussray/founder-control-room/pull/702',
  };
}

function evaluate(overrides: Partial<Parameters<typeof evaluateGitHubPrAuditEvidence>[0]> = {}) {
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
    reviews: [],
    changedFiles: [{ path: 'src/example.ts', status: 'modified', additions: 1, deletions: 0 }],
    evidenceCoverage: {
      checksComplete: true,
      commitStatusesComplete: true,
      workflowsComplete: true,
      reviewsComplete: true,
      changedFilesComplete: true,
    },
    checkedAt: CHECKED_AT,
    ...overrides,
  });
}

describe('GitHub PR review freshness', () => {
  it('conflicts the audit when GitHub updates the PR during evidence collection', () => {
    const result = evaluate({
      finalPullRequest: pull('2026-08-28T21:00:01.000Z'),
    });

    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.verification.freshness).toBe('stale');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'pr_truth_changed_during_audit',
        severity: 'blocker',
      }),
    ]));
  });

  it('refuses to publish approval when review history is truncated', () => {
    const result = evaluate({
      reviews: [{
        id: 'review-current',
        reviewer: 'reviewer-a',
        state: 'approved',
        commitSha: HEAD,
        submittedAt: '2026-08-28T20:59:00.000Z',
      }],
      evidenceCoverage: {
        checksComplete: true,
        commitStatusesComplete: true,
        workflowsComplete: true,
        reviewsComplete: false,
        changedFilesComplete: true,
      },
    });

    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.summary.reviewDecision).toBe('unknown');
    expect(result.verification.freshness).toBe('unknown');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'evidence_collection_truncated',
        severity: 'blocker',
      }),
      expect.objectContaining({
        code: 'review_decision_unknown_due_to_truncation',
        severity: 'warning',
      }),
    ]));
  });

  it('refuses to publish no-blocker review state when truncated history retained only comments', () => {
    const result = evaluate({
      reviews: [{
        id: 'review-comment',
        reviewer: 'reviewer-b',
        state: 'commented',
        commitSha: HEAD,
        submittedAt: '2026-08-28T20:59:30.000Z',
      }],
      evidenceCoverage: {
        checksComplete: true,
        commitStatusesComplete: true,
        workflowsComplete: true,
        reviewsComplete: false,
        changedFilesComplete: true,
      },
    });

    expect(result.summary.reviewDecision).toBe('unknown');
    expect(result.verdict).toBe('evidence_incomplete');
  });
});
