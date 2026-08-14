import { describe, expect, it } from 'vitest';

import {
  evaluateEvidenceScaleGate,
  FCR_EVIDENCE_SCALE_GATE_CONTRACT,
  normalizeCapabilityReceiptEvidence,
  type FcrEvidenceLedgerEntry,
  type FcrEvidenceScalePolicy,
} from '../evidenceScaleGate.js';
import type { CapabilityReceiptV1 } from '../capabilityExecutionContracts.js';

const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const NOW = '2026-08-14T22:00:00.000Z';
const FRESH = '2026-08-14T21:55:00.000Z';
const STALE = '2026-08-13T20:00:00.000Z';

const policy: FcrEvidenceScalePolicy = {
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
    evaluatedAt: NOW,
    evidence: entries,
    policy: { ...policy, ...overrides },
  });
}

describe('FCR evidence-to-scale decision kernel', () => {
  it('fails closed when no evidence exists', () => {
    const decision = evaluate([]);

    expect(decision.contract).toBe(FCR_EVIDENCE_SCALE_GATE_CONTRACT);
    expect(decision.evaluation.status).toBe('blocked');
    expect(decision.evaluation.blockers).toContain('no evidence supplied');
    expect(decision.metrics.passRate).toBeNull();
    expect(decision.metrics.p95LatencyMs).toBeNull();
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
      freshExactHeadPasses: 3,
      passRate: 1,
      failureRate: 0,
      proofCoverage: 1,
      p95LatencyMs: 500,
      retryRate: 0,
    });
    expect(decision.metrics.costPerPassUsd).toBeCloseTo(0.25 / 3);
    expect(decision.optimization.status).toBe('none');
    expect(decision.optimization.executionAllowed).toBe(false);
    expect(decision.scaleGate.status).toBe('ready_for_founder_scale_review');
    expect(decision.scaleGate.scaleAuthorized).toBe(false);
    expect(decision.scaleGate.nextGate).toMatch(/separate explicit authority/i);
  });

  it('does not allow stale evidence to satisfy a current proof kind', () => {
    const entries = completeEvidence();
    entries[1] = evidence('browser-stale', 'playwright', { observedAt: STALE });

    const decision = evaluate(entries);

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

  it('requires telemetry when the explicit policy contains an efficiency budget', () => {
    const entries = completeEvidence().map(({ latencyMs: _latency, costUsd: _cost, attempts: _attempts, ...entry }) => entry);

    const decision = evaluate(entries);

    expect(decision.metrics.p95LatencyMs).toBeNull();
    expect(decision.metrics.costPerPassUsd).toBeNull();
    expect(decision.metrics.retryRate).toBeNull();
    expect(decision.evaluation.blockers).toEqual(expect.arrayContaining([
      'latency telemetry required by policy is unavailable',
      'cost telemetry required by policy is unavailable',
      'retry telemetry required by policy is unavailable',
    ]));
    expect(decision.scaleGate.status).toBe('blocked');
  });

  it('returns bounded optimization recommendations instead of authorizing scale', () => {
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

  it('normalizes existing capability receipts without granting them extra authority', () => {
    const receipt: CapabilityReceiptV1 = {
      contract: 'fcr/capability-receipt@v1',
      runId: 'run-1',
      attemptId: 'attempt-1',
      traceId: 'trace-1',
      capability: 'test.focused',
      requestedHeadSha: HEAD,
      observedHeadSha: HEAD,
      execution: 'COMPLETED',
      evidence: [{
        evidenceId: 'capability-test',
        kind: 'test',
        verdict: 'PASS',
        digest: 'c'.repeat(64),
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
      receiptDigest: 'd'.repeat(64),
    };

    expect(normalizeCapabilityReceiptEvidence(receipt)).toEqual([{
      evidenceId: 'capability-test',
      kind: 'test',
      verdict: 'PASS',
      source: 'capability-receipt',
      requestedHeadSha: HEAD,
      observedHeadSha: HEAD,
      observedAt: FRESH,
    }]);
  });

  it('keeps policy thresholds explicit instead of hiding a composite score', () => {
    const decision = evaluate(completeEvidence(), {
      maxP95LatencyMs: undefined,
      maxCostPerPassUsd: undefined,
      maxRetryRate: undefined,
    });

    expect(decision.metrics.p95LatencyMs).toBe(500);
    expect(decision.optimization.recommendations).toEqual([]);
    expect(decision.scaleGate.status).toBe('ready_for_founder_scale_review');
    expect('score' in decision).toBe(false);
  });
});
