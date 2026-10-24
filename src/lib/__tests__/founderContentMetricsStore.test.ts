import { describe, expect, it, vi } from 'vitest';
import {
  importFounderContentMetricsCsv,
  type FounderContentMetricsImportRepository,
} from '../founderContentMetricsStore.js';

const csv = [
  'provider,platform,source,source_metric_id,account_id,page_id,external_post_id,audience_segment,metric_name,metric_unit,metric_value,observed_at,period_start,period_end,provenance_json',
  'linkedin,linkedin,native_platform_export,IMPRESSIONS,acct-1,page-1,urn:li:share:1,Founder,impressions,count,123,2026-10-24T04:00:00Z,2026-10-23T00:00:00Z,2026-10-23T23:59:59Z,"{""export"":""linkedin-1d""}"',
].join('\n');

describe('founder content metrics import store', () => {
  it('normalizes safe CSV before persistence and returns a non-authorizing durable receipt', async () => {
    const persist = vi.fn(async (input) => ({
      receipt_id: 'receipt-1',
      inserted_observations: input.observations.length,
      database_envelope_sha256: 'a'.repeat(64),
    }));
    const repository = { import: persist } as FounderContentMetricsImportRepository;

    const receipt = await importFounderContentMetricsCsv({
      founderUserId: 'founder-1',
      postId: null,
      csv,
      actor: 'founder@example.test',
      observedAt: '2026-10-24T04:05:00Z',
    }, repository);

    expect(receipt).toMatchObject({
      contract: 'fcr/founder-content-metrics-import@v1',
      authority: 'observation_only',
      normalizedObservations: 1,
      insertedObservations: 1,
      receiptId: 'receipt-1',
      databaseEnvelopeSha256: 'a'.repeat(64),
    });
    expect(receipt.applicationImportFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0]?.[0].observations[0]).toMatchObject({
      provider: 'linkedin',
      platform: 'linkedin',
      source: 'native_platform_export',
      accountId: 'acct-1',
      pageId: 'page-1',
      audienceSegment: 'Founder',
      metricName: 'impressions',
      metricUnit: 'count',
      metricValue: 123,
      importKind: 'historical_csv',
    });
  });

  it('fails before persistence when CSV evidence is malformed', async () => {
    const persist = vi.fn();
    const repository = { import: persist } as unknown as FounderContentMetricsImportRepository;
    await expect(importFounderContentMetricsCsv({
      founderUserId: 'founder-1',
      csv: csv.replace(',page-1,', ',,'),
    }, repository)).rejects.toThrow(/pageId is required/);
    expect(persist).not.toHaveBeenCalled();
  });
});
