import { describe, expect, it } from 'vitest';

import {
  computeEvidenceScalePolicyDigest,
  evaluateEvidenceScaleGate,
  FCR_EVALUATION_TIME_AUTHORITY_CONTRACT,
  FCR_EVIDENCE_SCALE_GATE_CONTRACT,
  normalizeCapabilityReceiptEvidence,
  type FcrEvidenceLedgerEntry,
  type FcrEvaluationTimeAuthority,
  type FcrEvidenceScaleInput,
  type FcrEvidenceScalePolicy,
} from '../evidenceScaleGate.js';
import {
  computeCapabilityReceiptDigest,
  type CapabilityReceiptV1,
  type CapabilityRequestV1,
} from '../capabilityExecutionContracts.js';
import {
  computeCapabilityRequestAuthorityDigest,
  createFounderDecisionReceipt,
  type AuthenticatedFounderContextV0,
} from '../founderDecisionReceipt.js';

const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const NOW = '2026-08-14T22:00:00.000Z';
const VALID_UNTIL = '2026-08-14T22:30:00.000Z';
const FRESH = '2026-08-14T21:55:00.000Z';
const STALE = '2026-08-13T20:00:00.000Z';
const FUTURE = '2026-08-14T22:05:00.000Z';
const FOUNDER_CONTEXT: AuthenticatedFounderContextV0 = {
  founderId: 'jussray',
  source: 'trusted-session',
  sourceRef: 'supabase-session:test-founder',
};

const policy: FcrEvidenceScalePolicy = {
  policyId: 'founder-scale-default',
  policyVersion: '1.0.0',
  requiredEvidenceKinds: ['test', 'playwright', 'runtime'],
  maxEvidenceAgeMs: 60 * 60 * 1000,
  minFreshExactHeadPasses: 3,
  minPassRate: 0.95,
  maxFailureRate: 0.05,
  maxP95LatencyMs: 1_000,
  maxCostPerPassUsd: 0.5,
  maxRetryRate: 0.25,
};

function evidence(
  evidenceId: string,
  kind: FcrEvidenceLedgerEntry['kind'],
  overrides: Partial<FcrEvidenceLedgerEntry> = {},
): FcrEvidenceLedgerEntry {
  return {
    evidenceId,
    projectSlug: 'founder-control-room',
    executionId: `run:${evidenceId}`,
    provenanceId: `proof:${evidenceId}`,
    kind,
    verdict: 'PASS',
    source: 'test-ledger',
    requestedHeadSha: HEAD,
    observedHeadSha: HEAD,
    observedAt: FRESH,
    latencyMs: 100,
    costUsd: 0.05,
    attempts: 1,
    ...overrides,
  };
}

function completeEvidence(): FcrEvidenceLedgerEntry[] {
  return [
    evidence('test-green', 'test'),
    evidence('browser-green', 'playwright', { latencyMs: 500, costUsd: 0.1 }),
    evidence('runtime-green', 'runtime', { source: 'runtime', latencyMs: 300, costUsd: 0.1 }),
  ];
}

function timeAuthority(
  effectivePolicy: FcrEvidenceScalePolicy,
  overrides: Partial<FcrEvaluationTimeAuthority> = {},
): FcrEvaluationTimeAuthority {
  return {
    contract: FCR_EVALUATION_TIME_AUTHORITY_CONTRACT,
    authorityId: 'control-room-runtime',
    projectSlug: 'founder-control-room',
    expectedHeadSha: HEAD,
    policyDigest: computeEvidenceScalePolicyDigest(effectivePolicy),
    evaluatedAt: NOW,
    validUntil: VALID_UNTIL,
    provenanceId: `fcr-time:${'4'.repeat(64)}`,
    ...overrides,
  };
}

function evaluate(entries: FcrEvidenceLedgerEntry[], overrides: Partial<FcrEvidenceScalePolicy> = {}) {
  const effectivePolicy = { ...policy, ...overrides };
  return evaluateEvidenceScaleGate({
    projectSlug: 'founder-control-room',
    expectedHeadSha: HEAD,
    evidence: entries,
    policy: effectivePolicy,
    timeAuthority: timeAuthority(effectivePolicy),
  });
}

