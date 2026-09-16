import { createHash } from 'node:crypto';

export const FOUNDER_CONTENT_METRICS_CONTRACT = 'fcr/founder-content-metrics@v1' as const;

export const FOUNDER_CONTENT_METRIC_SOURCES = [
  'native_platform',
  'native_platform_export',
  'official_api_partner',
  'aggregator',
  'historical_csv',
] as const;
export type FounderContentMetricSource = (typeof FOUNDER_CONTENT_METRIC_SOURCES)[number];

export const FOUNDER_CONTENT_METRIC_UNITS = [
  'count',
  'ratio',
  'percent',
  'milliseconds',
  'seconds',
  'currency',
  'currency_minor',
  'score',
  'unknown',
] as const;
export type FounderContentMetricUnit = (typeof FOUNDER_CONTENT_METRIC_UNITS)[number];

export type FounderContentMetricImportKind = 'provider_live' | 'historical_csv';

export interface FounderContentMetricObservationInput {
  provider: string;
  platform: string;
  source: FounderContentMetricSource;
  sourceMetricId?: string | null;
  accountId: string;
  pageId?: string | null;
  externalPostId?: string | null;
  audienceSegment?: string | null;
  metricName: string;
  metricUnit: FounderContentMetricUnit;
  metricValue: number | null;
  observedAt: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  importKind: FounderContentMetricImportKind;
  provenance?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface FounderContentMetricObservation extends FounderContentMetricObservationInput {
  contract: typeof FOUNDER_CONTENT_METRICS_CONTRACT;
  sourceMetricId: string | null;
  pageId: string | null;
  externalPostId: string | null;
  audienceSegment: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  provenance: Readonly<Record<string, string | number | boolean | null>>;
  sourceRowHash: string;
  idempotencyKey: string;
}

export interface FounderContentMetricsEnvelope {
  contract: typeof FOUNDER_CONTENT_METRICS_CONTRACT;
  observations: readonly FounderContentMetricObservationInput[];
}

const MAX_OBSERVATIONS = 5_000;
const MAX_TEXT = 240;
const SAFE_PROVENANCE_KEYS = 40;

function reject(message: string): never {
  throw new Error(`FOUNDER_CONTENT_METRICS_REJECTED: ${message}`);
}

function text(value: unknown, field: string, required = true): string {
  if (typeof value !== 'string') {
    if (!required && (value === null || value === undefined)) return '';
    return reject(`${field} must be a string`);
  }
  const normalized = value.trim();
  if (required && !normalized) reject(`${field} is required`);
  if (normalized.length > MAX_TEXT) reject(`${field} exceeds ${MAX_TEXT} characters`);
  return normalized;
}

function nullableText(value: unknown, field: string): string | null {
  const normalized = text(value, field, false);
  return normalized || null;
}

function iso(value: unknown, field: string, required = true): string | null {
  const normalized = text(value, field, required);
  if (!normalized) return null;
  if (!Number.isFinite(Date.parse(normalized))) reject(`${field} must be an ISO timestamp`);
  return new Date(normalized).toISOString();
}

function finiteMetric(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return reject('metricValue must be a finite number or null');
  }
  return value;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function provenance(value: unknown): Readonly<Record<string, string | number | boolean | null>> {
  if (value === null || value === undefined) return Object.freeze({});
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('provenance must be a flat object');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > SAFE_PROVENANCE_KEYS) reject(`provenance exceeds ${SAFE_PROVENANCE_KEYS} keys`);
  const out: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = text(rawKey, 'provenance key');
    if (!/^[a-zA-Z0-9_.:-]+$/.test(key)) reject(`invalid provenance key ${key}`);
    if (rawValue === null || typeof rawValue === 'string' || typeof rawValue === 'boolean') {
      out[key] = typeof rawValue === 'string' ? text(rawValue, `provenance.${key}`, false) : rawValue;
      continue;
    }
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      out[key] = rawValue;
      continue;
    }
    reject(`provenance.${key} must be a scalar`);
  }
  return Object.freeze(out);
}

