import { describe, expect, it } from 'vitest';
import type {
  EvaluatePrAuditEvidenceInput,
  NormalizedCheck,
  RequiredCheckDiscovery,
  RequiredCheckIdentity,
} from '../types.js';
import { evaluatePrAuditEvidence } from '../verification.js';

const HEAD_SHA = 'b'.repeat(40);
const OLD_HEAD_SHA = 'c'.repeat(40);
const OTHER_HEAD_SHA = 'd'.repeat(40);
const NOW = '2026-08-25T20:00:00.000Z';
const OBSERVED_AT = '2026-08-25T19:59:00.000Z';
const WINDOW_MS = 5 * 60 * 1000;
const CHECK_RUN: RequiredCheckIdentity = { kind: 'check_run', context: 'Required Gate', appId: 101 };

function discovery(requiredChecks: RequiredCheckIdentity[] = [CHECK_RUN], observedAt = OBSERVED_AT): RequiredCheckDiscovery {
  return { state: 'complete', source: 'branch_protection', requiredChecks, observedAt, findings: [] };
}
function success(overrides: Partial<NormalizedCheck> = {}): NormalizedCheck {
  return {
    kind: 'check_run', context: 'Required Gate', appId: 101, headSha: HEAD_SHA,
    observedAt: OBSERVED_AT, status: 'completed', conclusion: 'success', providerRunId: 'run-1', ...overrides,
  };
}
function input(overrides: Partial<EvaluatePrAuditEvidenceInput> = {}): EvaluatePrAuditEvidenceInput {
  return {
    initialPr: { number: 703, state: 'open', headSha: HEAD_SHA, observedAt: OBSERVED_AT },
    finalPr: { number: 703, state: 'open', headSha: HEAD_SHA, observedAt: OBSERVED_AT },
    requiredChecks: discovery(), checks: [success()], findings: [], auditedAt: NOW,
    freshnessWindowMs: WINDOW_MS, emptyRequiredSetPolicy: 'require_observation', ...overrides,
  };
}

