import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { ContentMetricCsvReceipt } from '../contentMetricsCsv.js';
import {
  listStoredFounderContentMetricObservations,
  persistFounderContentMetricReceipt,
  type FounderContentMetricRepository,
} from '../contentMetricsStore.js';

const MIGRATION = fileURLToPath(
  new URL('../../../supabase/migrations/20261027133000_founder_content_metric_observations.sql', import.meta.url),
);

function receipt(): ContentMetricCsvReceipt {
  return {
    contract: 'content-metrics-csv@v1',
    authority: 'observation_only',
    freshnessAuthority: false,
    publicationAuthority: false,
    strategyMutationAuthority: false,
    importFingerprint: 'a'.repeat(64),
    inputRowCount: 1,
    normalizedRowCount: 1,
    duplicateRowsCollapsed: 0,
    observations: [{
      observationId: 'obs-1',
      contentFingerprint: 'content-1',
      provider: 'linkedin',
      accountId: 'account-1',
      pageId: 'page-1',
      audienceSegment: 'Founder',
      metricName: 'impressions',
      metricValue: 10,
      unit: 'count',
      windowStart: '2026-10-01T00:00:00Z',
      windowEnd: '2026-10-07T00:00:00Z',
      observedAt: '2026-10-08T00:00:00Z',
      evidenceState: 'OBSERVED',
      provenance: {
        source: 'manual_export',
        sourceRef: 'export-1',
        rowFingerprint: 'b'.repeat(64),
      },
    }],
  };
}

function repository(): FounderContentMetricRepository {
  return {
    ingest: vi.fn(async (_founderUserId, input) => ({
      contract: 'fcr/founder-content-metric-import@v1',
      importFingerprint: input.importFingerprint,
      insertedCount: 1,
      idempotentCount: 0,
      authority: 'observation_only',
      freshnessAuthority: false,
      publicationAuthority: false,
      strategyMutationAuthority: false,
    })),
    list: vi.fn(async () => []),
  };
}

describe('founder-content metric durable store', () => {
  it('keeps the parsed receipt observation-only at the persistence boundary', async () => {
    const repo = repository();
    const result = await persistFounderContentMetricReceipt({
      founderUserId: 'founder-user-1',
      receipt: receipt(),
    }, repo);

    expect(result).toMatchObject({
      contract: 'fcr/founder-content-metric-import@v1',
      insertedCount: 1,
      authority: 'observation_only',
      freshnessAuthority: false,
      publicationAuthority: false,
      strategyMutationAuthority: false,
    });
    expect(repo.ingest).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid founder identity and unsafe read limits before database access', async () => {
    const repo = repository();
    await expect(persistFounderContentMetricReceipt({
      founderUserId: '',
      receipt: receipt(),
    }, repo)).rejects.toThrow(/founder user id/i);

    await expect(listStoredFounderContentMetricObservations({
      founderUserId: 'founder-user-1',
      limit: 501,
    }, repo)).rejects.toThrow(/1 through 500/);

    expect(repo.ingest).not.toHaveBeenCalled();
    expect(repo.list).not.toHaveBeenCalled();
  });

  it('locks direct mutation behind a service-role-only bounded RPC', async () => {
    const migration = await readFile(MIGRATION, 'utf8');

    expect(migration).toContain('enable row level security');
    expect(migration).toContain(
      'revoke all on table public.founder_content_metric_observations from public, anon, authenticated, service_role',
    );
    expect(migration).toContain(
      'grant select on table public.founder_content_metric_observations to service_role',
    );
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      'revoke all on function public.ingest_founder_content_metrics_v1(text, jsonb)',
    );
    expect(migration).toContain(
      'grant execute on function public.ingest_founder_content_metrics_v1(text, jsonb)',
    );
    expect(migration).not.toMatch(/grant\s+(insert|update|delete).*service_role/i);
  });

  it('recomputes durable identity and storage fingerprints inside Postgres', async () => {
    const migration = await readFile(MIGRATION, 'utf8');

    expect(migration).toContain('v_identity_fingerprint := encode(extensions.digest(');
    expect(migration).toContain('v_storage_fingerprint := encode(extensions.digest(');
    expect(migration).toContain('founder_content_metric_identity_unique unique');
    expect(migration).toContain('conflicting duplicate identity');
    expect(migration).toContain('source_row_fingerprint');
  });
});
