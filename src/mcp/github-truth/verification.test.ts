import { describe, expect, it } from 'vitest';
import { evaluateGitHubPrAuditEvidence } from './verification.js';
import type {
  GitHubPrCheckObservation,
  GitHubPrCommitStatusObservation,
  GitHubPrObservation,
  GitHubPrWorkflowObservation,
} from './types.js';

const HEAD = 'a'.repeat(40);
const OLD_HEAD = 'b'.repeat(40);
const BASE = 'c'.repeat(40);
const OTHER_BASE = 'd'.repeat(40);
const CHECKED_AT = '2026-08-25T23:00:00.000Z';

function pull(headSha = HEAD): GitHubPrObservation {
  return {
    number: 123,
    title: 'Guarded MCP change',
    state: 'open',
    draft: false,
    baseRef: 'main',
    headRef: 'feat/change',
    baseSha: BASE,
    headSha,
    mergeable: true,
    changedFiles: 2,
    additions: 20,
    deletions: 4,
    commits: 1,
    updatedAt: CHECKED_AT,
    url: 'https://github.com/jussray/founder-control-room/pull/123',
  };
}

function passingCheck(headSha = HEAD): GitHubPrCheckObservation {
  return {
    id: 'check-1',
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    headSha,
    completedAt: CHECKED_AT,
    detailsUrl: 'https://github.com/example/check/1',
  };
}

function commitStatus(state: string, headSha = HEAD): GitHubPrCommitStatusObservation {
  return {
    id: `status-${state}`,
    name: 'legacy-ci',
    state,
    headSha,
    updatedAt: CHECKED_AT,
    detailsUrl: 'https://github.com/example/status/1',
  };
}

function passingWorkflow(headSha = HEAD): GitHubPrWorkflowObservation {
  return {
    id: 'run-1',
    contextId: '10:pull_request',
    name: 'Quality Gate',
    status: 'completed',
    conclusion: 'success',
    headSha,
    runNumber: 10,
    runAttempt: 1,
    createdAt: CHECKED_AT,
    updatedAt: CHECKED_AT,
    detailsUrl: 'https://github.com/example/actions/runs/1',
  };
}

