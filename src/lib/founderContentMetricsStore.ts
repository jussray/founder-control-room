import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FOUNDER_CONTENT_METRICS_CONTRACT,
  type FounderContentMetricObservation,
} from './founderContentMetrics.js';
import { parseFounderContentMetricsCsv } from './founderContentMetricsCsv.js';

export const FOUNDER_CONTENT_METRICS_IMPORT_CONTRACT =
  'fcr/founder-content-metrics-import@v1' as const;

export interface FounderContentMetricsImportReceipt {
  contract: typeof FOUNDER_CONTENT_METRICS_IMPORT_CONTRACT;
  authority: 'observation_only';
  founderUserId: string;
  postId: string | null;
  normalizedObservations: number;
  insertedObservations: number;
  applicationImportFingerprint: string;
  databaseEnvelopeSha256: string;
  receiptId: string;
  observedAt: string;
}

interface PersistedMetricImportReceipt {
  receipt_id: string;
  inserted_observations: number;
  database_envelope_sha256: string;
}

export interface FounderContentMetricsImportRepository {
  import(input: {
    founderUserId: string;
    postId: string | null;
    observations: readonly FounderContentMetricObservation[];
    actor: string;
    observedAt: string;
    applicationImportFingerprint: string;
  }): Promise<PersistedMetricImportReceipt>;
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function applicationImportFingerprint(
  observations: readonly FounderContentMetricObservation[],
): string {
  return sha256(
    [...observations]
      .map((observation) => `${observation.idempotencyKey}:${observation.sourceRowHash}`)
      .sort()
      .join('\n'),
  );
}

function supabaseRepository(client: SupabaseClient): FounderContentMetricsImportRepository {
  return {
    async import(input) {
      const { data, error } = await client.rpc('import_founder_content_metric_observations', {
        p_founder_user_id: input.founderUserId,
        p_post_id: input.postId,
        p_envelope: {
          contract: FOUNDER_CONTENT_METRICS_CONTRACT,
          observations: input.observations,
        },
        p_actor: input.actor,
        p_application_import_fingerprint: input.applicationImportFingerprint,
        p_observed_at: input.observedAt,
      });
      if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(error?.message || 'founder-content metric import returned no receipt');
      }
      const receipt = data as unknown as Record<string, unknown>;
      const receiptId = clean(receipt.receipt_id);
      const databaseEnvelopeSha256 = clean(receipt.database_envelope_sha256).toLowerCase();
      const insertedObservations = Number(receipt.inserted_observations);
      if (
        !receiptId
        || !/^[0-9a-f]{64}$/.test(databaseEnvelopeSha256)
        || !Number.isSafeInteger(insertedObservations)
        || insertedObservations < 0
      ) {
        throw new Error('founder-content metric import returned an invalid receipt');
      }
      return {
        receipt_id: receiptId,
        inserted_observations: insertedObservations,
        database_envelope_sha256: databaseEnvelopeSha256,
      };
    },
  };
}

async function defaultRepository(): Promise<FounderContentMetricsImportRepository> {
  const { supabase } = await import('./supabaseClient.js');
  return supabaseRepository(supabase);
}

export async function importFounderContentMetricsCsv(
  input: {
    founderUserId: string;
    csv: string;
    postId?: string | null;
    actor?: string;
    observedAt?: string;
  },
  repository?: FounderContentMetricsImportRepository,
): Promise<FounderContentMetricsImportReceipt> {
  const founderUserId = clean(input.founderUserId);
  const actor = clean(input.actor) || 'founder';
  const postId = clean(input.postId) || null;
  const observedAt = clean(input.observedAt) || new Date().toISOString();
  if (!founderUserId) throw new Error('authenticated founder user id is required');
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error('observedAt must be a valid timestamp');

  const observations = parseFounderContentMetricsCsv(input.csv);
  const fingerprint = applicationImportFingerprint(observations);
  const store = repository ?? await defaultRepository();
  const persisted = await store.import({
    founderUserId,
    postId,
    observations,
    actor,
    observedAt: new Date(Date.parse(observedAt)).toISOString(),
    applicationImportFingerprint: fingerprint,
  });

  return {
    contract: FOUNDER_CONTENT_METRICS_IMPORT_CONTRACT,
    authority: 'observation_only',
    founderUserId,
    postId,
    normalizedObservations: observations.length,
    insertedObservations: persisted.inserted_observations,
    applicationImportFingerprint: fingerprint,
    databaseEnvelopeSha256: persisted.database_envelope_sha256,
    receiptId: persisted.receipt_id,
    observedAt: new Date(Date.parse(observedAt)).toISOString(),
  };
}
