import { createHash } from 'node:crypto';

import {
  validateCapabilityReceipt,
  validateCapabilityRequest,
  type CapabilityReceiptV1,
  type CapabilityRequestV1,
} from './capabilityExecutionContracts.js';

export const FCR_EVIDENCE_SCALE_GATE_CONTRACT = 'juss/fcr-evidence-scale-gate@v2' as const;
export const FCR_EVALUATION_TIME_AUTHORITY_CONTRACT = 'juss/fcr-evaluation-time-authority@v1' as const;

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
  projectSlug: string;
  executionId: string;
  provenanceId: string;
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
  policyId: string;
  policyVersion: string;
  requiredEvidenceKinds: FcrEvidenceKind[];
  maxEvidenceAgeMs: number;
  minFreshExactHeadPasses: number;
  minPassRate: number;
  maxFailureRate: number;
  maxP95LatencyMs?: number;
  maxCostPerPassUsd?: number;
  maxRetryRate?: number;
}

export interface FcrEvaluationTimeAuthority {
  contract: typeof FCR_EVALUATION_TIME_AUTHORITY_CONTRACT;
  authorityId: 'control-room-runtime';
  projectSlug: string;
  expectedHeadSha: string;
  policyDigest: string;
  evaluatedAt: string;
  validUntil: string;
  provenanceId: string;
}

export interface FcrEvidenceScaleInput {
  projectSlug: string;
  expectedHeadSha: string;
  evidence: FcrEvidenceLedgerEntry[];
  policy: FcrEvidenceScalePolicy;
  timeAuthority: FcrEvaluationTimeAuthority;
}

