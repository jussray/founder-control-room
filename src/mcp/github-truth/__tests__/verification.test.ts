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

const CHECK_RUN: RequiredCheckIdentity = {
  kind: 'check_run',
  context: 'Required Gate',
  appId: 101,
};

function discovery(
  requiredChecks: RequiredCheckIdentity[] = [CHECK_RUN],
): RequiredCheckDiscovery {
  return {
    state: 'complete',
    source: 'branch_protection',
    requiredChecks,
    observedAt: OBSERVED_AT,
    findings: [],
  };
}

function success(overrides: Partial<NormalizedCheck> = {}): NormalizedCheck {
  return {
    kind: 'check_run',
    context: 'Required Gate',
    appId: 101,
    headSha: HEAD_SHA,
    observedAt: OBSERVED_AT,
    status: 'completed',
    conclusion: 'success',
    providerRunId: 'run-1',
    ...overrides,
  };
}

function input(
  overrides: Partial<EvaluatePrAuditEvidenceInput> = {},
): EvaluatePrAuditEvidenceInput {
  return {
    initialPr: { number: 703, state: 'open', headSha: HEAD_SHA, observedAt: OBSERVED_AT },
    finalPr: { number: 703, state: 'open', headSha: HEAD_SHA, observedAt: OBSERVED_AT },
    requiredChecks: discovery(),
    checks: [success()],
    findings: [],
    auditedAt: NOW,
    freshnessWindowMs: WINDOW_MS,
    emptyRequiredSetPolicy: 'require_observation',
    ...overrides,
  };
}

function findingCodes(overrides: Partial<EvaluatePrAuditEvidenceInput>): string[] {
  return evaluatePrAuditEvidence(input(overrides)).findings;
}

