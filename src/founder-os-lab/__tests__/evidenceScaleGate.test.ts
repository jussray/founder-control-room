import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateEvidenceScaleGate,
  FCR_EVIDENCE_SCALE_GATE_CONTRACT,
  normalizeCapabilityReceiptEvidence,
  type FcrEvidenceLedgerEntry,
  type FcrEvidenceScaleInput,
  type FcrEvidenceScalePolicy,
} from '../evidenceScaleGate.js';
import {
  computeCapabilityReceiptDigest,
  type CapabilityReceiptV1,
  type CapabilityRequestV1,
} from '../capabilityExecutionContracts.js';

const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const NOW = '2026-08-14T22:00:00.000Z';
const FRESH = '2026-08-14T21:55:00.000Z';
const STALE = '2026-08-13T20:00:00.000Z';

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

function evaluate(entries: FcrEvidenceLedgerEntry[], overrides: Partial<FcrEvidenceScalePolicy> = {}) {
  return evaluateEvidenceScaleGate({
    projectSlug: 'founder-control-room',
    expectedHeadSha: HEAD,
    evidence: entries,
    policy: { ...policy, ...overrides },
  });
}

function capabilityRequest(): CapabilityRequestV1 {
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
    policyDecisionId: 'policy-decision-1',
    policyVersion: '1.0.0',
    idempotencyKey: 'idem-1',
    retryOwner: 'workflow',
    timeoutMs: 30_000,
    args: { projectSlug: 'founder-control-room' },
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

describe('FCR evidence-to-scale decision kernel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fails closed when no evidence exists', () => {
    const decision = evaluate([]);

    expect(decision.contract).toBe(FCR_EVIDENCE_SCALE_GATE_CONTRACT);
    expect(decision.clockSource).toBe('system');
    expect(decision.evaluatedAt).toBe(NOW);
    expect(decision.expiresAt).toBe(NOW);
    expect(decision.evaluation.status).toBe('blocked');
    expect(decision.evaluation.blockers).toContain('no evidence supplied');
    expect(decision.metrics.passRate).toBeNull();
    expect(decision.metrics.p95LatencyMs).toBeNull();
    expect(decision.metrics.latencyCoverage).toBeNull();
    expect(decision.metrics.costCoverage).toBeNull();
    expect(decision.metrics.retryCoverage).toBeNull();
    expect(decision.scaleGate.status).toBe('blocked');
    expect(decision.scaleGate.scaleAuthorized).toBe(false);
    expect(decision.scaleGate.executionAllowed).toBe(false);
  });

  it('marks a fully evidenced candidate ready only for founder scale review', () => {
    const decision = evaluate(completeEvidence());

    expect(decision.evaluation).toEqual({ status: 'meets_proof_floor', blockers: [] });
    expect(decision.metrics).toMatchObject({
      totalEntries: 3,
      freshCurrentEntries: 3,
      distinctFreshExecutions: 3,
      freshExactHeadPasses: 3,
      passRate: 1,
      failureRate: 0,
      proofCoverage: 1,
      p95LatencyMs: 500,
      retryRate: 0,
      latencyCoverage: 1,
      costCoverage: 1,
      retryCoverage: 1,
    });
    expect(decision.metrics.costPerPassUsd).toBeCloseTo(0.25 / 3);
    expect(decision.optimization.status).toBe('none');
    expect(decision.optimization.executionAllowed).toBe(false);
    expect(decision.scaleGate.status).toBe('ready_for_founder_scale_review');
    expect(decision.scaleGate.scaleAuthorized).toBe(false);
    expect(decision.scaleGate.nextGate).toMatch(/separate explicit authority/i);
  });

  it('does not allow stale evidence or a caller-supplied historical evaluation time to satisfy proof', () => {
    const entries = completeEvidence();
    entries[1] = evidence('browser-stale', 'playwright', { observedAt: STALE });

    const decision = evaluateEvidenceScaleGate({
      projectSlug: 'founder-control-room',
      expectedHeadSha: HEAD,
      evidence: entries,
      policy,
      evaluatedAt: '2026-08-13T20:01:00.000Z',
    } as FcrEvidenceScaleInput & { evaluatedAt: string });

    expect(decision.clockSource).toBe('system');
    expect(decision.evaluatedAt).toBe(NOW);
    expect(decision.metrics.staleCurrentEntries).toBe(1);
    expect(decision.metrics.proofCoverage).toBeCloseTo(2 / 3);
    expect(decision.evaluation.blockers).toContain(
      'missing fresh exact-head PASS evidence for required kind: playwright',
    );
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('rejects PASS evidence that is not bound to the exact expected head', () => {
    const entries = completeEvidence();
    entries[2] = evidence('runtime-wrong-head', 'runtime', { observedHeadSha: OTHER_HEAD });

    const decision = evaluate(entries);

    expect(decision.ledger.integrityFailures).toContain(
      'PASS evidence runtime-wrong-head is not bound to the exact expected head',
    );
    expect(decision.evaluation.status).toBe('blocked');
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('rejects cross-project evidence even when the SHA matches', () => {
    const entries = completeEvidence();
    entries[0] = evidence('foreign-test', 'test', { projectSlug: 'another-project' });

    const decision = evaluate(entries);

    expect(decision.ledger.integrityFailures.join(' ')).toMatch(/does not match evaluated project/);
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('keeps historical evidence visible without letting it prove the current head', () => {
    const entries = [
      ...completeEvidence(),
      evidence('old-head-pass', 'review', {
        requestedHeadSha: OTHER_HEAD,
        observedHeadSha: OTHER_HEAD,
        observedAt: FRESH,
      }),
    ];

    const decision = evaluate(entries);

    expect(decision.metrics.totalEntries).toBe(4);
    expect(decision.metrics.historicalEntries).toBe(1);
    expect(decision.metrics.currentHeadEntries).toBe(3);
    expect(decision.metrics.freshExactHeadPasses).toBe(3);
    expect(decision.scaleGate.status).toBe('ready_for_founder_scale_review');
  });

  it('requires complete telemetry when the explicit policy contains an efficiency budget', () => {
    const entries = completeEvidence().map(({
      latencyMs: _latency,
      costUsd: _cost,
      attempts: _attempts,
      ...entry
    }) => entry);

    const decision = evaluate(entries);

    expect(decision.metrics.p95LatencyMs).toBeNull();
    expect(decision.metrics.costPerPassUsd).toBeNull();
    expect(decision.metrics.retryRate).toBeNull();
    expect(decision.metrics.latencyCoverage).toBe(0);
    expect(decision.metrics.costCoverage).toBe(0);
    expect(decision.metrics.retryCoverage).toBe(0);
    expect(decision.evaluation.blockers).toEqual(expect.arrayContaining([
      'latency telemetry coverage 0.0000 is below required 1',
      'cost telemetry coverage 0.0000 is below required 1',
      'retry telemetry coverage 0.0000 is below required 1',
    ]));
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('blocks partial telemetry so healthy samples cannot hide unmeasured work', () => {
    const entries = completeEvidence();
    const { latencyMs: _latency, costUsd: _cost, attempts: _attempts, ...unmeasuredRuntime } = entries[2];
    entries[2] = unmeasuredRuntime;

    const decision = evaluate(entries);

    expect(decision.metrics.latencyCoverage).toBeCloseTo(2 / 3);
    expect(decision.metrics.costCoverage).toBeCloseTo(2 / 3);
    expect(decision.metrics.retryCoverage).toBeCloseTo(2 / 3);
    expect(decision.evaluation.blockers).toEqual(expect.arrayContaining([
      'latency telemetry coverage 0.6667 is below required 1',
      'cost telemetry coverage 0.6667 is below required 1',
      'retry telemetry coverage 0.6667 is below required 1',
    ]));
    expect(decision.optimization.status).toBe('blocked_by_proof');
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('computes reliability over immutable execution identities instead of evidence-entry counts', () => {
    const sharedExecution = 'run:shared-pass';
    const paddedPasses = [
      evidence('test-pass', 'test', { executionId: sharedExecution }),
      evidence('browser-pass', 'playwright', { executionId: sharedExecution }),
      evidence('runtime-pass', 'runtime', { executionId: sharedExecution }),
      ...Array.from({ length: 20 }, (_, index) => evidence(`padding-${index}`, 'artifact', {
        executionId: sharedExecution,
      })),
    ];
    const failed = evidence('failed-run', 'log', {
      executionId: 'run:failure',
      verdict: 'FAIL',
      latencyMs: 10_000,
    });

    const decision = evaluate([...paddedPasses, failed], {
      minFreshExactHeadPasses: 1,
      minPassRate: 0.95,
      maxFailureRate: 0.05,
      maxP95LatencyMs: 1_000,
    });

    expect(decision.metrics.distinctFreshExecutions).toBe(2);
    expect(decision.metrics.passRate).toBe(0.5);
    expect(decision.metrics.failureRate).toBe(0.5);
    expect(decision.metrics.p95LatencyMs).toBe(10_000);
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('rejects duplicate provenance even if the caller renames the evidence', () => {
    const entries = completeEvidence();
    entries.push(evidence('renamed-copy', 'artifact', {
      provenanceId: entries[0].provenanceId,
    }));

    const decision = evaluate(entries);

    expect(decision.ledger.integrityFailures).toContain(`duplicate provenanceId: ${entries[0].provenanceId}`);
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('returns bounded optimization recommendations but requires authority before any change', () => {
    const entries = [
      evidence('test-slow', 'test', { latencyMs: 1_500, costUsd: 0.8, attempts: 2 }),
      evidence('browser-slow', 'playwright', { latencyMs: 2_000, costUsd: 0.8, attempts: 1 }),
      evidence('runtime-slow', 'runtime', { latencyMs: 1_800, costUsd: 0.8, attempts: 2 }),
    ];

    const decision = evaluate(entries);

    expect(decision.evaluation.status).toBe('meets_proof_floor');
    expect(decision.optimization.status).toBe('recommended');
    expect(decision.optimization.recommendations.map((item) => item.code)).toEqual([
      'reduce_latency',
      'reduce_cost',
      'reduce_retries',
    ]);
    expect(decision.optimization.executionAllowed).toBe(false);
    expect(decision.scaleGate.status).toBe('optimize_first');
    expect(decision.scaleGate.scaleAuthorized).toBe(false);
    expect(decision.scaleGate.nextGate).toMatch(/obtain explicit .* approval .* before any change/i);
  });

  it('fails closed on a fresh reliability regression even when required proof kinds exist', () => {
    const entries = [
      ...completeEvidence(),
      evidence('fresh-failure', 'log', { verdict: 'FAIL', observedHeadSha: HEAD }),
    ];

    const decision = evaluate(entries);

    expect(decision.metrics.passRate).toBe(0.75);
    expect(decision.metrics.failureRate).toBe(0.25);
    expect(decision.evaluation.blockers.join(' ')).toMatch(/pass rate|failure rate/);
    expect(decision.optimization.status).toBe('blocked_by_proof');
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('fails closed on malformed deserialized fields instead of throwing', () => {
    const malformed = {
      ...completeEvidence()[0],
      evidenceId: null,
      requestedHeadSha: null,
    } as unknown as FcrEvidenceLedgerEntry;

    expect(() => evaluate([malformed])).not.toThrow();
    const decision = evaluate([malformed]);

    expect(decision.ledger.integrityFailures.join(' ')).toMatch(/must be a string|requestedHeadSha is invalid/);
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('rejects unsupported runtime enum values instead of trusting TypeScript callers', () => {
    const entries = completeEvidence();
    entries[0] = {
      ...entries[0],
      kind: 'mystery' as FcrEvidenceLedgerEntry['kind'],
      verdict: 'MAYBE' as FcrEvidenceLedgerEntry['verdict'],
      source: 'shadow-ledger' as FcrEvidenceLedgerEntry['source'],
    };

    const decision = evaluate(entries);

    expect(decision.ledger.integrityFailures).toEqual(expect.arrayContaining([
      'evidence test-green has unsupported kind: mystery',
      'evidence test-green has unsupported verdict: MAYBE',
      'evidence test-green has unsupported source: shadow-ledger',
    ]));
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('validates capability receipts before giving their evidence capability-receipt provenance', () => {
    const request = capabilityRequest();
    const receipt = capabilityReceipt(request);

    const normalized = normalizeCapabilityReceiptEvidence({
      projectSlug: 'founder-control-room',
      request,
      receipt,
    });

    expect(normalized.integrityFailures).toEqual([]);
    expect(normalized.evidence).toEqual([expect.objectContaining({
      evidenceId: 'capability-test',
      projectSlug: 'founder-control-room',
      executionId: 'run-1:attempt-1',
      provenanceId: `${receipt.receiptDigest}:${receipt.evidence[0].digest}`,
      source: 'capability-receipt',
      requestedHeadSha: HEAD,
      observedHeadSha: HEAD,
    })]);
  });

  it('refuses forged, failed, or digest-invalid capability receipts', () => {
    const request = capabilityRequest();
    const receipt = capabilityReceipt(request);
    receipt.execution = 'FAILED';
    receipt.receiptDigest = 'd'.repeat(64);

    const normalized = normalizeCapabilityReceiptEvidence({
      projectSlug: 'founder-control-room',
      request,
      receipt,
    });

    expect(normalized.evidence).toEqual([]);
    expect(normalized.integrityFailures.join(' ')).toMatch(/digest|execution must be COMPLETED/i);
  });

  it('binds the decision to an auditable policy snapshot and digest', () => {
    const strict = evaluate(completeEvidence());
    const permissive = evaluate(completeEvidence(), {
      policyId: 'temporary-debug',
      policyVersion: '0.0.1',
      minPassRate: 0,
      maxFailureRate: 1,
      maxP95LatencyMs: undefined,
      maxCostPerPassUsd: undefined,
      maxRetryRate: undefined,
    });

    expect(strict.policy.thresholds.minPassRate).toBe(0.95);
    expect(strict.policy.policyId).toBe('founder-scale-default');
    expect(strict.policy.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(permissive.policy.policyId).toBe('temporary-debug');
    expect(permissive.policy.digest).not.toBe(strict.policy.digest);
    expect('score' in strict).toBe(false);
  });

  it('rejects malformed optional policy thresholds instead of silently dropping them', () => {
    const decision = evaluateEvidenceScaleGate({
      projectSlug: 'founder-control-room',
      expectedHeadSha: HEAD,
      evidence: completeEvidence(),
      policy: {
        ...policy,
        maxRetryRate: 'fast',
      },
    } as unknown as FcrEvidenceScaleInput);

    expect(decision.evaluation.blockers.join(' ')).toMatch(/maxRetryRate must be a finite number/);
    expect(decision.scaleGate.status).toBe('blocked');
  });
});
