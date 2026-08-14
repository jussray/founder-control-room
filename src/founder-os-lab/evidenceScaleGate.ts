import type { CapabilityReceiptV1 } from './capabilityExecutionContracts.js';

export const FCR_EVIDENCE_SCALE_GATE_CONTRACT = 'juss/fcr-evidence-scale-gate@v1' as const;

export type FcrEvidenceKind =
  | 'test'
  | 'log'
  | 'artifact'
  | 'playwright'
  | 'review'
  | 'runtime'
  | 'deployment'
  | 'security'
  | 'quality';

export type FcrEvidenceVerdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';
export type FcrEvidenceSource =
  | 'capability-receipt'
  | 'test-ledger'
  | 'proof-of-ship'
  | 'runtime'
  | 'manual';

export interface FcrEvidenceLedgerEntry {
  evidenceId: string;
  kind: FcrEvidenceKind;
  verdict: FcrEvidenceVerdict;
  source: FcrEvidenceSource;
  requestedHeadSha: string;
  observedHeadSha: string | null;
  observedAt: string;
  latencyMs?: number;
  costUsd?: number;
  attempts?: number;
}

export interface FcrEvidenceScalePolicy {
  requiredEvidenceKinds: FcrEvidenceKind[];
  maxEvidenceAgeMs: number;
  minFreshExactHeadPasses: number;
  minPassRate: number;
  maxFailureRate: number;
  maxP95LatencyMs?: number;
  maxCostPerPassUsd?: number;
  maxRetryRate?: number;
}

export interface FcrEvidenceScaleInput {
  projectSlug: string;
  expectedHeadSha: string;
  evaluatedAt: string;
  evidence: FcrEvidenceLedgerEntry[];
  policy: FcrEvidenceScalePolicy;
}

export interface FcrEvidenceScaleMetrics {
  totalEntries: number;
  historicalEntries: number;
  currentHeadEntries: number;
  freshCurrentEntries: number;
  staleCurrentEntries: number;
  freshExactHeadPasses: number;
  passRate: number | null;
  failureRate: number | null;
  proofCoverage: number;
  p95LatencyMs: number | null;
  costPerPassUsd: number | null;
  retryRate: number | null;
  latencyCoverage: number | null;
  costCoverage: number | null;
  retryCoverage: number | null;
}

export interface FcrOptimizationRecommendation {
  code: 'reduce_latency' | 'reduce_cost' | 'reduce_retries';
  reason: string;
  observed: number;
  threshold: number;
}