describe('evaluatePrAuditEvidence', () => {
  it('completes only a discovered current-head completed-success check run', () => {
    expect(evaluatePrAuditEvidence(input())).toEqual({
      state: 'evidence_complete',
      currentHeadSha: HEAD_SHA,
      requiredCheckCoverage: 'complete',
      findings: [],
    });
  });

  it('accepts a required commit status independently', () => {
    const requirement: RequiredCheckIdentity = { kind: 'commit_status', context: 'deploy' };
    const result = evaluatePrAuditEvidence(input({
      requiredChecks: discovery([requirement]),
      checks: [success({
        kind: 'commit_status',
        context: 'deploy',
        appId: undefined,
        status: 'success',
        conclusion: null,
      })],
    }));
    expect(result.state).toBe('evidence_complete');
  });

  it('keeps check runs and commit statuses with the same context independent', () => {
    const requirements: RequiredCheckIdentity[] = [
      { kind: 'check_run', context: 'gate' },
      { kind: 'commit_status', context: 'gate' },
    ];
    const both = evaluatePrAuditEvidence(input({
      requiredChecks: discovery(requirements),
      checks: [
        success({ context: 'gate', appId: undefined }),
        success({ kind: 'commit_status', context: 'gate', appId: undefined, status: 'success', conclusion: null }),
      ],
    }));
    const one = evaluatePrAuditEvidence(input({
      requiredChecks: discovery(requirements),
      checks: [success({ context: 'gate', appId: undefined })],
    }));
    expect(both.state).toBe('evidence_complete');
    expect(one.state).toBe('evidence_incomplete');
    expect(one.findings).toContain('required_check_missing');
  });

  it('requires an exact app identity when the requirement specifies appId', () => {
    const result = evaluatePrAuditEvidence(input({
      checks: [success({ appId: undefined }), success({ appId: 202, providerRunId: 'run-2' })],
    }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('required_check_missing');
  });

  it('fails closed on partial required-check discovery even when supplied checks succeed', () => {
    const result = evaluatePrAuditEvidence(input({
      requiredChecks: {
        state: 'partial',
        source: 'branch_protection',
        requiredChecks: [CHECK_RUN],
        observedAt: OBSERVED_AT,
        findings: ['required_check_discovery_truncated'],
      },
    }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.requiredCheckCoverage).toBe('incomplete');
    expect(result.findings).toContain('required_check_visibility_incomplete');
    expect(result.findings).toContain('required_check_discovery_truncated');
  });

  it('fails closed on unavailable discovery even with zero observations', () => {
    const result = evaluatePrAuditEvidence(input({
      requiredChecks: {
        state: 'unavailable',
        source: null,
        requiredChecks: [],
        observedAt: OBSERVED_AT,
        findings: ['required_check_discovery_access_denied'],
      },
      checks: [],
    }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('required_check_visibility_incomplete');
    expect(result.findings).toContain('required_check_discovery_access_denied');
  });

  it('does not accidentally treat an explicit empty required set as complete under v0 policy', () => {
    const result = evaluatePrAuditEvidence(input({ requiredChecks: discovery([]), checks: [] }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('required_check_missing');
  });

  it('does not let unrelated successful checks satisfy an empty required set', () => {
    const result = evaluatePrAuditEvidence(input({
      requiredChecks: discovery([]),
      checks: [success({ context: 'Unrelated Green Check', appId: 202 })],
      emptyRequiredSetPolicy: 'require_observation',
    }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('required_check_missing');
  });

  it('fails closed for a future forbid-complete policy value even when observations exist', () => {
    const result = evaluatePrAuditEvidence(input({
      requiredChecks: discovery([]),
      checks: [success({ context: 'Unrelated Green Check', appId: 202 })],
      emptyRequiredSetPolicy: 'forbid_complete' as never,
    }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('required_check_missing');
  });

  it('permits an explicit future policy to accept a complete empty set', () => {
    const result = evaluatePrAuditEvidence(input({
      requiredChecks: discovery([]),
      checks: [],
      emptyRequiredSetPolicy: 'allow',
    }));
    expect(result.state).toBe('evidence_complete');
  });

  it('reports a missing required observation', () => {
    expect(findingCodes({ checks: [] })).toContain('required_check_missing');
  });

  it('treats prior-head success as diagnostic stale evidence, never current proof', () => {
    const result = evaluatePrAuditEvidence(input({ checks: [success({ headSha: OLD_HEAD_SHA })] }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('ci_stale_for_head_sha');
  });

  it.each(['queued', 'requested', 'waiting', 'in_progress', 'pending'])('classifies %s as pending', (status) => {
    const result = evaluatePrAuditEvidence(input({
      checks: [success({ status, conclusion: null })],
    }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('required_check_pending');
  });

  it.each([
    ['failure', 'required_check_failed'],
    ['cancelled', 'required_check_cancelled'],
    ['neutral', 'required_check_neutral'],
    ['skipped', 'required_check_skipped'],
    ['unknown', 'required_check_unknown'],
  ] as const)('classifies completed %s with its typed finding', (conclusion, finding) => {
    const result = evaluatePrAuditEvidence(input({ checks: [success({ conclusion })] }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain(finding);
  });

  it('conflicts on duplicate current-head terminal disagreement', () => {
    const result = evaluatePrAuditEvidence(input({
      checks: [success(), success({ providerRunId: 'run-2', conclusion: 'failure' })],
    }));
    expect(result.state).toBe('evidence_conflicted');
    expect(result.findings).toContain('duplicate_current_head_check_conflict');
  });

  it('deduplicates identical successes semantically without conflict', () => {
    const result = evaluatePrAuditEvidence(input({
      checks: [success(), success({ providerRunId: 'run-2' })],
    }));
    expect(result.state).toBe('evidence_complete');
    expect(result.findings).not.toContain('duplicate_current_head_check_conflict');
  });

  it('treats success plus pending as incomplete rather than conflicted', () => {
    const result = evaluatePrAuditEvidence(input({
      checks: [success(), success({ providerRunId: 'run-2', status: 'in_progress', conclusion: null })],
    }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('required_check_pending');
    expect(result.findings).not.toContain('duplicate_current_head_check_conflict');
  });

  it('treats success plus unknown as incomplete rather than accepting the green duplicate', () => {
    const result = evaluatePrAuditEvidence(input({
      checks: [success(), success({ providerRunId: 'run-2', conclusion: 'mystery' })],
    }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('required_check_unknown');
    expect(result.findings).not.toContain('duplicate_current_head_check_conflict');
  });

  it('conflicts before check outcomes can complete when the PR head moves', () => {
    const result = evaluatePrAuditEvidence(input({
      finalPr: { number: 703, state: 'open', headSha: OTHER_HEAD_SHA, observedAt: OBSERVED_AT },
    }));
    expect(result.state).toBe('evidence_conflicted');
    expect(result.findings).toContain('pr_head_changed_during_collection');
  });

  it.each([null, 'abc', 'f'.repeat(39)])('fails closed on malformed PR head %s', (badHead) => {
    const result = evaluatePrAuditEvidence(input({
      initialPr: { number: 703, state: 'open', headSha: badHead, observedAt: OBSERVED_AT },
    }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('pr_head_sha_malformed');
  });

  it('fails closed on a malformed current candidate SHA', () => {
    const result = evaluatePrAuditEvidence(input({ checks: [success({ headSha: 'bad-sha' })] }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('ci_head_sha_malformed');
    expect(result.findings).toContain('required_check_missing');
  });

  it.each([
    [null, 'ci_observation_time_unknown'],
    ['not-a-time', 'ci_observation_time_unknown'],
    ['2026-08-25T20:00:01.000Z', 'ci_observation_time_unknown'],
    ['2026-08-25T19:54:59.999Z', 'ci_observation_stale'],
  ] as const)('fails closed for observation time %s', (observedAt, finding) => {
    const result = evaluatePrAuditEvidence(input({ checks: [success({ observedAt })] }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain(finding);
  });

  it('accepts exactly the freshness boundary and rejects one millisecond beyond it', () => {
    const exact = evaluatePrAuditEvidence(input({
      checks: [success({ observedAt: '2026-08-25T19:55:00.000Z' })],
    }));
    const beyond = evaluatePrAuditEvidence(input({
      checks: [success({ observedAt: '2026-08-25T19:54:59.999Z' })],
    }));
    expect(exact.state).toBe('evidence_complete');
    expect(beyond.state).toBe('evidence_incomplete');
    expect(beyond.findings).toContain('ci_observation_stale');
  });

  it.each([0, -1, 1.5, 60 * 60 * 1000 + 1])('fails closed on freshness window %s', (freshnessWindowMs) => {
    const result = evaluatePrAuditEvidence(input({ freshnessWindowMs }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('invalid_freshness_window');
  });

  it('fails closed when the PR is not open', () => {
    const result = evaluatePrAuditEvidence(input({
      initialPr: { number: 703, state: 'closed', headSha: HEAD_SHA, observedAt: OBSERVED_AT },
    }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('pr_not_open');
  });

  it('consumes provider findings without inventing or erasing them', () => {
    const result = evaluatePrAuditEvidence(input({ findings: ['provider_rate_limited'] }));
    expect(result.state).toBe('evidence_incomplete');
    expect(result.findings).toContain('provider_rate_limited');
  });

  it('is invariant to check and finding input order', () => {
    const checks = [success(), success({ providerRunId: 'run-2' })];
    const findings = ['provider_timeout', 'collection_truncated'] as const;
    const forward = evaluatePrAuditEvidence(input({ checks, findings }));
    const reverse = evaluatePrAuditEvidence(input({ checks: [...checks].reverse(), findings: [...findings].reverse() }));
    expect(reverse).toEqual(forward);
  });
});
