export const V10_OUTCOME_OBSERVATION_CONTRACT = 'juss-v10/outcome-observation@v1' as const;

export interface V10OutcomeMetric {
  name: string;
  before?: number;
  after?: number;
  unit?: string;
}

export interface V10OutcomeObservationInput {
  capabilityPlanHash: string;
  executionReceiptId: string;
  observedAt: string;
  verified: boolean;
  goalSucceeded: boolean | null;
  founderOverride: boolean;
  rollbackUsed: boolean;
  retries: number;
  evidenceCompleteness: number;
  outcomeSignals: string[];
  evidenceUrls: string[];
  metrics?: V10OutcomeMetric[];
}

export interface V10OutcomeObservation extends V10OutcomeObservationInput {
  contract: typeof V10_OUTCOME_OBSERVATION_CONTRACT;
  outcomeSignals: string[];
  evidenceUrls: string[];
  metrics: V10OutcomeMetric[];
}

const HASH = /^[0-9a-f]{64}$/i;
const RECEIPT = /^fcr-conveyor-receipt-v3:[0-9a-f]{64}$/i;

function text(value: unknown, maxLength = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))].sort();
}

function validEvidenceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!url.hostname || url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function normalizeMetrics(values: readonly V10OutcomeMetric[] | undefined): V10OutcomeMetric[] {
  if (!Array.isArray(values)) return [];
  return values.slice(0, 30).map((metric) => ({
    name: text(metric.name, 160),
    ...(typeof metric.before === 'number' && Number.isFinite(metric.before) ? { before: metric.before } : {}),
    ...(typeof metric.after === 'number' && Number.isFinite(metric.after) ? { after: metric.after } : {}),
    ...(text(metric.unit, 80) ? { unit: text(metric.unit, 80) } : {}),
  })).filter((metric) => metric.name);
}

export function validateV10OutcomeObservation(input: V10OutcomeObservationInput): string[] {
  const errors: string[] = [];
  if (!HASH.test(text(input.capabilityPlanHash, 64))) errors.push('capabilityPlanHash must be sha256');
  if (!RECEIPT.test(text(input.executionReceiptId, 120))) errors.push('executionReceiptId must be a V3 conveyor receipt');
  if (!text(input.observedAt, 80) || Number.isNaN(Date.parse(input.observedAt))) errors.push('observedAt must be an ISO-compatible timestamp');
  if (typeof input.verified !== 'boolean') errors.push('verified must be boolean');
  if (input.goalSucceeded !== null && typeof input.goalSucceeded !== 'boolean') errors.push('goalSucceeded must be boolean or null');
  if (typeof input.founderOverride !== 'boolean') errors.push('founderOverride must be boolean');
  if (typeof input.rollbackUsed !== 'boolean') errors.push('rollbackUsed must be boolean');
  if (!Number.isInteger(input.retries) || input.retries < 0) errors.push('retries must be a non-negative integer');
  if (!Number.isInteger(input.evidenceCompleteness) || input.evidenceCompleteness < 0 || input.evidenceCompleteness > 100) {
    errors.push('evidenceCompleteness must be an integer from 0 to 100');
  }
  if (!Array.isArray(input.outcomeSignals) || uniqueStrings(input.outcomeSignals).length === 0) {
    errors.push('at least one declared outcome signal is required');
  }
  if (!Array.isArray(input.evidenceUrls)) {
    errors.push('evidenceUrls must be an array');
  } else if (input.evidenceUrls.some((value) => !validEvidenceUrl(text(value)))) {
    errors.push('evidence URLs must be valid HTTPS URLs or localhost/127.0.0.1 HTTP URLs');
  }
  if (input.verified && uniqueStrings(input.evidenceUrls ?? []).length === 0) {
    errors.push('verified outcomes require evidence URLs');
  }
  if (input.goalSucceeded === true && !input.verified) {
    errors.push('goal success cannot be claimed before the outcome is verified');
  }
  return errors;
}

export function createV10OutcomeObservation(input: V10OutcomeObservationInput): V10OutcomeObservation {
  const errors = validateV10OutcomeObservation(input);
  if (errors.length > 0) throw new Error(errors.join('; '));

  return {
    contract: V10_OUTCOME_OBSERVATION_CONTRACT,
    ...input,
    capabilityPlanHash: input.capabilityPlanHash.toLowerCase(),
    executionReceiptId: input.executionReceiptId.toLowerCase(),
    outcomeSignals: uniqueStrings(input.outcomeSignals),
    evidenceUrls: uniqueStrings(input.evidenceUrls),
    metrics: normalizeMetrics(input.metrics),
  };
}