function evaluate(overrides: Partial<Parameters<typeof evaluateGitHubPrAuditEvidence>[0]> = {}) {
  return evaluateGitHubPrAuditEvidence({
    repository: 'jussray/founder-control-room',
    initialPullRequest: pull(),
    finalPullRequest: pull(),
    checks: [passingCheck()],
    commitStatuses: [],
    workflows: [passingWorkflow()],
    reviews: [],
    changedFiles: [{ path: 'src/example.ts', status: 'modified', additions: 10, deletions: 2 }],
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

describe('evaluateGitHubPrAuditEvidence', () => {
  it('returns evidence_complete when current CI is bound to a stable head SHA', () => {
    const result = evaluate();
    expect(result.verdict).toBe('evidence_complete');
    expect(result.summary.ciConclusion).toBe('pass');
    expect(result.verification).toMatchObject({
      headShaBound: true,
      ciBoundToHeadSha: true,
      evidenceCoverage: {
        checksComplete: true,
        commitStatusesComplete: true,
        workflowsComplete: true,
        reviewsComplete: true,
        changedFilesComplete: true,
      },
      freshness: 'current',
    });
    expect(result.boundary).toEqual({
      evidenceAuditOnly: true,
      mergeApproved: false,
      mutationPerformed: false,
    });
  });

  it('rejects passing CI from an old head SHA as stale evidence', () => {
    const result = evaluate({
      checks: [passingCheck(OLD_HEAD)],
      workflows: [passingWorkflow(OLD_HEAD)],
    });
    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.verification.ciBoundToHeadSha).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ci_stale_for_head_sha', severity: 'blocker' }),
    ]));
  });

  it('rejects a commit status observed on a different head SHA', () => {
    const result = evaluate({ commitStatuses: [commitStatus('success', OLD_HEAD)] });
    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.verification.ciBoundToHeadSha).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ci_stale_for_head_sha', severity: 'blocker' }),
    ]));
  });

  it('returns evidence_conflicted when the PR head changes during the audit', () => {
    const result = evaluate({ finalPullRequest: pull(OLD_HEAD) });
    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.verification.freshness).toBe('stale');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'head_sha_changed_during_audit' }),
    ]));
  });

  it('returns evidence_conflicted when load-bearing PR state changes without a head change', () => {
    const result = evaluate({
      finalPullRequest: {
        ...pull(),
        state: 'closed',
        draft: true,
        baseSha: OTHER_BASE,
        mergeable: false,
      },
    });
    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.summary).toMatchObject({
      prState: 'closed',
      draft: true,
      baseSha: OTHER_BASE,
      mergeable: false,
    });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'pr_truth_changed_during_audit', severity: 'blocker' }),
    ]));
  });

  it('treats missing CI as incomplete rather than passing', () => {
    const result = evaluate({ checks: [], commitStatuses: [], workflows: [] });
    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.summary.ciConclusion).toBe('unknown');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ci_missing_or_unknown' }),
    ]));
  });

  it('keeps failed current CI as complete evidence while reporting the failure', () => {
    const result = evaluate({
      checks: [{ ...passingCheck(), conclusion: 'failure' }],
      workflows: [passingWorkflow()],
    });
    expect(result.verdict).toBe('evidence_complete');
    expect(result.summary.ciConclusion).toBe('fail');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ci_failed', severity: 'blocker' }),
    ]));
  });

  it('treats a failing GitHub commit status as current CI failure', () => {
    const result = evaluate({ commitStatuses: [commitStatus('failure')] });
    expect(result.summary.ciConclusion).toBe('fail');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ci_failed', severity: 'blocker' }),
    ]));
  });

  it('treats a pending GitHub commit status as pending CI when no failure exists', () => {
    const result = evaluate({ commitStatuses: [commitStatus('pending')] });
    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.summary.ciConclusion).toBe('pending');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ci_pending', severity: 'warning' }),
    ]));
  });

  it('preserves a known CI failure even while another current signal is pending', () => {
    const result = evaluate({
      checks: [{ ...passingCheck(), conclusion: 'failure' }],
      workflows: [{ ...passingWorkflow(), status: 'in_progress', conclusion: undefined }],
    });
    expect(result.summary.ciConclusion).toBe('fail');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ci_failed', severity: 'blocker' }),
    ]));
    expect(result.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ci_pending' }),
    ]));
  });

  it('never claims complete evidence when a bounded GitHub collection is truncated', () => {
    const result = evaluate({
      evidenceCoverage: {
        checksComplete: false,
        commitStatusesComplete: true,
        workflowsComplete: true,
        reviewsComplete: true,
        changedFilesComplete: true,
      },
    });
    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.verification.freshness).toBe('unknown');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'evidence_collection_truncated', severity: 'blocker' }),
    ]));
  });

  it('never claims complete evidence when commit-status observations are truncated', () => {
    const result = evaluate({
      evidenceCoverage: {
        checksComplete: true,
        commitStatusesComplete: false,
        workflowsComplete: true,
        reviewsComplete: true,
        changedFilesComplete: true,
      },
    });
    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'evidence_collection_truncated', severity: 'blocker' }),
    ]));
  });

  it('uses the latest review event per reviewer so a later change request supersedes approval', () => {
    const result = evaluate({
      reviews: [
        {
          id: 'review-1',
          reviewer: 'reviewer-a',
          state: 'approved',
          commitSha: HEAD,
          submittedAt: '2026-08-25T22:00:00.000Z',
        },
        {
          id: 'review-2',
          reviewer: 'reviewer-a',
          state: 'changes_requested',
          commitSha: HEAD,
          submittedAt: '2026-08-25T22:30:00.000Z',
        },
      ],
    });
    expect(result.summary.reviewDecision).toBe('changes_requested');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'review_changes_requested', severity: 'blocker' }),
    ]));
  });

  it('does not count approval recorded against an older head as current approval', () => {
    const result = evaluate({
      reviews: [
        {
          id: 'review-old',
          reviewer: 'reviewer-a',
          state: 'approved',
          commitSha: OLD_HEAD,
          submittedAt: '2026-08-25T22:00:00.000Z',
        },
      ],
    });
    expect(result.summary.reviewDecision).toBe('none');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'review_approval_stale_for_head_sha', severity: 'warning' }),
    ]));
  });
});
