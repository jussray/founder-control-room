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
  it('binds stable provider/account/page/metric/time identity separately from exact row provenance', () => {
    const first = observation();
    const second = observation();
    expect(first.contract).toBe(FOUNDER_CONTENT_METRICS_CONTRACT);
    expect(first.pageId).toBe('page-1');
    expect(first.sourceRowHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.sourceRowHash).toBe(second.sourceRowHash);
  });

  it('keeps null distinct from zero without permitting two values for one logical observation', () => {
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
    expect(zero.idempotencyKey).toBe(unknown.idempotencyKey);
    expect(zero.sourceRowHash).not.toBe(unknown.sourceRowHash);
    expect(() => dedupeFounderContentMetrics([zero, unknown]))
      .toThrow(/conflicting duplicate metric identity/);
  });

  it('collapses exact repeats and rejects conflicting duplicates instead of last-row-wins', () => {
    const first = observation();
    const changed = normalizeFounderContentMetricObservation({
      ...first,
      metricValue: 43,
    });
    expect(dedupeFounderContentMetrics([first, first])).toHaveLength(1);
    expect(() => dedupeFounderContentMetrics([first, changed]))
      .toThrow(/conflicting duplicate metric identity/);
  });

  it('rejects malformed provider envelopes instead of accepting opaque metrics payloads', () => {
    expect(() => normalizeFounderContentMetricsEnvelope({ observations: [] }))
      .toThrow(FOUNDER_CONTENT_METRICS_CONTRACT);
    expect(() => normalizeFounderContentMetricsEnvelope({
      contract: FOUNDER_CONTENT_METRICS_CONTRACT,
      observations: [{ ...observation(), provider: '' }],
    })).toThrow(/provider/i);
  });

  it('requires explicit page identity and offset-aware timestamps', () => {
    expect(() => normalizeFounderContentMetricObservation({
      ...observation(),
      pageId: '',
    })).toThrow(/pageId is required/);
    expect(() => normalizeFounderContentMetricObservation({
      ...observation(),
      observedAt: '2026-09-15T12:00:00',
    })).toThrow(/offset-aware ISO timestamp/);
    expect(() => normalizeFounderContentMetricObservation({
      ...observation(),
      periodStart: '2026-09-15T00:00:00',
    })).toThrow(/offset-aware ISO timestamp/);
  });

  it('rejects impossible timestamps and invalid UTC offsets instead of Date.parse normalization', () => {
    expect(() => normalizeFounderContentMetricObservation({
      ...observation(),
      observedAt: '2026-02-30T12:00:00.000Z',
    })).toThrow(/real calendar date/);
    expect(() => normalizeFounderContentMetricObservation({
      ...observation(),
      periodEnd: '2026-02-30T23:59:59.000Z',
    })).toThrow(/real calendar date/);
    expect(() => normalizeFounderContentMetricObservation({
      ...observation(),
      observedAt: '2026-09-15T12:00:00+15:00',
    })).toThrow(/invalid UTC offset/);
  });

  it('rejects timestamp precision that JavaScript Date would silently truncate', () => {
    expect(() => normalizeFounderContentMetricObservation({
      ...observation(),
      observedAt: '2026-09-15T12:00:00.1234Z',
    })).toThrow(/millisecond precision or less/);
  });

  it('enforces provider and platform identifiers at the same boundary as storage', () => {
    expect(() => normalizeFounderContentMetricObservation({
      ...observation(),
      provider: 'google-ads',
    })).toThrow(/provider is invalid/);
    expect(() => normalizeFounderContentMetricObservation({
      ...observation(),
      platform: `p${'x'.repeat(80)}`,
    })).toThrow(/platform is invalid/);
  });

  it('retains reserved provenance keys as own data properties without prototype mutation', () => {
    const reserved = JSON.parse('{"__proto__":"source-row"}') as Record<string, string>;
    const normalized = normalizeFounderContentMetricObservation({
      ...observation(),
      provenance: reserved,
    });
    expect(Object.getPrototypeOf(normalized.provenance)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(normalized.provenance, '__proto__')).toBe(true);
    expect(normalized.provenance.__proto__).toBe('source-row');
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

  it('rejects historical CSV without page identity or with an offset-less timestamp', () => {
    const missingPage = [
      'provider,platform,source,account_id,metric_name,metric_unit,metric_value,observed_at',
      'linkedin,linkedin,native_platform_export,acct-1,impressions,count,1,2026-09-15T12:00:00Z',
    ].join('\n');
    expect(() => parseFounderContentMetricsCsv(missingPage)).toThrow(/missing required header page_id/);

    const offsetless = [
      'provider,platform,source,account_id,page_id,metric_name,metric_unit,metric_value,observed_at',
      'linkedin,linkedin,native_platform_export,acct-1,page-1,impressions,count,1,2026-09-15T12:00:00',
    ].join('\n');
    expect(() => parseFounderContentMetricsCsv(offsetless)).toThrow(/offset-aware ISO timestamp/);
  });

  it('rejects trailing data after a quoted CSV field instead of silently changing the field', () => {
    const malformed = [
      'provider,platform,source,account_id,page_id,metric_name,metric_unit,metric_value,observed_at',
      'linkedin,linkedin,native_platform_export,acct-1,page-1,impressions,count,"12"3,2026-09-15T12:00:00Z',
    ].join('\n');
    expect(() => parseFounderContentMetricsCsv(malformed))
      .toThrow(/quoted CSV field must be followed by a comma, newline, or end-of-input/);
  });

  it('rejects conflicting duplicate CSV observations rather than hiding the second value', () => {
    const csv = [
      'provider,platform,source,source_metric_id,account_id,page_id,metric_name,metric_unit,metric_value,observed_at,period_start,period_end',
      'linkedin,linkedin,native_platform_export,IMPRESSIONS,acct-1,page-1,impressions,count,123,2026-09-15T12:00:00Z,2026-09-15T00:00:00Z,2026-09-15T23:59:59Z',
      'linkedin,linkedin,native_platform_export,IMPRESSIONS,acct-1,page-1,impressions,count,124,2026-09-15T12:00:00Z,2026-09-15T00:00:00Z,2026-09-15T23:59:59Z',
    ].join('\n');
    expect(() => parseFounderContentMetricsCsv(csv)).toThrow(/conflicting duplicate metric identity/);
  });

  it('rejects historical CSV that launders an aggregator row as a native export', () => {
    const csv = [
      'provider,platform,source,account_id,page_id,metric_name,metric_unit,metric_value,observed_at',
      'metricool,facebook,aggregator,acct-1,page-1,impressions,count,1,2026-09-15T12:00:00Z',
    ].join('\n');
    expect(() => parseFounderContentMetricsCsv(csv)).toThrow(/historical_csv or native_platform_export/);
  });
});