function capabilityRequest(projectSlug = 'founder-control-room'): CapabilityRequestV1 {
  return {
    contract: 'fcr/capability-request@v1',
    goalId: 'goal-1',
    runId: 'run-1',
    attemptId: 'attempt-1',
    traceId: 'trace-1',
    expectedHeadSha: HEAD,
    capability: 'test.focused',
    capabilityVersion: '1.0.0',
    capabilityPlanHash: '1'.repeat(64),
    registryHash: '2'.repeat(64),
    policyDecisionId: 'pending-founder-decision',
    policyVersion: '1.0.0',
    idempotencyKey: 'idem-1',
    retryOwner: 'workflow',
    timeoutMs: 30_000,
    args: { projectSlug },
  };
}

function capabilityReceipt(request: CapabilityRequestV1): CapabilityReceiptV1 {
  const receipt: CapabilityReceiptV1 = {
    contract: 'fcr/capability-receipt@v1',
    runId: request.runId,
    attemptId: request.attemptId,
    traceId: request.traceId,
    capability: request.capability,
    requestedHeadSha: HEAD,
    observedHeadSha: HEAD,
    execution: 'COMPLETED',
    evidence: [{
      evidenceId: 'capability-test',
      kind: 'test',
      verdict: 'PASS',
      digest: '3'.repeat(64),
      mediaType: 'application/json',
      size: 12,
      requestedHeadSha: HEAD,
      observedHeadSha: HEAD,
      observedAt: FRESH,
    }],
    observations: [],
    inferences: [],
    startedAt: FRESH,
    completedAt: FRESH,
    receiptDigest: '0'.repeat(64),
  };
  receipt.receiptDigest = computeCapabilityReceiptDigest(receipt);
  return receipt;
}

function authorizedNormalization(projectSlug = 'founder-control-room') {
  const request = capabilityRequest(projectSlug);
  const evaluatedAt = Date.parse(NOW);
  const founderDecision = createFounderDecisionReceipt({
    actor: { type: 'founder', id: FOUNDER_CONTEXT.founderId },
    decision: 'authorize',
    action: 'merge-code',
    capabilityPlanHash: request.capabilityPlanHash,
    expectedHeadSha: request.expectedHeadSha,
    requestDigest: computeCapabilityRequestAuthorityDigest(request),
    evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
    createdAt: '2026-08-14T21:50:00.000Z',
    expiresAt: '2026-08-14T22:20:00.000Z',
  }, evaluatedAt);
  request.policyDecisionId = founderDecision.receiptId;
  return {
    projectSlug,
    request,
    receipt: capabilityReceipt(request),
    founderDecision,
    founderContext: FOUNDER_CONTEXT,
    evaluatedAt,
  };
}