export interface FcrEvidenceScaleDecision {
  contract: typeof FCR_EVIDENCE_SCALE_GATE_CONTRACT;
  projectSlug: string;
  expectedHeadSha: string;
  evaluatedAt: string;
  ledger: {
    evidenceIds: string[];
    integrityFailures: string[];
  };
  metrics: FcrEvidenceScaleMetrics;
  evaluation: {
    status: 'blocked' | 'meets_proof_floor';
    blockers: string[];
  };
  optimization: {
    status: 'blocked_by_proof' | 'recommended' | 'none';
    recommendations: FcrOptimizationRecommendation[];
    executionAllowed: false;
  };
  scaleGate: {
    status: 'blocked' | 'optimize_first' | 'ready_for_founder_scale_review';
    scaleAuthorized: false;
    executionAllowed: false;
    nextGate: string;
  };
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const EVIDENCE_KINDS = new Set<FcrEvidenceKind>([
  'test',
  'log',
  'artifact',
  'playwright',
  'review',
  'runtime',
  'deployment',
  'security',
  'quality',
]);
const EVIDENCE_VERDICTS = new Set<FcrEvidenceVerdict>(['PASS', 'FAIL', 'INCONCLUSIVE']);
const EVIDENCE_SOURCES = new Set<FcrEvidenceSource>([
  'capability-receipt',
  'test-ledger',
  'proof-of-ship',
  'runtime',
  'manual',
]);

function isFiniteNonNegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function policyErrors(policy: FcrEvidenceScalePolicy): string[] {
  const errors: string[] = [];
  if (policy.requiredEvidenceKinds.length === 0) errors.push('policy requires at least one evidence kind');
  if (new Set(policy.requiredEvidenceKinds).size !== policy.requiredEvidenceKinds.length) {
    errors.push('policy requiredEvidenceKinds must be unique');
  }
  for (const kind of policy.requiredEvidenceKinds) {
    if (!EVIDENCE_KINDS.has(kind)) errors.push(`policy contains unsupported evidence kind: ${String(kind)}`);
  }
  if (!Number.isInteger(policy.maxEvidenceAgeMs) || policy.maxEvidenceAgeMs <= 0) {
    errors.push('policy maxEvidenceAgeMs must be a positive integer');
  }
  if (!Number.isInteger(policy.minFreshExactHeadPasses) || policy.minFreshExactHeadPasses <= 0) {
    errors.push('policy minFreshExactHeadPasses must be a positive integer');
  }
  if (!Number.isFinite(policy.minPassRate) || policy.minPassRate < 0 || policy.minPassRate > 1) {
    errors.push('policy minPassRate must be between 0 and 1');
  }
  if (!Number.isFinite(policy.maxFailureRate) || policy.maxFailureRate < 0 || policy.maxFailureRate > 1) {
    errors.push('policy maxFailureRate must be between 0 and 1');
  }
  for (const [name, value] of [
    ['maxP95LatencyMs', policy.maxP95LatencyMs],
    ['maxCostPerPassUsd', policy.maxCostPerPassUsd],
    ['maxRetryRate', policy.maxRetryRate],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      errors.push(`policy ${name} must be a finite non-negative number when supplied`);
    }
  }
  if (policy.maxRetryRate !== undefined && policy.maxRetryRate > 1) {
    errors.push('policy maxRetryRate must not exceed 1');
  }
  return errors;
}

function evidenceIntegrityFailures(
  input: FcrEvidenceScaleInput,
  evaluatedAtMs: number,
): string[] {
  const failures: string[] = [];
  const ids = new Set<string>();

  for (const entry of input.evidence) {
    const evidenceLabel = entry.evidenceId || '<missing>';
    if (!entry.evidenceId.trim()) {
      failures.push('evidenceId is required');
    } else if (ids.has(entry.evidenceId)) {
      failures.push(`duplicate evidenceId: ${entry.evidenceId}`);
    } else {
      ids.add(entry.evidenceId);
    }

    if (!EVIDENCE_KINDS.has(entry.kind)) {
      failures.push(`evidence ${evidenceLabel} has unsupported kind: ${String(entry.kind)}`);
    }
    if (!EVIDENCE_VERDICTS.has(entry.verdict)) {
      failures.push(`evidence ${evidenceLabel} has unsupported verdict: ${String(entry.verdict)}`);
    }
    if (!EVIDENCE_SOURCES.has(entry.source)) {
      failures.push(`evidence ${evidenceLabel} has unsupported source: ${String(entry.source)}`);
    }

    if (!FULL_SHA.test(entry.requestedHeadSha)) {
      failures.push(`evidence ${evidenceLabel} requestedHeadSha is invalid`);
    }
    if (entry.observedHeadSha !== null && !FULL_SHA.test(entry.observedHeadSha)) {
      failures.push(`evidence ${evidenceLabel} observedHeadSha is invalid`);
    }

    const observedAtMs = Date.parse(entry.observedAt);
    if (Number.isNaN(observedAtMs)) {
      failures.push(`evidence ${evidenceLabel} observedAt is invalid`);
    } else if (observedAtMs > evaluatedAtMs) {
      failures.push(`evidence ${evidenceLabel} is dated after evaluatedAt`);
    }

    if (entry.latencyMs !== undefined && !isFiniteNonNegative(entry.latencyMs)) {
      failures.push(`evidence ${evidenceLabel} latencyMs must be finite and non-negative`);
    }
    if (entry.costUsd !== undefined && !isFiniteNonNegative(entry.costUsd)) {
      failures.push(`evidence ${evidenceLabel} costUsd must be finite and non-negative`);
    }
    if (entry.attempts !== undefined && (!Number.isInteger(entry.attempts) || entry.attempts < 1)) {
      failures.push(`evidence ${evidenceLabel} attempts must be an integer of at least 1`);
    }

    if (
      entry.verdict === 'PASS'
      && entry.requestedHeadSha.toLowerCase() === input.expectedHeadSha.toLowerCase()
      && entry.observedHeadSha?.toLowerCase() !== input.expectedHeadSha.toLowerCase()
    ) {
      failures.push(`PASS evidence ${evidenceLabel} is not bound to the exact expected head`);
    }
  }

  return unique(failures);
}

export function normalizeCapabilityReceiptEvidence(receipt: CapabilityReceiptV1): FcrEvidenceLedgerEntry[] {
  return receipt.evidence.map((entry) => ({
    evidenceId: entry.evidenceId,
    kind: entry.kind,
    verdict: entry.verdict,
    source: 'capability-receipt',
    requestedHeadSha: entry.requestedHeadSha,
    observedHeadSha: entry.observedHeadSha,
    observedAt: entry.observedAt,
  }));
}

export function evaluateEvidenceScaleGate(input: FcrEvidenceScaleInput): FcrEvidenceScaleDecision {
  const blockers: string[] = [];
  const evaluatedAtMs = Date.parse(input.evaluatedAt);

  if (!input.projectSlug.trim()) blockers.push('projectSlug is required');
  if (!FULL_SHA.test(input.expectedHeadSha)) blockers.push('expectedHeadSha must be a full Git SHA');
  if (Number.isNaN(evaluatedAtMs)) blockers.push('evaluatedAt must be a valid ISO date');
  blockers.push(...policyErrors(input.policy));

  const integrityFailures = Number.isNaN(evaluatedAtMs)
    ? []
    : evidenceIntegrityFailures(input, evaluatedAtMs);
  blockers.push(...integrityFailures);

  const expectedHead = input.expectedHeadSha.toLowerCase();
  const currentHeadEntries = input.evidence.filter(
    (entry) => entry.requestedHeadSha.toLowerCase() === expectedHead,
  );
  const historicalEntries = input.evidence.length - currentHeadEntries.length;

  const freshCurrentEntries = Number.isNaN(evaluatedAtMs)
    ? []
    : currentHeadEntries.filter((entry) => {
      const observedAtMs = Date.parse(entry.observedAt);
      return !Number.isNaN(observedAtMs)
        && observedAtMs <= evaluatedAtMs
        && evaluatedAtMs - observedAtMs <= input.policy.maxEvidenceAgeMs;
    });
  const staleCurrentEntries = currentHeadEntries.length - freshCurrentEntries.length;

  const freshExactHeadPasses = freshCurrentEntries.filter(
    (entry) => entry.verdict === 'PASS' && entry.observedHeadSha?.toLowerCase() === expectedHead,
  );
  const freshFailures = freshCurrentEntries.filter((entry) => entry.verdict === 'FAIL');
  const passRate = ratio(freshExactHeadPasses.length, freshCurrentEntries.length);
  const failureRate = ratio(freshFailures.length, freshCurrentEntries.length);

  const satisfiedKinds = new Set(freshExactHeadPasses.map((entry) => entry.kind));
  const missingKinds = input.policy.requiredEvidenceKinds.filter((kind) => !satisfiedKinds.has(kind));
  const proofCoverage = input.policy.requiredEvidenceKinds.length === 0
    ? 0
    : (input.policy.requiredEvidenceKinds.length - missingKinds.length) / input.policy.requiredEvidenceKinds.length;

  if (input.evidence.length === 0) blockers.push('no evidence supplied');
  for (const kind of missingKinds) blockers.push(`missing fresh exact-head PASS evidence for required kind: ${kind}`);
  if (freshExactHeadPasses.length < input.policy.minFreshExactHeadPasses) {
    blockers.push(`fresh exact-head PASS samples ${freshExactHeadPasses.length} are below required ${input.policy.minFreshExactHeadPasses}`);
  }
  if (passRate === null || passRate < input.policy.minPassRate) {
    blockers.push(`pass rate ${passRate === null ? 'unavailable' : passRate.toFixed(4)} is below required ${input.policy.minPassRate}`);
  }
  if (failureRate === null || failureRate > input.policy.maxFailureRate) {
    blockers.push(`failure rate ${failureRate === null ? 'unavailable' : failureRate.toFixed(4)} exceeds allowed ${input.policy.maxFailureRate}`);
  }

  const latencySamples = freshCurrentEntries
    .map((entry) => entry.latencyMs)
    .filter(isFiniteNonNegative);
  const p95LatencyMs = p95(latencySamples);
  const latencyCoverage = ratio(latencySamples.length, freshCurrentEntries.length);

  const costSamples = freshCurrentEntries
    .map((entry) => entry.costUsd)
    .filter(isFiniteNonNegative);
  const totalCostUsd = costSamples.reduce((sum, value) => sum + value, 0);
  const costPerPassUsd = costSamples.length === 0 || freshExactHeadPasses.length === 0
    ? null
    : totalCostUsd / freshExactHeadPasses.length;
  const costCoverage = ratio(costSamples.length, freshCurrentEntries.length);

  const attemptSamples = freshCurrentEntries
    .map((entry) => entry.attempts)
    .filter((value): value is number => value !== undefined && Number.isInteger(value) && value >= 1);
  const retryRate = attemptSamples.length === 0
    ? null
    : attemptSamples.filter((value) => value > 1).length / attemptSamples.length;
  const retryCoverage = ratio(attemptSamples.length, freshCurrentEntries.length);

  if (input.policy.maxP95LatencyMs !== undefined && latencyCoverage !== 1) {
    blockers.push(`latency telemetry coverage ${latencyCoverage === null ? 'unavailable' : latencyCoverage.toFixed(4)} is below required 1`);
  }
  if (input.policy.maxCostPerPassUsd !== undefined && costCoverage !== 1) {
    blockers.push(`cost telemetry coverage ${costCoverage === null ? 'unavailable' : costCoverage.toFixed(4)} is below required 1`);
  }
  if (input.policy.maxRetryRate !== undefined && retryCoverage !== 1) {
    blockers.push(`retry telemetry coverage ${retryCoverage === null ? 'unavailable' : retryCoverage.toFixed(4)} is below required 1`);
  }

  const recommendations: FcrOptimizationRecommendation[] = [];
  if (
    input.policy.maxP95LatencyMs !== undefined
    && latencyCoverage === 1
    && p95LatencyMs !== null
    && p95LatencyMs > input.policy.maxP95LatencyMs
  ) {
    recommendations.push({
      code: 'reduce_latency',
      reason: 'Fresh current-head latency exceeds the explicit policy budget.',
      observed: p95LatencyMs,
      threshold: input.policy.maxP95LatencyMs,
    });
  }
  if (
    input.policy.maxCostPerPassUsd !== undefined
    && costCoverage === 1
    && costPerPassUsd !== null
    && costPerPassUsd > input.policy.maxCostPerPassUsd
  ) {
    recommendations.push({
      code: 'reduce_cost',
      reason: 'Fresh current-head cost per exact-head PASS exceeds the explicit policy budget.',
      observed: costPerPassUsd,
      threshold: input.policy.maxCostPerPassUsd,
    });
  }
  if (
    input.policy.maxRetryRate !== undefined
    && retryCoverage === 1
    && retryRate !== null
    && retryRate > input.policy.maxRetryRate
  ) {
    recommendations.push({
      code: 'reduce_retries',
      reason: 'Fresh current-head retry rate exceeds the explicit policy budget.',
      observed: retryRate,
      threshold: input.policy.maxRetryRate,
    });
  }

  const uniqueBlockers = unique(blockers);
  const proofBlocked = uniqueBlockers.length > 0;
  const scaleStatus = proofBlocked
    ? 'blocked'
    : recommendations.length > 0
      ? 'optimize_first'
      : 'ready_for_founder_scale_review';

  return {
    contract: FCR_EVIDENCE_SCALE_GATE_CONTRACT,
    projectSlug: input.projectSlug.trim(),
    expectedHeadSha: input.expectedHeadSha,
    evaluatedAt: input.evaluatedAt,
    ledger: {
      evidenceIds: input.evidence.map((entry) => entry.evidenceId),
      integrityFailures,
    },
    metrics: {
      totalEntries: input.evidence.length,
      historicalEntries,
      currentHeadEntries: currentHeadEntries.length,
      freshCurrentEntries: freshCurrentEntries.length,
      staleCurrentEntries,
      freshExactHeadPasses: freshExactHeadPasses.length,
      passRate,
      failureRate,
      proofCoverage,
      p95LatencyMs,
      costPerPassUsd,
      retryRate,
      latencyCoverage,
      costCoverage,
      retryCoverage,
    },
    evaluation: {
      status: proofBlocked ? 'blocked' : 'meets_proof_floor',
      blockers: uniqueBlockers,
    },
    optimization: {
      status: proofBlocked ? 'blocked_by_proof' : recommendations.length > 0 ? 'recommended' : 'none',
      recommendations,
      executionAllowed: false,
    },
    scaleGate: {
      status: scaleStatus,
      scaleAuthorized: false,
      executionAllowed: false,
      nextGate: proofBlocked
        ? 'Repair or refresh the failed evidence contract before optimization or scale review.'
        : recommendations.length > 0
          ? 'Apply one bounded optimization, collect fresh exact-head evidence, then reevaluate.'
          : 'Founder reviews the evidence-backed scale candidate; scaling still requires separate explicit authority and execution proof.',
    },
  };
}
