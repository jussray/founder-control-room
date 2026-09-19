import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ContentMetricCsvObservation,
  ContentMetricCsvReceipt,
} from './contentMetricsCsv.js';

export const FOUNDER_CONTENT_METRIC_OBSERVATION_STORE_CONTRACT =
  'fcr/founder-content-metric-observation-store@v1' as const;

export interface FounderContentMetricImportResult {
  contract: typeof FOUNDER_CONTENT_METRIC_OBSERVATION_STORE_CONTRACT;
  authority: 'observation_only';
  importFingerprint: string;
  normalizedRowCount: number;
  insertedRowCount: number;
  existingRowCount: number;
  latestObservedAt: string | null;
  publicationAuthority: false;
  freshnessAuthority: false;
  strategyMutationAuthority: false;
}

export interface ImportFounderContentMetricsInput {
  founderUserId: string;
  postId: string;
  receipt: ContentMetricCsvReceipt;
  importedAt?: string;
}

interface FounderContentMetricObservationRepository {
  importObservations(input: {
    founderUserId: string;
    postId: string;
    observations: readonly ContentMetricCsvObservation[];
    importFingerprint: string;
    importedAt: string;
  }): Promise<FounderContentMetricImportResult>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requireIso(value: unknown, label: string): string {
  const raw = text(value);
  if (!raw || !Number.isFinite(Date.parse(raw))) throw new Error(`${label} must be a valid timestamp`);
  return new Date(Date.parse(raw)).toISOString();
}

function count(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative integer`);
  return parsed;
}

function normalizeResult(value: unknown): FounderContentMetricImportResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('founder-content metric import returned an invalid receipt');
  }
  const row = value as Record<string, unknown>;
  if (row.contract !== FOUNDER_CONTENT_METRIC_OBSERVATION_STORE_CONTRACT || row.authority !== 'observation_only') {
    throw new Error('founder-content metric import returned an unexpected contract');
  }
  const importFingerprint = text(row.importFingerprint).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(importFingerprint)) {
    throw new Error('founder-content metric import returned an invalid import fingerprint');
  }
  if (row.publicationAuthority !== false || row.freshnessAuthority !== false || row.strategyMutationAuthority !== false) {
    throw new Error('founder-content metric import exceeded observation-only authority');
  }
  const latestObservedAt = row.latestObservedAt === null || row.latestObservedAt === undefined
    ? null
    : requireIso(row.latestObservedAt, 'latestObservedAt');

  return {
    contract: FOUNDER_CONTENT_METRIC_OBSERVATION_STORE_CONTRACT,
    authority: 'observation_only',
    importFingerprint,
    normalizedRowCount: count(row.normalizedRowCount, 'normalizedRowCount'),
    insertedRowCount: count(row.insertedRowCount, 'insertedRowCount'),
    existingRowCount: count(row.existingRowCount, 'existingRowCount'),
    latestObservedAt,
    publicationAuthority: false,
    freshnessAuthority: false,
    strategyMutationAuthority: false,
  };
}

function toDatabaseObservation(observation: ContentMetricCsvObservation) {
  return {
    observationId: observation.observationId,
    contentFingerprint: observation.contentFingerprint,
    provider: observation.provider,
    accountId: observation.accountId,
    pageId: observation.pageId,
    audienceSegment: observation.audienceSegment,
    metricName: observation.metricName,
    metricValue: observation.metricValue,
    unit: observation.unit,
    windowStart: observation.windowStart,
    windowEnd: observation.windowEnd,
    observedAt: observation.observedAt,
    evidenceState: observation.evidenceState,
    provenance: {
      source: observation.provenance.source,
      sourceRef: observation.provenance.sourceRef,
      rowFingerprint: observation.provenance.rowFingerprint,
    },
  };
}

function supabaseRepository(client: SupabaseClient): FounderContentMetricObservationRepository {
  return {
    async importObservations(input) {
      const { data, error } = await client.rpc('ingest_founder_content_metric_observations', {
        p_founder_user_id: input.founderUserId,
        p_post_id: input.postId,
        p_observations: input.observations.map(toDatabaseObservation),
        p_import_fingerprint: input.importFingerprint,
        p_imported_at: input.importedAt,
      });
      if (error || !data) {
        throw new Error(error?.message || 'founder-content metric import returned no receipt');
      }
      return normalizeResult(data);
    },
  };
}

async function defaultRepository(): Promise<FounderContentMetricObservationRepository> {
  const { supabase } = await import('./supabaseClient.js');
  return supabaseRepository(supabase);
}

export async function importFounderContentMetricObservations(
  input: ImportFounderContentMetricsInput,
  repository?: FounderContentMetricObservationRepository,
): Promise<FounderContentMetricImportResult> {
  const founderUserId = text(input.founderUserId);
  const postId = text(input.postId);
  const importedAt = requireIso(input.importedAt ?? new Date().toISOString(), 'importedAt');
  const importFingerprint = text(input.receipt.importFingerprint).toLowerCase();

  if (!founderUserId) throw new Error('authenticated founder user id is required');
  if (!postId) throw new Error('postId is required');
  if (input.receipt.authority !== 'observation_only'
      || input.receipt.publicationAuthority !== false
      || input.receipt.freshnessAuthority !== false
      || input.receipt.strategyMutationAuthority !== false) {
    throw new Error('content metric CSV receipt exceeded observation-only authority');
  }
  if (!/^[0-9a-f]{64}$/.test(importFingerprint)) {
    throw new Error('content metric CSV import fingerprint is invalid');
  }
  if (input.receipt.observations.length < 1) {
    throw new Error('content metric CSV contains no observations');
  }
  if (input.receipt.normalizedRowCount !== input.receipt.observations.length) {
    throw new Error('content metric CSV normalized row count does not match observations');
  }

  const store = repository ?? await defaultRepository();
  const result = await store.importObservations({
    founderUserId,
    postId,
    observations: input.receipt.observations,
    importFingerprint,
    importedAt,
  });

  if (result.importFingerprint !== importFingerprint) {
    throw new Error('founder-content metric import receipt fingerprint mismatch');
  }
  if (result.normalizedRowCount !== input.receipt.normalizedRowCount) {
    throw new Error('founder-content metric import receipt row-count mismatch');
  }
  if (result.insertedRowCount + result.existingRowCount !== result.normalizedRowCount) {
    throw new Error('founder-content metric import receipt accounting mismatch');
  }
  return result;
}