describe('FCR evidence-to-scale decision kernel', () => {
  it('fails closed when no evidence exists', () => {
    const decision = evaluate([]);
    expect(decision.contract).toBe(FCR_EVIDENCE_SCALE_GATE_CONTRACT);
    expect(decision.evaluation.status).toBe('blocked');
    expect(decision.scaleGate.status).toBe('blocked');
    expect(decision.scaleGate.scaleAuthorized).toBe(false);
    expect(decision.scaleGate.executionAllowed).toBe(false);
    expect(decision.authority.status).toBe('unverified');
  });

  it('never promotes caller-supplied evidence or policy to founder scale review', () => {
    const decision = evaluate(completeEvidence());
    expect(decision.evaluation).toEqual({ status: 'meets_untrusted_proof_floor', blockers: [] });
    expect(decision.metrics).toMatchObject({ distinctCurrentExecutions: 3, distinctFreshExecutions: 3, freshExactHeadPasses: 3, passRate: 1, failureRate: 0, proofCoverage: 1 });
    expect(decision.ledger.authenticity).toBe('unverified-input');
    expect(decision.policy.source).toBe('unverified-input');
    expect(decision.clockSource).toBe('declared-unverified');
    expect(decision.authority.scaleReviewAllowed).toBe(false);
    expect(decision.scaleGate).toMatchObject({ status: 'blocked', candidate: 'evidence_candidate', scaleAuthorized: false, executionAllowed: false });
    expect(decision.scaleGate.nextGate).toMatch(/authenticated runtime authority adapter/i);
  });

  it('rejects stale evidence and never lets a fresh sibling age out a stale failure from the same execution', () => {
    const sharedExecution = 'run:mixed-age';
    const entries = [
      evidence('test-fresh', 'test', { executionId: sharedExecution }),
      evidence('same-run-stale-fail', 'log', { executionId: sharedExecution, verdict: 'FAIL', observedAt: STALE }),
      evidence('browser-green', 'playwright'),
      evidence('runtime-green', 'runtime'),
    ];
    const decision = evaluate(entries, { minFreshExactHeadPasses: 2 });
    expect(decision.metrics.distinctCurrentExecutions).toBe(3);
    expect(decision.metrics.distinctFreshExecutions).toBe(2);
    expect(decision.metrics.staleCurrentEntries).toBe(2);
    expect(decision.evaluation.blockers).toContain('missing fresh exact-head PASS execution for required kind: test');
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('counts required proof only from executions whose aggregate verdict is PASS', () => {
    const sharedExecution = 'run:mixed-verdict';
    const entries = [
      evidence('test-pass-in-failed-run', 'test', { executionId: sharedExecution }),
      evidence('same-run-fail', 'log', { executionId: sharedExecution, verdict: 'FAIL' }),
      evidence('browser-green', 'playwright'),
      evidence('runtime-green', 'runtime'),
    ];
    const decision = evaluate(entries, { minFreshExactHeadPasses: 2, minPassRate: 0.6, maxFailureRate: 0.4 });
    expect(decision.metrics.passRate).toBeCloseTo(2 / 3);
    expect(decision.metrics.failureRate).toBeCloseTo(1 / 3);
    expect(decision.evaluation.blockers).toContain('missing fresh exact-head PASS execution for required kind: test');
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('rejects future-dated evidence instead of silently dropping it from reliability', () => {
    const entries = [...completeEvidence(), evidence('future-failure', 'log', { verdict: 'FAIL', observedAt: FUTURE })];
    const decision = evaluate(entries);
    expect(decision.ledger.integrityFailures).toContain('evidence future-failure is dated after the evaluation window');
    expect(decision.evaluation.status).toBe('blocked');
  });

  it('rejects cross-project and wrong-head evidence', () => {
    const entries = completeEvidence();
    entries[0] = evidence('foreign-test', 'test', { projectSlug: 'another-project' });
    entries[2] = evidence('wrong-head-runtime', 'runtime', { observedHeadSha: OTHER_HEAD });
    const decision = evaluate(entries);
    expect(decision.ledger.integrityFailures.join(' ')).toMatch(/projectSlug does not match evaluated project/);
    expect(decision.ledger.integrityFailures).toContain('PASS evidence wrong-head-runtime is not bound to the exact expected head');
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('computes reliability over immutable execution identities instead of evidence-entry counts', () => {
    const sharedExecution = 'run:shared-pass';
    const padded = [
      evidence('test-pass', 'test', { executionId: sharedExecution }),
      evidence('browser-pass', 'playwright', { executionId: sharedExecution }),
      evidence('runtime-pass', 'runtime', { executionId: sharedExecution }),
      ...Array.from({ length: 20 }, (_, index) => evidence(`padding-${index}`, 'artifact', { executionId: sharedExecution })),
      evidence('failed-run', 'log', { executionId: 'run:failure', verdict: 'FAIL' }),
    ];
    const decision = evaluate(padded, { minFreshExactHeadPasses: 1, minPassRate: 0.95, maxFailureRate: 0.05 });
    expect(decision.metrics.distinctFreshExecutions).toBe(2);
    expect(decision.metrics.passRate).toBe(0.5);
    expect(decision.metrics.failureRate).toBe(0.5);
    expect(decision.evaluation.status).toBe('blocked');
  });

  it('rejects duplicate provenance even if caller renames the evidence', () => {
    const entries = completeEvidence();
    entries.push(evidence('renamed-copy', 'artifact', { provenanceId: entries[0].provenanceId }));
    const decision = evaluate(entries);
    expect(decision.ledger.integrityFailures).toContain(`duplicate provenanceId: ${entries[0].provenanceId}`);
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('caps the evidence freshness window to prevent invalid Date-range math', () => {
    const hugePolicy = { ...policy, maxEvidenceAgeMs: Number.MAX_SAFE_INTEGER };
    const decision = evaluateEvidenceScaleGate({ projectSlug: 'founder-control-room', expectedHeadSha: HEAD, evidence: completeEvidence(), policy: hugePolicy, timeAuthority: timeAuthority(hugePolicy) });
    expect(decision.evaluation.blockers.join(' ')).toMatch(/maxEvidenceAgeMs must not exceed/);
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('keeps optimization advice non-executable and blocked from scale review', () => {
    const entries = [
      evidence('test-slow', 'test', { latencyMs: 1_500, costUsd: 0.8, attempts: 2 }),
      evidence('browser-slow', 'playwright', { latencyMs: 2_000, costUsd: 0.8, attempts: 1 }),
      evidence('runtime-slow', 'runtime', { latencyMs: 1_800, costUsd: 0.8, attempts: 2 }),
    ];
    const decision = evaluate(entries);
    expect(decision.evaluation.status).toBe('meets_untrusted_proof_floor');
    expect(decision.optimization.status).toBe('candidate');
    expect(decision.optimization.recommendations.map((item) => item.code)).toEqual(['reduce_latency', 'reduce_cost', 'reduce_retries']);
    expect(decision.optimization.executionAllowed).toBe(false);
    expect(decision.scaleGate.candidate).toBe('optimize_candidate');
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('fails closed on malformed deserialized fields instead of throwing', () => {
    const malformed = { ...completeEvidence()[0], evidenceId: null, requestedHeadSha: null } as unknown as FcrEvidenceLedgerEntry;
    expect(() => evaluate([malformed])).not.toThrow();
    const decision = evaluate([malformed]);
    expect(decision.ledger.integrityFailures.join(' ')).toMatch(/must be a string|requestedHeadSha is invalid/);
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('normalizes checksum evidence only after exact founder authorization is validated', () => {
    const normalized = normalizeCapabilityReceiptEvidence(authorizedNormalization());
    expect(normalized.integrityFailures).toEqual([]);
    expect(normalized.authenticity).toBe('checksum-only-unverified');
    expect(normalized.evidence[0]).toMatchObject({ projectSlug: 'founder-control-room', executionId: 'run-1:attempt-1', source: 'capability-receipt' });
    expect(normalized.evidence[0].provenanceId).toMatch(/^checksum-only:/);
  });

  it('refuses capability evidence when founder authorization is missing', () => {
    const request = capabilityRequest();
    const receipt = capabilityReceipt(request);
    const normalized = normalizeCapabilityReceiptEvidence({ projectSlug: 'founder-control-room', request, receipt });
    expect(normalized.evidence).toEqual([]);
    expect(normalized.integrityFailures.join(' ')).toMatch(/founder decision authorization|authenticated founder context|evaluation time/i);
  });

  it('refuses failed/digest-invalid receipts and project relabeling', () => {
    const request = capabilityRequest('original-project');
    const receipt = capabilityReceipt(request);
    receipt.execution = 'FAILED';
    receipt.receiptDigest = 'd'.repeat(64);
    const invalid = normalizeCapabilityReceiptEvidence({ projectSlug: 'different-project', request, receipt });
    expect(invalid.evidence).toEqual([]);
    expect(invalid.integrityFailures.join(' ')).toMatch(/founder decision|digest|execution|project|evaluation time/i);
    expect(invalid.authenticity).toBe('checksum-only-unverified');
  });

  it('records caller policy exactly but never treats it as approved authority', () => {
    const permissivePolicy = { ...policy, policyId: 'caller-debug', policyVersion: '0.0.1', minFreshExactHeadPasses: 1, minPassRate: 0, maxFailureRate: 1, maxP95LatencyMs: undefined, maxCostPerPassUsd: undefined, maxRetryRate: undefined };
    const decision = evaluateEvidenceScaleGate({ projectSlug: 'founder-control-room', expectedHeadSha: HEAD, evidence: [evidence('test-only', 'test')], policy: permissivePolicy, timeAuthority: timeAuthority(permissivePolicy) });
    expect(decision.policy.policyId).toBe('caller-debug');
    expect(decision.policy.source).toBe('unverified-input');
    expect(decision.authority.scaleReviewAllowed).toBe(false);
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('blocks malformed optional policy thresholds rather than silently dropping them', () => {
    const malformedPolicy = { ...policy, maxRetryRate: 'fast' };
    const decision = evaluateEvidenceScaleGate({ projectSlug: 'founder-control-room', expectedHeadSha: HEAD, evidence: completeEvidence(), policy: malformedPolicy, timeAuthority: timeAuthority(policy) } as unknown as FcrEvidenceScaleInput);
    expect(decision.evaluation.blockers.join(' ')).toMatch(/maxRetryRate must be a finite number/);
    expect(decision.scaleGate.status).toBe('blocked');
  });
});