describe('evaluatePrAuditEvidence', () => {
  it('completes only a fresh exact-PR exact-head discovered successful check', () => {
    expect(evaluatePrAuditEvidence(input())).toEqual({
      state: 'evidence_complete', currentHeadSha: HEAD_SHA, requiredCheckCoverage: 'complete', findings: [],
    });
  });

  it('keeps check runs and commit statuses with the same context independent', () => {
    const requirements: RequiredCheckIdentity[] = [
      { kind: 'check_run', context: 'gate' }, { kind: 'commit_status', context: 'gate' },
    ];
    const result = evaluatePrAuditEvidence(input({
      requiredChecks: discovery(requirements),
      checks: [
        success({ context: 'gate', appId: undefined }),
        success({ kind: 'commit_status', context: 'gate', appId: undefined, status: 'success', conclusion: null }),
      ],
    }));
    expect(result.state).toBe('evidence_complete');
  });

  it('requires exact app identity when required', () => {
    const result = evaluatePrAuditEvidence(input({ checks: [success({ appId: 202 })] }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('required_check_missing');
  });

  it('fails closed on partial required-check discovery', () => {
    const result = evaluatePrAuditEvidence(input({
      requiredChecks: { state: 'partial', source: 'branch_protection', requiredChecks: [CHECK_RUN], observedAt: OBSERVED_AT, findings: ['required_check_discovery_truncated'] },
    }));
    expect(result.requiredCheckCoverage).toBe('incomplete');
    expect(result.findings).toEqual(expect.arrayContaining(['required_check_visibility_incomplete', 'required_check_discovery_truncated']));
  });

  it('fails closed when required-check discovery is stale', () => {
    const result = evaluatePrAuditEvidence(input({ requiredChecks: discovery([CHECK_RUN], '2026-08-25T19:54:59.999Z') }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.requiredCheckCoverage).toBe('incomplete');
    expect(result.findings).toContain('required_check_discovery_stale');
  });

  it.each(['not-a-time', '2026-08-25T20:00:00.001Z'])('fails closed when discovery time is %s', (observedAt: string) => {
    const result = evaluatePrAuditEvidence(input({ requiredChecks: discovery([CHECK_RUN], observedAt) }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('required_check_discovery_time_unknown');
  });

  it('rejects cross-wired PR identities even when heads match', () => {
    const result = evaluatePrAuditEvidence(input({
      finalPr: { number: 704, state: 'open', headSha: HEAD_SHA, observedAt: OBSERVED_AT },
    }));
    expect(result.state).toBe('evidence_conflicted');
    expect(result.findings).toContain('pr_identity_changed_during_collection');
  });

  it.each([0, -1])('rejects malformed PR number %s', (number: number) => {
    const result = evaluatePrAuditEvidence(input({
      initialPr: { number, state: 'open', headSha: HEAD_SHA, observedAt: OBSERVED_AT },
      finalPr: { number, state: 'open', headSha: HEAD_SHA, observedAt: OBSERVED_AT },
    }));
    expect(result.state).toBe('evidence_conflicted');
    expect(result.findings).toContain('pr_identity_changed_during_collection');
  });

  it('rejects stale PR identity observations', () => {
    const stale = '2026-08-25T19:54:59.999Z';
    const result = evaluatePrAuditEvidence(input({
      initialPr: { number: 703, state: 'open', headSha: HEAD_SHA, observedAt: stale },
      finalPr: { number: 703, state: 'open', headSha: HEAD_SHA, observedAt: stale },
    }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('pr_observation_stale');
  });

  it.each([null, 'not-a-time', '2026-08-25T20:00:00.001Z'])('rejects unknown/future PR observation %s', (observedAt: string | null) => {
    const result = evaluatePrAuditEvidence(input({
      finalPr: { number: 703, state: 'open', headSha: HEAD_SHA, observedAt },
    }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('pr_observation_time_unknown');
  });

  it('conflicts when the PR head moves during collection', () => {
    const result = evaluatePrAuditEvidence(input({ finalPr: { number: 703, state: 'open', headSha: OTHER_HEAD_SHA, observedAt: OBSERVED_AT } }));
    expect(result.state).toBe('evidence_conflicted');
    expect(result.findings).toContain('pr_head_changed_during_collection');
  });

  it('treats prior-head success as stale, never current proof', () => {
    const result = evaluatePrAuditEvidence(input({ checks: [success({ headSha: OLD_HEAD_SHA })] }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('ci_stale_for_head_sha');
  });

  it('does not let success hide a pending duplicate', () => {
    const result = evaluatePrAuditEvidence(input({ checks: [success(), success({ providerRunId: 'run-2', status: 'in_progress', conclusion: null })] }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('required_check_pending');
  });

  it('conflicts on duplicate current-head terminal disagreement', () => {
    const result = evaluatePrAuditEvidence(input({ checks: [success(), success({ providerRunId: 'run-2', conclusion: 'failure' })] }));
    expect(result.state).toBe('evidence_conflicted');
    expect(result.findings).toContain('duplicate_current_head_check_conflict');
  });

  it('rejects stale and future check observations', () => {
    const stale = evaluatePrAuditEvidence(input({ checks: [success({ observedAt: '2026-08-25T19:54:59.999Z' })] }));
    const future = evaluatePrAuditEvidence(input({ checks: [success({ observedAt: '2026-08-25T20:00:00.001Z' })] }));
    expect(stale.findings).toContain('ci_observation_stale');
    expect(future.findings).toContain('ci_observation_time_unknown');
  });

  it('keeps explicit empty required set fail-closed unless separately allowed', () => {
    expect(evaluatePrAuditEvidence(input({ requiredChecks: discovery([]), checks: [] })).findings).toContain('required_check_missing');
    expect(evaluatePrAuditEvidence(input({ requiredChecks: discovery([]), checks: [], emptyRequiredSetPolicy: 'allow' })).state).toBe('evidence_complete');
  });
});
