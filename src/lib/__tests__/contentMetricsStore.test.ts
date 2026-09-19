import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { parseContentMetricsCsv } from '../contentMetricsCsv.js';
import { importFounderContentMetricObservations } from '../contentMetricsStore.js';

const CONTENT_HASH = 'f'.repeat(64);
const header = [
  'observation_id',
  'content_fingerprint',
  'provider',
  'account_id',
  'page_id',
  'audience_segment',
  'metric_name',
  'metric_value',
  'unit',
  'window_start',
  'window_end',
  'observed_at',
  'source',
  'source_ref',
].join(',');
const row = [
  'obs-1', CONTENT_HASH, 'linkedin', 'acct-fcr', 'page-founder', 'founders',
  'impressions', '542', 'count', '2026-09-10T00:00:00Z', '2026-09-16T00:00:00Z',
  '2026-09-16T08:30:00Z', 'linkedin_native_export', 'export:20260916',
].join(',');
const receipt = parseContentMetricsCsv(`${header}\n${row}`);

function result(overrides: Record<string, unknown> = {}) {
  return {
    contract: 'fcr/founder-content-metric-observation-store@v1' as const,
    authority: 'observation_only' as const,
    importFingerprint: receipt.importFingerprint,
    normalizedRowCount: 1,
    insertedRowCount: 1,
    existingRowCount: 0,
    latestObservedAt: '2026-09-16T08:30:00.000Z',
    publicationAuthority: false as const,
    freshnessAuthority: false as const,
    strategyMutationAuthority: false as const,
    ...overrides,
  };
}

describe('founder content metric observation store', () => {
  it('sends only normalized observations to the durable boundary and preserves observation-only authority', async () => {
    const repository = {
      importObservations: vi.fn(async () => result()),
    };

    const imported = await importFounderContentMetricObservations({
      founderUserId: 'founder-1',
      postId: '11111111-1111-4111-8111-111111111111',
      receipt,
      importedAt: '2026-09-19T00:00:00Z',
    }, repository);

    expect(imported).toMatchObject({
      authority: 'observation_only',
      insertedRowCount: 1,
      existingRowCount: 0,
      publicationAuthority: false,
      freshnessAuthority: false,
      strategyMutationAuthority: false,
    });
    expect(repository.importObservations).toHaveBeenCalledTimes(1);
    const durableInput = repository.importObservations.mock.calls[0]?.[0];
    expect(durableInput).toMatchObject({
      founderUserId: 'founder-1',
      importFingerprint: receipt.importFingerprint,
      observations: receipt.observations,
    });
    expect(durableInput).not.toHaveProperty('csv');
    expect(JSON.stringify(durableInput)).not.toContain(`${header}\n${row}`);
  });

  it('fails closed when the durable receipt changes fingerprint, row accounting, or authority', async () => {
    await expect(importFounderContentMetricObservations({
      founderUserId: 'founder-1',
      postId: '11111111-1111-4111-8111-111111111111',
      receipt,
    }, {
      importObservations: async () => result({ importFingerprint: 'a'.repeat(64) }),
    })).rejects.toThrow('fingerprint mismatch');

    await expect(importFounderContentMetricObservations({
      founderUserId: 'founder-1',
      postId: '11111111-1111-4111-8111-111111111111',
      receipt,
    }, {
      importObservations: async () => result({ insertedRowCount: 1, existingRowCount: 1 }),
    })).rejects.toThrow('accounting mismatch');

    await expect(importFounderContentMetricObservations({
      founderUserId: 'founder-1',
      postId: '11111111-1111-4111-8111-111111111111',
      receipt,
    }, {
      importObservations: async () => result({ publicationAuthority: true as never }),
    })).rejects.toThrow('exceeded observation-only authority');
  });

  it('keeps the SQL store append-only, service-role-only, post-bound, conflict-detecting, and raw-CSV-free', () => {
    const sql = readFileSync(fileURLToPath(new URL(
      '../../../supabase/migrations/20260919023000_founder_content_metric_observations.sql',
      import.meta.url,
    )), 'utf8');

    expect(sql).toContain('create table if not exists public.founder_content_metric_observations');
    expect(sql).toContain('references public.founder_content_posts(post_id) on delete cascade');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('grant select, insert on table public.founder_content_metric_observations to service_role');
    expect(sql).toContain('revoke update, delete on table public.founder_content_metric_observations from service_role');
    expect(sql).toContain('FOUNDER_CONTENT_METRICS_POST_IDENTITY_MISMATCH');
    expect(sql).toContain('FOUNDER_CONTENT_METRICS_CONFLICT');
    expect(sql).toContain("'metrics_csv_imported'");
    expect(sql).not.toContain('raw_csv');
    expect(sql).not.toContain('p_csv');
  });
});
