import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ContentMetricCsvReceipt,
  ContentMetricName,
  ContentMetricCsvEvidenceState,
} from './contentMetricsCsv.js';

type JsonRecord = Record<string, unknown>;

export const FOUNDER_CONTENT_METRIC_STORE_CONTRACT =
  'fcr/founder-content-metric-store@v1' as const;
export const FOUNDER_CONTENT_METRIC_IMPORT_CONTRACT =
  'fcr/founder-content-metric-import@v1' as const;

export interface FounderContentMetricImportResult {
  contract: typeof FOUNDER_CONTENT_METRIC_IMPORT_CONTRACT;
  importFingerprint: string;
  insertedCount: number;
  idempotentCount: number;
  authority: 'observation_only';
  freshnessAuthority: false;
  publicationAuthority: false;
  strategyMutationAuthority: false;
}

export interface StoredFounderContentMetricObservation {
  contract: typeof FOUNDER_CONTENT_METRIC_STORE_CONTRACT;
  founderUserId: string;
  firstImportFingerprint: string;
  identityFingerprint: string;
  storageFingerprint: string;
  sourceRowFingerprint: string;
  observationId: string;
  contentFingerprint: string;
  provider: string;
  accountId: string;
  pageId: string;
  audienceSegment: string;
  metricName: ContentMetricName;
  metricValue: number | null;
  unit: 'count';
  windowStart: string;
  windowEnd: string;
  observedAt: string;
  evidenceState: ContentMetricCsvEvidenceState;
  source: string;
  sourceRef: string;
  importedAt: string;
}

export interface FounderContentMetricRepository {
  ingest(founderUserId: string, receipt: ContentMetricCsvReceipt): Promise<FounderContentMetricImportResult>;
  list(founderUserId: string, limit: number): Promise<StoredFounderContentMetricObservation[]>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function integer(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('invalid founder-content metric ' + field);
  }
  return parsed;
}

function iso(value: unknown, field: string): string {
  const raw = text(value);
  if (!raw || !Number.isFinite(Date.parse(raw))) {
    throw new Error('invalid founder-content metric ' + field);
  }
  return new Date(Date.parse(raw)).toISOString();
}

function metricName(value: unknown): ContentMetricName {
  const candidate = text(value) as ContentMetricName;
  const allowed: readonly ContentMetricName[] = [
    'impressions',
    'reactions',
    'comments',
    'profile_views',
    'attributed_visits',
    'qualified_conversations',
    'attributed_contacts',
    'attributed_deals',
  ];
  if (!allowed.includes(candidate)) throw new Error('invalid founder-content metric name');
  return candidate;
}

function evidenceState(value: unknown): ContentMetricCsvEvidenceState {
  const candidate = text(value) as ContentMetricCsvEvidenceState;
  if (!['OBSERVED', 'UNKNOWN_NO_EVIDENCE'].includes(candidate)) {
    throw new Error('invalid founder-content metric evidence state');
  }
  return candidate;
}

function normalizeImportResult(value: unknown): FounderContentMetricImportResult {
  const row = record(value);
  if (text(row.contract) !== FOUNDER_CONTENT_METRIC_IMPORT_CONTRACT) {
    throw new Error('invalid founder-content metric import contract');
  }
  if (
    text(row.authority) !== 'observation_only'
    || row.freshnessAuthority !== false
    || row.publicationAuthority !== false
    || row.strategyMutationAuthority !== false
  ) {
    throw new Error('invalid founder-content metric import authority');
  }
  const importFingerprint = text(row.importFingerprint).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(importFingerprint)) {
    throw new Error('invalid founder-content metric import fingerprint');
  }
  return {
    contract: FOUNDER_CONTENT_METRIC_IMPORT_CONTRACT,
    importFingerprint,
    insertedCount: integer(row.insertedCount, 'insertedCount'),
    idempotentCount: integer(row.idempotentCount, 'idempotentCount'),
    authority: 'observation_only',
    freshnessAuthority: false,
    publicationAuthority: false,
    strategyMutationAuthority: false,
  };
}

