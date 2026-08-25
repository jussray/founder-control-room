import { describe, expect, it } from 'vitest';
import { evaluateGitHubPrAuditEvidence } from './verification.js';
import type {
  GitHubPrCheckObservation,
  GitHubPrObservation,
  GitHubPrWorkflowObservation,
} from './types.js';

const HEAD = 'a'.repeat(40);
const OLD_HEAD = 'b'.repeat(40);
const BASE = 'c'.repeat(40);
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

function passingWorkflow(headSha = HEAD): GitHubPrWorkflowObservation {
  return {
    id: 'run-1',
    name: 'Quality Gate',
    status: 'completed',
    conclusion: 'success',
    headSha,
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
    workflows: [passingWorkflow()],
    reviews: [],
    changedFiles: [{ path: 'src/example.ts', status: 'modified', additions: 10, deletions: 2 }],
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

  it('returns evidence_conflicted when the PR head changes during the audit', () => {
    const result = evaluate({ finalPullRequest: pull(OLD_HEAD) });
    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.verification.freshness).toBe('stale');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'head_sha_changed_during_audit' }),
    ]));
  });

  it('treats missing CI as incomplete rather than passing', () => {
    const result = evaluate({ checks: [], workflows: [] });
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
});
