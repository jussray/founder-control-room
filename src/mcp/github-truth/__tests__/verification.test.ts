import { describe, expect, it } from 'vitest';
import type {
  CiAuditObservation,
  EvaluatePrAuditEvidenceInput,
} from '../types.js';
import { evaluatePrAuditEvidence } from '../verification.js';

const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const OLD_HEAD_SHA = 'c'.repeat(40);
const NOW = '2026-08-25T18:00:00.000Z';
const OBSERVED_AT = '2026-08-25T17:59:00.000Z';

function completedSuccess(overrides: Partial<CiAuditObservation> = {}): CiAuditObservation {
  return {
    id: 'check-1',
    name: 'Required Gate',
    headSha: HEAD_SHA,
    status: 'completed',
    conclusion: 'success',
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

function auditInput(
  overrides: Partial<EvaluatePrAuditEvidenceInput> = {},
): EvaluatePrAuditEvidenceInput {
  return {
    pullRequest: {
      number: 700,
      state: 'open',
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      observedAt: OBSERVED_AT,
      expectedHeadSha: HEAD_SHA,
      finalHeadSha: HEAD_SHA,
    },
    checks: [completedSuccess()],
    workflows: [],
    now: NOW,
    ...overrides,
  };
}

describe('evaluatePrAuditEvidence', () => {
  it('classifies fresh completed CI bound to the current PR head as complete', () => {
    const result = evaluatePrAuditEvidence(auditInput());

    expect(result).toEqual({
      verdict: 'evidence_complete',
      ciConclusion: 'pass',
      findings: [],
      verification: {
        checkedAt: NOW,
        headShaBound: true,
        ciBoundToHeadSha: true,
        freshness: 'current',
      },
    });
  });

  it('rejects a passing check from an older SHA as stale-head evidence', () => {
    const result = evaluatePrAuditEvidence(auditInput({
      checks: [completedSuccess({ headSha: OLD_HEAD_SHA })],
    }));

    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.ciConclusion).toBe('unknown');
    expect(result.verification.ciBoundToHeadSha).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('ci_stale_for_head_sha');
  });

  it('does not classify a failed check from an older SHA as current-head failure', () => {
    const result = evaluatePrAuditEvidence(auditInput({
      checks: [completedSuccess({ headSha: OLD_HEAD_SHA, conclusion: 'failure' })],
    }));

    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.ciConclusion).toBe('unknown');
    expect(result.findings.map((finding) => finding.code)).toContain('ci_stale_for_head_sha');
  });

  it('never reports complete evidence when CI observations are absent', () => {
    const result = evaluatePrAuditEvidence(auditInput({ checks: [], workflows: [] }));

    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.ciConclusion).toBe('unknown');
    expect(result.findings.map((finding) => finding.code)).toContain('ci_missing');
  });

  it('classifies failed and pending current-head CI without false green', () => {
    const failed = evaluatePrAuditEvidence(auditInput({
      checks: [completedSuccess({ conclusion: 'failure' })],
    }));
    const pending = evaluatePrAuditEvidence(auditInput({
      checks: [completedSuccess({ status: 'in_progress', conclusion: null })],
    }));

    expect(failed).toMatchObject({ verdict: 'evidence_incomplete', ciConclusion: 'fail' });
    expect(failed.findings.map((finding) => finding.code)).toContain('ci_failed');
    expect(pending).toMatchObject({ verdict: 'evidence_incomplete', ciConclusion: 'pending' });
    expect(pending.findings.map((finding) => finding.code)).toContain('ci_pending');
  });

  it('reports a conflict when the PR head changes during collection', () => {
    const result = evaluatePrAuditEvidence(auditInput({
      pullRequest: {
        ...auditInput().pullRequest,
        finalHeadSha: OLD_HEAD_SHA,
      },
    }));

    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.verification.headShaBound).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('head_sha_changed_during_audit');
  });

  it('reports a conflict when the provider head differs from the caller expectation', () => {
    const result = evaluatePrAuditEvidence(auditInput({
      pullRequest: {
        ...auditInput().pullRequest,
        expectedHeadSha: OLD_HEAD_SHA,
      },
    }));

    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.verification.headShaBound).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('expected_head_sha_mismatch');
  });

  it('reports contradictory duplicate CI outcomes as conflicted evidence', () => {
    const result = evaluatePrAuditEvidence(auditInput({
      checks: [
        completedSuccess(),
        completedSuccess({ id: 'check-2', conclusion: 'failure' }),
      ],
    }));

    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.ciConclusion).toBe('unknown');
    expect(result.findings.map((finding) => finding.code)).toContain('ci_evidence_conflicted');
  });

  it('fails closed when timestamps are stale, malformed, or in the future', () => {
    const stale = evaluatePrAuditEvidence(auditInput({
      checks: [completedSuccess({ observedAt: '2026-08-25T17:00:00.000Z' })],
    }));
    const malformed = evaluatePrAuditEvidence(auditInput({
      checks: [completedSuccess({ observedAt: 'not-a-time' })],
    }));
    const future = evaluatePrAuditEvidence(auditInput({
      checks: [completedSuccess({ observedAt: '2026-08-25T18:01:00.000Z' })],
    }));

    expect(stale).toMatchObject({ verdict: 'evidence_incomplete' });
    expect(stale.verification.freshness).toBe('stale');
    expect(stale.findings.map((finding) => finding.code)).toContain('evidence_stale');
    expect(malformed.verification.freshness).toBe('unknown');
    expect(malformed.findings.map((finding) => finding.code)).toContain('evidence_time_unknown');
    expect(future.verification.freshness).toBe('unknown');
    expect(future.findings.map((finding) => finding.code)).toContain('evidence_time_unknown');
  });

  it('does not promote neutral or skipped terminal conclusions into a pass', () => {
    const neutral = evaluatePrAuditEvidence(auditInput({
      checks: [completedSuccess({ conclusion: 'neutral' })],
    }));
    const skipped = evaluatePrAuditEvidence(auditInput({
      checks: [completedSuccess({ conclusion: 'skipped' })],
    }));

    expect(neutral).toMatchObject({ verdict: 'evidence_incomplete', ciConclusion: 'unknown' });
    expect(skipped).toMatchObject({ verdict: 'evidence_incomplete', ciConclusion: 'unknown' });
    expect(neutral.findings.map((finding) => finding.code)).toContain('ci_unknown');
    expect(skipped.findings.map((finding) => finding.code)).toContain('ci_unknown');
  });

  it('fails closed when the requested freshness window is outside policy', () => {
    const result = evaluatePrAuditEvidence(auditInput({ freshnessWindowMs: 60 * 60 * 1000 + 1 }));

    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.verification.freshness).toBe('unknown');
    expect(result.findings.map((finding) => finding.code)).toContain('invalid_freshness_window');
  });

  it('produces the same finding order when CI input order changes', () => {
    const first = completedSuccess({ id: 'check-pass', name: 'Alpha' });
    const second = completedSuccess({
      id: 'check-pending',
      name: 'Beta',
      status: 'queued',
      conclusion: null,
    });

    const forward = evaluatePrAuditEvidence(auditInput({ checks: [first, second] }));
    const reverse = evaluatePrAuditEvidence(auditInput({ checks: [second, first] }));

    expect(reverse).toEqual(forward);
  });
});