export function normalizeFounderContentMetricObservation(
  input: FounderContentMetricObservationInput,
): FounderContentMetricObservation {
  const source = input.source;
  if (!FOUNDER_CONTENT_METRIC_SOURCES.includes(source)) reject('source is unsupported');
  const metricUnit = input.metricUnit;
  if (!FOUNDER_CONTENT_METRIC_UNITS.includes(metricUnit)) reject('metricUnit is unsupported');
  if (!['provider_live', 'historical_csv'].includes(input.importKind)) reject('importKind is unsupported');

  const observedAt = iso(input.observedAt, 'observedAt') as string;
  const periodStart = iso(input.periodStart, 'periodStart', false);
  const periodEnd = iso(input.periodEnd, 'periodEnd', false);
  if ((periodStart && !periodEnd) || (!periodStart && periodEnd)) reject('periodStart and periodEnd must be supplied together');
  if (periodStart && periodEnd && Date.parse(periodStart) > Date.parse(periodEnd)) reject('periodStart must not be after periodEnd');
  if (input.importKind === 'historical_csv' && source !== 'historical_csv' && source !== 'native_platform_export') {
    reject('historical_csv imports must retain historical_csv or native_platform_export source');
  }

  const identity = {
    provider: text(input.provider, 'provider').toLowerCase(),
    platform: text(input.platform, 'platform').toLowerCase(),
    source,
    sourceMetricId: nullableText(input.sourceMetricId, 'sourceMetricId'),
    accountId: text(input.accountId, 'accountId'),
    pageId: nullableText(input.pageId, 'pageId'),
    externalPostId: nullableText(input.externalPostId, 'externalPostId'),
    audienceSegment: nullableText(input.audienceSegment, 'audienceSegment'),
    metricName: text(input.metricName, 'metricName').toLowerCase(),
    metricUnit,
    metricValue: finiteMetric(input.metricValue),
    observedAt,
    periodStart,
    periodEnd,
    importKind: input.importKind,
    provenance: provenance(input.provenance),
  } as const;
  const sourceRowHash = digest(identity);
  const idempotencyIdentity = {
    provider: identity.provider,
    platform: identity.platform,
    source: identity.source,
    sourceMetricId: identity.sourceMetricId,
    accountId: identity.accountId,
    pageId: identity.pageId,
    externalPostId: identity.externalPostId,
    audienceSegment: identity.audienceSegment,
    metricName: identity.metricName,
    metricUnit: identity.metricUnit,
    observedAt: identity.observedAt,
    periodStart: identity.periodStart,
    periodEnd: identity.periodEnd,
    importKind: identity.importKind,
    sourceRowHash,
  };
  return Object.freeze({
    contract: FOUNDER_CONTENT_METRICS_CONTRACT,
    ...identity,
    sourceRowHash,
    idempotencyKey: digest(idempotencyIdentity),
  });
}

export function normalizeFounderContentMetricsEnvelope(value: unknown): readonly FounderContentMetricObservation[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('provider data must be an object');
  const candidate = value as Record<string, unknown>;
  if (candidate.contract !== FOUNDER_CONTENT_METRICS_CONTRACT) reject(`provider data contract must equal ${FOUNDER_CONTENT_METRICS_CONTRACT}`);
  if (!Array.isArray(candidate.observations)) reject('provider data observations must be an array');
  if (candidate.observations.length > MAX_OBSERVATIONS) reject(`observations exceed ${MAX_OBSERVATIONS}`);
  return Object.freeze(candidate.observations.map((observation) => {
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)) reject('each observation must be an object');
    return normalizeFounderContentMetricObservation(observation as unknown as FounderContentMetricObservationInput);
  }));
}

export function dedupeFounderContentMetrics(
  observations: readonly FounderContentMetricObservation[],
): readonly FounderContentMetricObservation[] {
  const seen = new Set<string>();
  return Object.freeze(observations.filter((observation) => {
    if (seen.has(observation.idempotencyKey)) return false;
    seen.add(observation.idempotencyKey);
    return true;
  }));
}
