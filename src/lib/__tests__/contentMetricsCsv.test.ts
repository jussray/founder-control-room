import { describe, expect, it } from 'vitest';
import { parseContentMetricsCsv } from '../contentMetricsCsv.js';

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

function csv(...rows: string[]): string {
  return [header, ...rows].join('\n');
}

const impressions = 'obs-20260916,fp-post-1,linkedin,acct-fcr,page-founder,"founders,operators",impressions,542,count,2026-09-10T00:00:00Z,2026-09-16T00:00:00Z,2026-09-16T08:30:00Z,linkedin_native_export,export:20260916';
const commentsNull = 'obs-20260916,fp-post-1,linkedin,acct-fcr,page-founder,"founders,operators",comments,,count,2026-09-10T00:00:00Z,2026-09-16T00:00:00Z,2026-09-16T08:30:00Z,linkedin_native_export,export:20260916';
const profileViews = 'obs-20260916,fp-post-1,linkedin,acct-fcr,page-founder,"founders,operators",profile_views,20,count,2026-09-10T00:00:00Z,2026-09-16T00:00:00Z,2026-09-16T08:30:00Z,linkedin_native_export,export:20260916';

describe('parseContentMetricsCsv', () => {
  it('normalizes a safe real CSV shape with explicit identity, provenance, units, and null semantics', () => {
    const receipt = parseContentMetricsCsv(csv(impressions, commentsNull, profileViews));

    expect(receipt).toMatchObject({
      contract: 'content-metrics-csv@v1',
      authority: 'observation_only',
      freshnessAuthority: false,
      publicationAuthority: false,
      strategyMutationAuthority: false,
      inputRowCount: 3,
      normalizedRowCount: 3,
      duplicateRowsCollapsed: 0,
    });
    expect(receipt.importFingerprint).toMatch(/^[0-9a-f]{64}$/);

    const impressionsRow = receipt.observations.find((row) => row.metricName === 'impressions');
    expect(impressionsRow).toMatchObject({
      observationId: 'obs-20260916',
      contentFingerprint: 'fp-post-1',
      provider: 'linkedin',
      accountId: 'acct-fcr',
      pageId: 'page-founder',
      audienceSegment: 'founders,operators',
      metricValue: 542,
      unit: 'count',
      evidenceState: 'OBSERVED',
      windowStart: '2026-09-10T00:00:00Z',
      windowEnd: '2026-09-16T00:00:00Z',
      observedAt: '2026-09-16T08:30:00Z',
      provenance: {
        source: 'linkedin_native_export',
        sourceRef: 'export:20260916',
      },
    });
    expect(impressionsRow?.provenance.rowFingerprint).toMatch(/^[0-9a-f]{64}$/);

    expect(receipt.observations.find((row) => row.metricName === 'comments')).toMatchObject({
      metricValue: null,
      evidenceState: 'UNKNOWN_NO_EVIDENCE',
    });
  });

  it('is idempotent across input ordering and collapses only exact duplicates', () => {
    const first = parseContentMetricsCsv(csv(impressions, profileViews, commentsNull));
    const reordered = parseContentMetricsCsv(csv(commentsNull, impressions, profileViews));
    const duplicated = parseContentMetricsCsv(csv(impressions, impressions, profileViews, commentsNull));

    expect(reordered.importFingerprint).toBe(first.importFingerprint);
    expect(duplicated.importFingerprint).toBe(first.importFingerprint);
    expect(duplicated.inputRowCount).toBe(4);
    expect(duplicated.normalizedRowCount).toBe(3);
    expect(duplicated.duplicateRowsCollapsed).toBe(1);
  });

  it('keeps distinct content, providers, and metric windows as separate business observations', () => {
    const secondContent = impressions
      .replace('fp-post-1', 'fp-post-2')
      .replace(',542,count,', ',311,count,');
    const secondProvider = impressions
      .replace(',linkedin,', ',facebook,')
      .replace(',542,count,', ',410,count,');
    const nextWindow = impressions
      .replace('2026-09-10T00:00:00Z', '2026-09-17T00:00:00Z')
      .replace('2026-09-16T00:00:00Z', '2026-09-23T00:00:00Z')
      .replace('2026-09-16T08:30:00Z', '2026-09-23T08:30:00Z')
      .replace(',542,count,', ',625,count,');

    const receipt = parseContentMetricsCsv(csv(impressions, secondContent, secondProvider, nextWindow));

    expect(receipt.inputRowCount).toBe(4);
    expect(receipt.normalizedRowCount).toBe(4);
    expect(receipt.duplicateRowsCollapsed).toBe(0);
    expect(receipt.observations.map((row) => row.metricValue)).toEqual(expect.arrayContaining([542, 311, 410, 625]));
  });

  it('does not let delimiter characters create duplicate-identity collisions', () => {
    const left = impressions
      .replace('obs-20260916,fp-post-1', 'obs|x,fp')
      .replace(',542,count,', ',101,count,');
    const right = impressions
      .replace('obs-20260916,fp-post-1', 'obs,x|fp')
      .replace(',542,count,', ',202,count,');

    const receipt = parseContentMetricsCsv(csv(left, right));

    expect(receipt.normalizedRowCount).toBe(2);
    expect(receipt.duplicateRowsCollapsed).toBe(0);
    expect(receipt.observations.map((row) => row.metricValue)).toEqual(expect.arrayContaining([101, 202]));
  });

  it('fails closed on conflicting duplicates instead of choosing a convenient value', () => {
    const conflict = impressions.replace(',542,count,', ',543,count,');
    expect(() => parseContentMetricsCsv(csv(impressions, conflict))).toThrow(
      'conflicting duplicate metric identity',
    );
  });

  it('accepts historical imports as provenance without granting freshness authority', () => {
    const historical = 'obs-20250101,fp-old,linkedin,acct-fcr,page-founder,founders,impressions,100,count,2025-01-01T00:00:00Z,2025-01-07T00:00:00Z,2025-01-08T00:00:00Z,linkedin_native_export,archive:2025-01';
    const receipt = parseContentMetricsCsv(csv(historical));

    expect(receipt.freshnessAuthority).toBe(false);
    expect(receipt.observations[0]).toMatchObject({
      windowStart: '2025-01-01T00:00:00Z',
      windowEnd: '2025-01-07T00:00:00Z',
      observedAt: '2025-01-08T00:00:00Z',
      provenance: { sourceRef: 'archive:2025-01' },
    });
  });

  it('rejects ambiguous, impossible, and out-of-range timestamps plus identity/schema drift', () => {
    expect(() => parseContentMetricsCsv(csv(
      impressions.replace('2026-09-16T08:30:00Z', '2026-09-16T08:30:00'),
    ))).toThrow('observed_at must be an offset-aware ISO timestamp');

    expect(() => parseContentMetricsCsv(csv(
      impressions.replace('2026-09-16T08:30:00Z', '2026-02-30T08:30:00Z'),
    ))).toThrow('observed_at must be a real offset-aware ISO timestamp');

    expect(() => parseContentMetricsCsv(csv(
      impressions.replace('2026-09-16T08:30:00Z', '2026-09-16T08:30:00+15:00'),
    ))).toThrow('observed_at must be a real offset-aware ISO timestamp');

    expect(() => parseContentMetricsCsv(csv(
      impressions.replace(',acct-fcr,page-founder,', ',,page-founder,'),
    ))).toThrow('account_id is required');

    expect(() => parseContentMetricsCsv(csv(
      impressions.replace(',page-founder,"founders,operators",', ',,"founders,operators",'),
    ))).toThrow('page_id is required');

    expect(() => parseContentMetricsCsv(csv(
      impressions.replace(',"founders,operators",impressions,', ',,impressions,'),
    ))).toThrow('audience_segment is required');

    expect(() => parseContentMetricsCsv(csv(
      impressions.replace(',542,count,', ',542,percent,'),
    ))).toThrow('unit must be count');

    expect(() => parseContentMetricsCsv(csv(
      impressions.replace(',impressions,542,', ',mystery_metric,542,'),
    ))).toThrow('unsupported metric_name mystery_metric');
  });

  it('rejects malformed quoted fields instead of accepting ambiguous CSV', () => {
    expect(() => parseContentMetricsCsv(csv(
      impressions.replace('"founders,operators"', '"founders,operators"x'),
    ))).toThrow('quoted field must be followed by a comma, newline, or end-of-input');
  });

  it('rejects reversed windows, pre-window observations, negative values, and schema drift', () => {
    expect(() => parseContentMetricsCsv(csv(
      impressions
        .replace('2026-09-10T00:00:00Z', '2026-09-17T00:00:00Z'),
    ))).toThrow('window_start must not follow window_end');

    expect(() => parseContentMetricsCsv(csv(
      impressions.replace('2026-09-16T08:30:00Z', '2026-09-15T23:00:00Z'),
    ))).toThrow('observed_at must not predate window_end');

    expect(() => parseContentMetricsCsv(csv(
      impressions.replace(',542,count,', ',-1,count,'),
    ))).toThrow('metric_value must be a non-negative integer or blank');

    expect(() => parseContentMetricsCsv(`${header},unexpected\n${impressions},extra`)).toThrow(
      'headers must exactly equal',
    );
  });
});