function normalizeObservation(value: unknown): StoredFounderContentMetricObservation {
  const row = record(value);
  const metricValue = row.metric_value === null || row.metric_value === undefined
    ? null
    : integer(row.metric_value, 'metricValue');
  const normalizedEvidenceState = evidenceState(row.evidence_state);
  if (
    (normalizedEvidenceState === 'OBSERVED' && metricValue === null)
    || (normalizedEvidenceState === 'UNKNOWN_NO_EVIDENCE' && metricValue !== null)
  ) {
    throw new Error('invalid founder-content metric value/evidence state');
  }
  return {
    contract: FOUNDER_CONTENT_METRIC_STORE_CONTRACT,
    founderUserId: text(row.founder_user_id),
    firstImportFingerprint: text(row.first_import_fingerprint).toLowerCase(),
    identityFingerprint: text(row.identity_fingerprint).toLowerCase(),
    storageFingerprint: text(row.storage_fingerprint).toLowerCase(),
    sourceRowFingerprint: text(row.source_row_fingerprint).toLowerCase(),
    observationId: text(row.observation_id),
    contentFingerprint: text(row.content_fingerprint),
    provider: text(row.provider),
    accountId: text(row.account_id),
    pageId: text(row.page_id),
    audienceSegment: text(row.audience_segment),
    metricName: metricName(row.metric_name),
    metricValue,
    unit: 'count',
    windowStart: iso(row.window_start, 'windowStart'),
    windowEnd: iso(row.window_end, 'windowEnd'),
    observedAt: iso(row.observed_at, 'observedAt'),
    evidenceState: normalizedEvidenceState,
    source: text(row.source),
    sourceRef: text(row.source_ref),
    importedAt: iso(row.imported_at, 'importedAt'),
  };
}

function supabaseRepository(client: SupabaseClient): FounderContentMetricRepository {
  return {
    async ingest(founderUserId, receipt) {
      const { data, error } = await client.rpc('ingest_founder_content_metrics_v1', {
        p_founder_user_id: founderUserId,
        p_receipt: receipt,
      });
      if (error || !data) {
        throw new Error(error?.message || 'founder-content metric import returned no receipt');
      }
      return normalizeImportResult(data);
    },

    async list(founderUserId, limit) {
      const { data, error } = await client
        .from('founder_content_metric_observations')
        .select('*')
        .eq('founder_user_id', founderUserId)
        .order('observed_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => normalizeObservation(row));
    },
  };
}

async function defaultRepository(): Promise<FounderContentMetricRepository> {
  const { supabase } = await import('./supabaseClient.js');
  return supabaseRepository(supabase);
}

function founderUserId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new Error('authenticated founder user id is required');
  }
  return normalized;
}

function assertReceipt(receipt: ContentMetricCsvReceipt): void {
  if (
    receipt.contract !== 'content-metrics-csv@v1'
    || receipt.authority !== 'observation_only'
    || receipt.freshnessAuthority !== false
    || receipt.publicationAuthority !== false
    || receipt.strategyMutationAuthority !== false
    || !/^[0-9a-f]{64}$/.test(receipt.importFingerprint)
    || receipt.observations.length > 10_000
  ) {
    throw new Error('founder-content metric receipt failed store boundary');
  }
}

export async function persistFounderContentMetricReceipt(
  input: {
    founderUserId: string;
    receipt: ContentMetricCsvReceipt;
  },
  repository?: FounderContentMetricRepository,
): Promise<FounderContentMetricImportResult> {
  const normalizedFounderUserId = founderUserId(input.founderUserId);
  assertReceipt(input.receipt);
  const store = repository ?? await defaultRepository();
  return store.ingest(normalizedFounderUserId, input.receipt);
}

export async function listStoredFounderContentMetricObservations(
  input: {
    founderUserId: string;
    limit?: number;
  },
  repository?: FounderContentMetricRepository,
): Promise<StoredFounderContentMetricObservation[]> {
  const normalizedFounderUserId = founderUserId(input.founderUserId);
  const limit = input.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('founder-content metric list limit must be 1 through 500');
  }
  const store = repository ?? await defaultRepository();
  return store.list(normalizedFounderUserId, limit);
}

