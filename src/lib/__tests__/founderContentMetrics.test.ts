import { describe, expect, it } from 'vitest';
import {
  FOUNDER_CONTENT_METRICS_CONTRACT,
  dedupeFounderContentMetrics,
  normalizeFounderContentMetricObservation,
  normalizeFounderContentMetricsEnvelope,
} from '../founderContentMetrics.js';
import { parseFounderContentMetricsCsv } from '../founderContentMetricsCsv.js';

const observedAt = '2026-09-15T12:00:00.000Z';

function observation() {
  return normalizeFounderContentMetricObservation({
    provider: 'metricool',
    platform: 'facebook',
    source: 'aggregator',
    sourceMetricId: 'FBPO08',
    accountId: 'account-1',
    pageId: 'page-1',
    externalPostId: 'post-1',
    audienceSegment: null,
    metricName: 'impressions',
    metricUnit: 'count',
    metricValue: 42,
    observedAt,
    periodStart: '2026-09-15T00:00:00.000Z',
    periodEnd: '2026-09-15T23:59:59.000Z',
    importKind: 'provider_live',
    provenance: { connector: 'posts', provider_field: 'FBPO08' },
  });
}

describe('founder content metric observations', () => {
  it('binds source/account/post/metric/unit/time/provenance into deterministic hashes', () => {
    const first = observation();
    const second = observation();
    expect(first.contract).toBe(FOUNDER_CONTENT_METRICS_CONTRACT);
    expect(first.sourceRowHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });

  it('keeps null metric values distinct from zero', () => {
    const zero = normalizeFounderContentMetricObservation({
      ...observation(),
      metricValue: 0,
    });
    const unknown = normalizeFounderContentMetricObservation({
      ...observation(),
      metricValue: null,
    });
    expect(zero.metricValue).toBe(0);
    expect(unknown.metricValue).toBeNull();
    expect(zero.idempotencyKey).not.toBe(unknown.idempotencyKey);
  });

  it('deduplicates exact observations by idempotency key only', () => {
    const first = observation();
    const changed = normalizeFounderContentMetricObservation({
      ...first,
      metricValue: 43,
    });
    expect(dedupeFounderContentMetrics([first, first, changed])).toHaveLength(2);
  });

  it('rejects malformed provider envelopes instead of accepting opaque metrics payloads', () => {
    expect(() => normalizeFounderContentMetricsEnvelope({ observations: [] }))
      .toThrow(FOUNDER_CONTENT_METRICS_CONTRACT);
    expect(() => normalizeFounderContentMetricsEnvelope({
      contract: FOUNDER_CONTENT_METRICS_CONTRACT,
      observations: [{ ...observation(), provider: '' }],
    })).toThrow(/provider/i);
  });

  it('parses a safe historical CSV while preserving source field identity and audience segment', () => {
    const csv = [
      'provider,platform,source,source_metric_id,account_id,page_id,external_post_id,audience_segment,metric_name,metric_unit,metric_value,observed_at,period_start,period_end,provenance_json',
      'linkedin,linkedin,native_platform_export,IMPRESSIONS,acct-1,page-1,urn:li:share:1,Founder,impressions,count,123,2026-09-15T12:00:00Z,2026-09-15T00:00:00Z,2026-09-15T23:59:59Z,"{""export"":""linkedin-7d""}"',
      'linkedin,linkedin,native_platform_export,ENGAGEMENTS,acct-1,page-1,urn:li:share:1,Founder,engagements,count,,2026-09-15T12:00:00Z,2026-09-15T00:00:00Z,2026-09-15T23:59:59Z,"{""export"":""linkedin-7d""}"',
    ].join('\n');
    const rows = parseFounderContentMetricsCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: 'native_platform_export',
      sourceMetricId: 'IMPRESSIONS',
      accountId: 'acct-1',
      pageId: 'page-1',
      audienceSegment: 'Founder',
      metricName: 'impressions',
      metricUnit: 'count',
      metricValue: 123,
      importKind: 'historical_csv',
    });
    expect(rows[1].metricValue).toBeNull();
  });

  it('rejects historical CSV that launders an aggregator row as a native export', () => {
    const csv = [
      'provider,platform,source,account_id,metric_name,metric_unit,metric_value,observed_at',
      'metricool,facebook,aggregator,acct-1,impressions,count,1,2026-09-15T12:00:00Z',
    ].join('\n');
    expect(() => parseFounderContentMetricsCsv(csv)).toThrow(/historical_csv or native_platform_export/);
  });
});