export interface FcrEvidenceScaleMetrics {
  totalEntries: number;
  historicalEntries: number;
  currentHeadEntries: number;
  freshCurrentEntries: number;
  staleCurrentEntries: number;
  distinctFreshExecutions: number;
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
  expiresAt: string;
  clockSource: 'authority-receipt';
  timeAuthority: FcrEvaluationTimeAuthority;
  policy: {
    policyId: string;
    policyVersion: string;
    digest: string;
    thresholds: FcrEvidenceScalePolicy;
  };
  ledger: {
    evidenceIds: string[];
    executionIds: string[];
    provenanceIds: string[];
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

export interface NormalizeCapabilityReceiptEvidenceInput {
  projectSlug: string;
  request: CapabilityRequestV1;
  receipt: CapabilityReceiptV1;
}

export interface NormalizeCapabilityReceiptEvidenceResult {
  evidence: FcrEvidenceLedgerEntry[];
  integrityFailures: string[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function stablePolicySnapshot(policy: FcrEvidenceScalePolicy): FcrEvidenceScalePolicy {
  return {
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    requiredEvidenceKinds: [...policy.requiredEvidenceKinds].sort(),
    maxEvidenceAgeMs: policy.maxEvidenceAgeMs,
    minFreshExactHeadPasses: policy.minFreshExactHeadPasses,
    minPassRate: policy.minPassRate,
    maxFailureRate: policy.maxFailureRate,
    ...(policy.maxP95LatencyMs === undefined ? {} : { maxP95LatencyMs: policy.maxP95LatencyMs }),
    ...(policy.maxCostPerPassUsd === undefined ? {} : { maxCostPerPassUsd: policy.maxCostPerPassUsd }),
    ...(policy.maxRetryRate === undefined ? {} : { maxRetryRate: policy.maxRetryRate }),
  };
}

export function computeEvidenceScalePolicyDigest(policy: FcrEvidenceScalePolicy): string {
  return createHash('sha256')
    .update(JSON.stringify(stablePolicySnapshot(policy)), 'utf8')
    .digest('hex');
}

function normalizePolicy(raw: unknown): { policy: FcrEvidenceScalePolicy; failures: string[] } {
  const failures: string[] = [];
  const record = isRecord(raw) ? raw : {};

  const policyId = asString(record.policyId) ?? '';
  const policyVersion = asString(record.policyVersion) ?? '';
  if (!policyId.trim()) failures.push('policyId is required');
  if (!policyVersion.trim()) failures.push('policyVersion is required');

  const rawKinds = Array.isArray(record.requiredEvidenceKinds) ? record.requiredEvidenceKinds : [];
  if (!Array.isArray(record.requiredEvidenceKinds)) failures.push('policy requiredEvidenceKinds must be an array');
  const requiredEvidenceKinds: FcrEvidenceKind[] = [];
  for (const value of rawKinds) {
    if (typeof value !== 'string' || !EVIDENCE_KINDS.has(value as FcrEvidenceKind)) {
      failures.push(`policy contains unsupported evidence kind: ${String(value)}`);
    } else {
      requiredEvidenceKinds.push(value as FcrEvidenceKind);
    }
  }

  const numberField = (name: string, fallback: number): number => {
    const parsed = asFiniteNumber(record[name]);
    if (parsed === null) {
      failures.push(`policy ${name} must be a finite number`);
      return fallback;
    }
    return parsed;
  };

  const optionalNumberField = (name: string): number | undefined => {
    if (!(name in record) || record[name] === undefined) return undefined;
    const parsed = asFiniteNumber(record[name]);
    if (parsed === null) {
      failures.push(`policy ${name} must be a finite number when supplied`);
      return undefined;
    }
    return parsed;
  };

  const policy: FcrEvidenceScalePolicy = {
    policyId,
    policyVersion,
    requiredEvidenceKinds,
    maxEvidenceAgeMs: numberField('maxEvidenceAgeMs', 0),
    minFreshExactHeadPasses: numberField('minFreshExactHeadPasses', 0),
    minPassRate: numberField('minPassRate', 0),
    maxFailureRate: numberField('maxFailureRate', 0),
    maxP95LatencyMs: optionalNumberField('maxP95LatencyMs'),
    maxCostPerPassUsd: optionalNumberField('maxCostPerPassUsd'),
    maxRetryRate: optionalNumberField('maxRetryRate'),
  };

  if (policy.requiredEvidenceKinds.length === 0) failures.push('policy requires at least one evidence kind');
  if (new Set(policy.requiredEvidenceKinds).size !== policy.requiredEvidenceKinds.length) {
    failures.push('policy requiredEvidenceKinds must be unique');
  }
  if (!Number.isInteger(policy.maxEvidenceAgeMs) || policy.maxEvidenceAgeMs <= 0) {
    failures.push('policy maxEvidenceAgeMs must be a positive integer');
  }
  if (!Number.isInteger(policy.minFreshExactHeadPasses) || policy.minFreshExactHeadPasses <= 0) {
    failures.push('policy minFreshExactHeadPasses must be a positive integer');
  }
  if (policy.minPassRate < 0 || policy.minPassRate > 1) {
    failures.push('policy minPassRate must be between 0 and 1');
  }
  if (policy.maxFailureRate < 0 || policy.maxFailureRate > 1) {
    failures.push('policy maxFailureRate must be between 0 and 1');
  }
  for (const [name, value] of [
    ['maxP95LatencyMs', policy.maxP95LatencyMs],
    ['maxCostPerPassUsd', policy.maxCostPerPassUsd],
    ['maxRetryRate', policy.maxRetryRate],
  ] as const) {
    if (value !== undefined && value < 0) {
      failures.push(`policy ${name} must be a finite non-negative number when supplied`);
    }
  }
  if (policy.maxRetryRate !== undefined && policy.maxRetryRate > 1) {
    failures.push('policy maxRetryRate must not exceed 1');
  }

  return { policy, failures: unique(failures) };
}

function normalizeTimeAuthority(
  raw: unknown,
  projectSlug: string,
  expectedHeadSha: string,
  expectedPolicyDigest: string,
): { authority: FcrEvaluationTimeAuthority; failures: string[] } {
  const failures: string[] = [];
  const record = isRecord(raw) ? raw : {};
  if (!isRecord(raw)) failures.push('timeAuthority must be an object');

  const contract = asString(record.contract) ?? '';
  const authorityId = asString(record.authorityId) ?? '';
  const receiptProject = asString(record.projectSlug) ?? '';
  const receiptHead = asString(record.expectedHeadSha) ?? '';
  const receiptPolicyDigest = asString(record.policyDigest) ?? '';
  const evaluatedAt = asString(record.evaluatedAt) ?? '';
  const validUntil = asString(record.validUntil) ?? '';
  const provenanceId = asString(record.provenanceId) ?? '';

  if (contract !== FCR_EVALUATION_TIME_AUTHORITY_CONTRACT) {
    failures.push('timeAuthority contract is unsupported');
  }
  if (authorityId !== 'control-room-runtime') {
    failures.push('timeAuthority authorityId must be control-room-runtime');
  }
  if (receiptProject !== projectSlug) {
    failures.push('timeAuthority projectSlug does not match evaluated project');
  }
  if (receiptHead.toLowerCase() !== expectedHeadSha.toLowerCase()) {
    failures.push('timeAuthority expectedHeadSha does not match evaluated head');
  }
  if (receiptPolicyDigest !== expectedPolicyDigest) {
    failures.push('timeAuthority policyDigest does not match evaluated policy');
  }
  if (!/^fcr-time:[0-9a-f]{64}$/i.test(provenanceId)) {
    failures.push('timeAuthority provenanceId must be an fcr-time sha256 receipt id');
  }

  const evaluatedAtMs = Date.parse(evaluatedAt);
  const validUntilMs = Date.parse(validUntil);
  if (!evaluatedAt || Number.isNaN(evaluatedAtMs)) {
    failures.push('timeAuthority evaluatedAt must be an ISO-compatible timestamp');
  }
  if (!validUntil || Number.isNaN(validUntilMs)) {
    failures.push('timeAuthority validUntil must be an ISO-compatible timestamp');
  }
  if (!Number.isNaN(evaluatedAtMs) && !Number.isNaN(validUntilMs) && validUntilMs < evaluatedAtMs) {
    failures.push('timeAuthority validUntil must not precede evaluatedAt');
  }

  return {
    authority: {
      contract: FCR_EVALUATION_TIME_AUTHORITY_CONTRACT,
      authorityId: 'control-room-runtime',
      projectSlug: receiptProject,
      expectedHeadSha: receiptHead,
      policyDigest: receiptPolicyDigest,
      evaluatedAt,
      validUntil,
      provenanceId,
    },
    failures: unique(failures),
  };
}

function normalizeEvidenceEntry(raw: unknown, index: number): {
  entry: FcrEvidenceLedgerEntry;
  failures: string[];
} {
  const failures: string[] = [];
  const record = isRecord(raw) ? raw : {};
  if (!isRecord(raw)) failures.push(`evidence at index ${index} must be an object`);

  const stringField = (name: string): string => {
    const value = asString(record[name]);
    if (value === null) {
      failures.push(`evidence at index ${index} ${name} must be a string`);
      return '';
    }
    return value;
  };

  const evidenceId = stringField('evidenceId');
  const projectSlug = stringField('projectSlug');
  const executionId = stringField('executionId');
  const provenanceId = stringField('provenanceId');
  const requestedHeadSha = stringField('requestedHeadSha');
  const observedAt = stringField('observedAt');

  const observedHeadRaw = record.observedHeadSha;
  let observedHeadSha: string | null = null;
  if (observedHeadRaw !== null) {
    const parsed = asString(observedHeadRaw);
    if (parsed === null) failures.push(`evidence ${evidenceId || `<index:${index}>`} observedHeadSha must be a string or null`);
    else observedHeadSha = parsed;
  }

  const kindRaw = record.kind;
  const kind = typeof kindRaw === 'string' && EVIDENCE_KINDS.has(kindRaw as FcrEvidenceKind)
    ? kindRaw as FcrEvidenceKind
    : 'artifact';
  if (typeof kindRaw !== 'string' || !EVIDENCE_KINDS.has(kindRaw as FcrEvidenceKind)) {
    failures.push(`evidence ${evidenceId || `<index:${index}>`} has unsupported kind: ${String(kindRaw)}`);
  }

  const verdictRaw = record.verdict;
  const verdict = typeof verdictRaw === 'string' && EVIDENCE_VERDICTS.has(verdictRaw as FcrEvidenceVerdict)
    ? verdictRaw as FcrEvidenceVerdict
    : 'INCONCLUSIVE';
  if (typeof verdictRaw !== 'string' || !EVIDENCE_VERDICTS.has(verdictRaw as FcrEvidenceVerdict)) {
    failures.push(`evidence ${evidenceId || `<index:${index}>`} has unsupported verdict: ${String(verdictRaw)}`);
  }

  const sourceRaw = record.source;
  const source = typeof sourceRaw === 'string' && EVIDENCE_SOURCES.has(sourceRaw as FcrEvidenceSource)
    ? sourceRaw as FcrEvidenceSource
    : 'manual';
  if (typeof sourceRaw !== 'string' || !EVIDENCE_SOURCES.has(sourceRaw as FcrEvidenceSource)) {
    failures.push(`evidence ${evidenceId || `<index:${index}>`} has unsupported source: ${String(sourceRaw)}`);
  }

  const optionalMetric = (name: string): number | undefined => {
    if (!(name in record) || record[name] === undefined) return undefined;
    const value = asFiniteNumber(record[name]);
    if (value === null || value < 0) {
      failures.push(`evidence ${evidenceId || `<index:${index}>`} ${name} must be finite and non-negative`);
      return undefined;
    }
    return value;
  };

  const latencyMs = optionalMetric('latencyMs');
  const costUsd = optionalMetric('costUsd');
  let attempts: number | undefined;
  if ('attempts' in record && record.attempts !== undefined) {
    const value = asFiniteNumber(record.attempts);
    if (value === null || !Number.isInteger(value) || value < 1) {
      failures.push(`evidence ${evidenceId || `<index:${index}>`} attempts must be an integer of at least 1`);
    } else {
      attempts = value;
    }
  }

  if (!evidenceId.trim()) failures.push('evidenceId is required');
  if (!projectSlug.trim()) failures.push(`evidence ${evidenceId || `<index:${index}>`} projectSlug is required`);
  if (!executionId.trim()) failures.push(`evidence ${evidenceId || `<index:${index}>`} executionId is required`);
  if (!provenanceId.trim()) failures.push(`evidence ${evidenceId || `<index:${index}>`} provenanceId is required`);
  if (!FULL_SHA.test(requestedHeadSha)) failures.push(`evidence ${evidenceId || `<index:${index}>`} requestedHeadSha is invalid`);
  if (observedHeadSha !== null && !FULL_SHA.test(observedHeadSha)) {
    failures.push(`evidence ${evidenceId || `<index:${index}>`} observedHeadSha is invalid`);
  }
  if (!observedAt || Number.isNaN(Date.parse(observedAt))) {
    failures.push(`evidence ${evidenceId || `<index:${index}>`} observedAt is invalid`);
  }

  return {
    entry: {
      evidenceId,
      projectSlug,
      executionId,
      provenanceId,
      kind,
      verdict,
      source,
      requestedHeadSha,
      observedHeadSha,
      observedAt,
      ...(latencyMs === undefined ? {} : { latencyMs }),
      ...(costUsd === undefined ? {} : { costUsd }),
      ...(attempts === undefined ? {} : { attempts }),
    },
    failures,
  };
}

function executionMetric(
  entries: FcrEvidenceLedgerEntry[],
  field: 'latencyMs' | 'costUsd' | 'attempts',
  failures: string[],
): number | null {
  const values = unique(
    entries
      .map((entry) => entry[field])
      .filter((value): value is number => typeof value === 'number')
      .map((value) => String(value)),
  ).map(Number);

  if (values.length === 0) return null;
  if (values.length > 1) {
    failures.push(`execution ${entries[0].executionId} has conflicting ${field} telemetry`);
    return null;
  }
  return values[0];
}

function groupByExecution(entries: FcrEvidenceLedgerEntry[]): Map<string, FcrEvidenceLedgerEntry[]> {
  const groups = new Map<string, FcrEvidenceLedgerEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.executionId) ?? [];
    group.push(entry);
    groups.set(entry.executionId, group);
  }
  return groups;
}

function executionVerdict(entries: FcrEvidenceLedgerEntry[]): FcrEvidenceVerdict {
  if (entries.some((entry) => entry.verdict === 'FAIL')) return 'FAIL';
  if (entries.some((entry) => entry.verdict === 'INCONCLUSIVE')) return 'INCONCLUSIVE';
  return 'PASS';
}

export function normalizeCapabilityReceiptEvidence(
  input: NormalizeCapabilityReceiptEvidenceInput,
): NormalizeCapabilityReceiptEvidenceResult {
  const integrityFailures: string[] = [];
  if (!isRecord(input)) {
    return { evidence: [], integrityFailures: ['capability receipt normalization input must be an object'] };
  }

  const projectSlug = asString((input as unknown as Record<string, unknown>).projectSlug) ?? '';
  if (!projectSlug.trim()) integrityFailures.push('projectSlug is required for capability receipt normalization');

  const request = (input as unknown as Record<string, unknown>).request;
  const receipt = (input as unknown as Record<string, unknown>).receipt;
  if (!isRecord(request)) integrityFailures.push('capability request must be an object');
  if (!isRecord(receipt)) integrityFailures.push('capability receipt must be an object');

  if (integrityFailures.length > 0) return { evidence: [], integrityFailures };

  try {
    integrityFailures.push(...validateCapabilityRequest(request as unknown as CapabilityRequestV1));
    integrityFailures.push(
      ...validateCapabilityReceipt(
        request as unknown as CapabilityRequestV1,
        receipt as unknown as CapabilityReceiptV1,
      ),
    );
  } catch {
    integrityFailures.push('capability receipt validation failed at the runtime boundary');
  }

  if ((receipt as Record<string, unknown>).execution !== 'COMPLETED') {
    integrityFailures.push('capability receipt execution must be COMPLETED before evidence normalization');
  }

  if (integrityFailures.length > 0) {
    return { evidence: [], integrityFailures: unique(integrityFailures) };
  }

  const typedReceipt = receipt as unknown as CapabilityReceiptV1;
  return {
    evidence: typedReceipt.evidence.map((entry) => ({
      evidenceId: entry.evidenceId,
      projectSlug,
      executionId: `${typedReceipt.runId}:${typedReceipt.attemptId}`,
      provenanceId: `${typedReceipt.receiptDigest}:${entry.digest}`,
      kind: entry.kind,
      verdict: entry.verdict,
      source: 'capability-receipt',
      requestedHeadSha: entry.requestedHeadSha,
      observedHeadSha: entry.observedHeadSha,
      observedAt: entry.observedAt,
    })),
    integrityFailures: [],
  };
}

export function evaluateEvidenceScaleGate(input: FcrEvidenceScaleInput): FcrEvidenceScaleDecision {
  const rawInput = isRecord(input) ? input as unknown as Record<string, unknown> : {};
  const blockers: string[] = [];
  if (!isRecord(input)) blockers.push('evidence scale input must be an object');

  const projectSlug = asString(rawInput.projectSlug) ?? '';
  const expectedHeadSha = asString(rawInput.expectedHeadSha) ?? '';
  if (!projectSlug.trim()) blockers.push('projectSlug is required');
  if (!FULL_SHA.test(expectedHeadSha)) blockers.push('expectedHeadSha must be a full Git SHA');

  const { policy, failures: policyFailures } = normalizePolicy(rawInput.policy);
  blockers.push(...policyFailures);
  const evaluatedPolicyDigest = computeEvidenceScalePolicyDigest(policy);
  const { authority: timeAuthority, failures: timeAuthorityFailures } = normalizeTimeAuthority(
    rawInput.timeAuthority,
    projectSlug,
    expectedHeadSha,
    evaluatedPolicyDigest,
  );
  blockers.push(...timeAuthorityFailures);

  const evidenceRaw = Array.isArray(rawInput.evidence) ? rawInput.evidence : [];
  if (!Array.isArray(rawInput.evidence)) blockers.push('evidence must be an array');

  const evidence: FcrEvidenceLedgerEntry[] = [];
  const integrityFailures: string[] = [];
  for (const [index, rawEntry] of evidenceRaw.entries()) {
    const normalized = normalizeEvidenceEntry(rawEntry, index);
    evidence.push(normalized.entry);
    integrityFailures.push(...normalized.failures);
  }

  const evidenceIds = new Set<string>();
  const provenanceIds = new Set<string>();
  for (const entry of evidence) {
    if (evidenceIds.has(entry.evidenceId)) integrityFailures.push(`duplicate evidenceId: ${entry.evidenceId}`);
    else evidenceIds.add(entry.evidenceId);

    if (provenanceIds.has(entry.provenanceId)) {
      integrityFailures.push(`duplicate provenanceId: ${entry.provenanceId}`);
    } else {
      provenanceIds.add(entry.provenanceId);
    }

    if (entry.projectSlug !== projectSlug) {
      integrityFailures.push(
        `evidence ${entry.evidenceId || '<missing>'} projectSlug ${entry.projectSlug || '<missing>'} does not match evaluated project ${projectSlug || '<missing>'}`,
      );
    }

    if (
      entry.verdict === 'PASS'
      && entry.requestedHeadSha.toLowerCase() === expectedHeadSha.toLowerCase()
      && entry.observedHeadSha?.toLowerCase() !== expectedHeadSha.toLowerCase()
    ) {
      integrityFailures.push(`PASS evidence ${entry.evidenceId || '<missing>'} is not bound to the exact expected head`);
    }
  }

  blockers.push(...integrityFailures);

  const evaluatedAtMs = Date.parse(timeAuthority.evaluatedAt);
  const validUntilMs = Date.parse(timeAuthority.validUntil);
  const evaluatedAt = timeAuthority.evaluatedAt;
  const expectedHead = expectedHeadSha.toLowerCase();

  const currentHeadEntries = evidence.filter(
    (entry) => entry.requestedHeadSha.toLowerCase() === expectedHead,
  );
  const historicalEntries = evidence.length - currentHeadEntries.length;

  const freshCurrentEntries = Number.isNaN(evaluatedAtMs)
    ? []
    : currentHeadEntries.filter((entry) => {
      const observedAtMs = Date.parse(entry.observedAt);
      return !Number.isNaN(observedAtMs)
        && observedAtMs <= evaluatedAtMs
        && evaluatedAtMs - observedAtMs <= policy.maxEvidenceAgeMs;
    });
  const staleCurrentEntries = currentHeadEntries.length - freshCurrentEntries.length;

  if (!Number.isNaN(validUntilMs)) {
    for (const entry of freshCurrentEntries) {
      const evidenceDeadlineMs = Date.parse(entry.observedAt) + policy.maxEvidenceAgeMs;
      if (validUntilMs > evidenceDeadlineMs) {
        blockers.push(`timeAuthority validity exceeds evidence freshness window for ${entry.evidenceId}`);
      }
    }
  }

  const freshExactHeadPassEvidence = freshCurrentEntries.filter(
    (entry) => entry.verdict === 'PASS' && entry.observedHeadSha?.toLowerCase() === expectedHead,
  );
  const satisfiedKinds = new Set(freshExactHeadPassEvidence.map((entry) => entry.kind));
  const missingKinds = policy.requiredEvidenceKinds.filter((kind) => !satisfiedKinds.has(kind));
  const proofCoverage = policy.requiredEvidenceKinds.length === 0
    ? 0
    : (policy.requiredEvidenceKinds.length - missingKinds.length) / policy.requiredEvidenceKinds.length;

  const executionGroups = groupByExecution(freshCurrentEntries);
  const executions = [...executionGroups.values()];
  const executionVerdicts = executions.map(executionVerdict);
  const freshExactHeadPasses = executions.filter(
    (entries) => executionVerdict(entries) === 'PASS'
      && entries.every((entry) => entry.observedHeadSha?.toLowerCase() === expectedHead),
  ).length;
  const failures = executionVerdicts.filter((verdict) => verdict === 'FAIL').length;
  const passRate = ratio(freshExactHeadPasses, executions.length);
  const failureRate = ratio(failures, executions.length);

  if (evidence.length === 0) blockers.push('no evidence supplied');
  for (const kind of missingKinds) blockers.push(`missing fresh exact-head PASS evidence for required kind: ${kind}`);
  if (freshExactHeadPasses < policy.minFreshExactHeadPasses) {
    blockers.push(`fresh exact-head PASS executions ${freshExactHeadPasses} are below required ${policy.minFreshExactHeadPasses}`);
  }
  if (passRate === null || passRate < policy.minPassRate) {
    blockers.push(`pass rate ${passRate === null ? 'unavailable' : passRate.toFixed(4)} is below required ${policy.minPassRate}`);
  }
  if (failureRate === null || failureRate > policy.maxFailureRate) {
    blockers.push(`failure rate ${failureRate === null ? 'unavailable' : failureRate.toFixed(4)} exceeds allowed ${policy.maxFailureRate}`);
  }

  const telemetryFailures: string[] = [];
  const latencySamples = executions
    .map((entries) => executionMetric(entries, 'latencyMs', telemetryFailures))
    .filter((value): value is number => value !== null);
  const costSamples = executions
    .map((entries) => executionMetric(entries, 'costUsd', telemetryFailures))
    .filter((value): value is number => value !== null);
  const attemptSamples = executions
    .map((entries) => executionMetric(entries, 'attempts', telemetryFailures))
    .filter((value): value is number => value !== null);

  blockers.push(...telemetryFailures);
  integrityFailures.push(...telemetryFailures);

  const p95LatencyMs = p95(latencySamples);
  const latencyCoverage = ratio(latencySamples.length, executions.length);
  const totalCostUsd = costSamples.reduce((sum, value) => sum + value, 0);
  const costPerPassUsd = costSamples.length === 0 || freshExactHeadPasses === 0
    ? null
    : totalCostUsd / freshExactHeadPasses;
  const costCoverage = ratio(costSamples.length, executions.length);
  const retryRate = attemptSamples.length === 0
    ? null
    : attemptSamples.filter((value) => value > 1).length / attemptSamples.length;
  const retryCoverage = ratio(attemptSamples.length, executions.length);

  if (policy.maxP95LatencyMs !== undefined && latencyCoverage !== 1) {
    blockers.push(`latency telemetry coverage ${latencyCoverage === null ? 'unavailable' : latencyCoverage.toFixed(4)} is below required 1`);
  }
  if (policy.maxCostPerPassUsd !== undefined && costCoverage !== 1) {
    blockers.push(`cost telemetry coverage ${costCoverage === null ? 'unavailable' : costCoverage.toFixed(4)} is below required 1`);
  }
  if (policy.maxRetryRate !== undefined && retryCoverage !== 1) {
    blockers.push(`retry telemetry coverage ${retryCoverage === null ? 'unavailable' : retryCoverage.toFixed(4)} is below required 1`);
  }

  const recommendations: FcrOptimizationRecommendation[] = [];
  if (
    policy.maxP95LatencyMs !== undefined
    && latencyCoverage === 1
    && p95LatencyMs !== null
    && p95LatencyMs > policy.maxP95LatencyMs
  ) {
    recommendations.push({
      code: 'reduce_latency',
      reason: 'Fresh current-head latency exceeds the explicit policy budget.',
      observed: p95LatencyMs,
      threshold: policy.maxP95LatencyMs,
    });
  }
  if (
    policy.maxCostPerPassUsd !== undefined
    && costCoverage === 1
    && costPerPassUsd !== null
    && costPerPassUsd > policy.maxCostPerPassUsd
  ) {
    recommendations.push({
      code: 'reduce_cost',
      reason: 'Fresh current-head cost per exact-head PASS exceeds the explicit policy budget.',
      observed: costPerPassUsd,
      threshold: policy.maxCostPerPassUsd,
    });
  }
  if (
    policy.maxRetryRate !== undefined
    && retryCoverage === 1
    && retryRate !== null
    && retryRate > policy.maxRetryRate
  ) {
    recommendations.push({
      code: 'reduce_retries',
      reason: 'Fresh current-head retry rate exceeds the explicit policy budget.',
      observed: retryRate,
      threshold: policy.maxRetryRate,
    });
  }

  const uniqueBlockers = unique(blockers);
  const proofBlocked = uniqueBlockers.length > 0;
  const scaleStatus = proofBlocked
    ? 'blocked'
    : recommendations.length > 0
      ? 'optimize_first'
      : 'ready_for_founder_scale_review';

  const policySnapshot = stablePolicySnapshot(policy);

  return {
    contract: FCR_EVIDENCE_SCALE_GATE_CONTRACT,
    projectSlug: projectSlug.trim(),
    expectedHeadSha,
    evaluatedAt,
    expiresAt: timeAuthority.validUntil,
    clockSource: 'authority-receipt',
    timeAuthority,
    policy: {
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      digest: evaluatedPolicyDigest,
      thresholds: policySnapshot,
    },
    ledger: {
      evidenceIds: evidence.map((entry) => entry.evidenceId),
      executionIds: unique(evidence.map((entry) => entry.executionId)),
      provenanceIds: evidence.map((entry) => entry.provenanceId),
      integrityFailures: unique(integrityFailures),
    },
    metrics: {
      totalEntries: evidence.length,
      historicalEntries,
      currentHeadEntries: currentHeadEntries.length,
      freshCurrentEntries: freshCurrentEntries.length,
      staleCurrentEntries,
      distinctFreshExecutions: executions.length,
      freshExactHeadPasses,
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
          ? 'Obtain explicit founder or operation-owner approval for one bounded optimization before any change; then collect fresh exact-head evidence and reevaluate.'
          : 'Founder reviews the evidence-backed scale candidate; scaling still requires separate explicit authority and execution proof.',
    },
  };
}
