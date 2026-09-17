import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { parseFounderContentAnalyticsCsv } = require(
  '../../../tools/founder-content-contracts/content-analytics-csv-ingest.cjs',
) as {
  parseFounderContentAnalyticsCsv: (csv: string, metadata: Record<string, unknown>) => Record<string, any>;
};

const safeCsv = readFileSync(
  new URL('./fixtures/founder-content-analytics-safe.csv', import.meta.url),
  'utf8',
);

const metadata = {
  platform: 'linkedin',
  generated_at: '2026-09-04T12:00:00.000Z',
  account_id: 'linkedin-account-safe-fixture',
  account_name: 'Safe Fixture Account',
  page_id: 'linkedin-page-safe-fixture',
  file_name: 'founder-content-analytics-safe.csv',
  comparison: {
    baseline_start: '2026-09-01',
    baseline_end: '2026-09-01',
    recent_start: '2026-09-02',
    recent_end: '2026-09-02',
  },
};

describe('founder content analytics CSV review regressions', () => {
  it('normalizes valid explicit-offset timestamps to UTC before audit delegation', () => {
    const offsetCsv = safeCsv
      .replaceAll('2026-09-02T23:00:00.000Z', '2026-09-03T00:00:00+01:00')
      .replaceAll('2026-09-03T23:00:00.000Z', '2026-09-04T01:00:00+02:00');

    const receipt = parseFounderContentAnalyticsCsv(offsetCsv, {
      ...metadata,
      generated_at: '2026-09-04T13:00:00+01:00',
    });

    expect(receipt.generated_at).toBe('2026-09-04T12:00:00.000Z');
    expect(receipt.snapshot_sources).toEqual([
      expect.objectContaining({ captured_at: '2026-09-02T23:00:00.000Z' }),
      expect.objectContaining({ captured_at: '2026-09-03T23:00:00.000Z' }),
    ]);
  });

  it('rejects a recent comparison window that does not follow the baseline', () => {
    expect(() => parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      comparison: {
        baseline_start: '2026-09-02',
        baseline_end: '2026-09-02',
        recent_start: '2026-09-01',
        recent_end: '2026-09-01',
      },
    })).toThrow(/recent_start must be after metadata\.comparison\.baseline_end/);
  });

  it('rejects snapshot captures later than receipt generation time', () => {
    expect(() => parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      generated_at: '2026-09-03T12:00:00.000Z',
    })).toThrow(/captured_at must not be after metadata\.generated_at/);
  });

  it('rejects ambiguous equal capture timestamps for overlapping snapshots', () => {
    const ambiguous = safeCsv.replaceAll(
      '2026-09-03T23:00:00.000Z',
      '2026-09-02T23:00:00.000Z',
    );
    expect(() => parseFounderContentAnalyticsCsv(ambiguous, metadata))
      .toThrow(/must not share captured_at/);
  });

  it('rejects invalid explicit top-post scopes and canonicalizes omitted versus explicit default scope', () => {
    for (const invalid of [0, -1, 1.5, '2']) {
      expect(() => parseFounderContentAnalyticsCsv(safeCsv, {
        ...metadata,
        top_post_count: invalid,
      })).toThrow(/top_post_count must be a positive safe integer/);
    }

    const omitted = parseFounderContentAnalyticsCsv(safeCsv, metadata);
    const explicit = parseFounderContentAnalyticsCsv(safeCsv, { ...metadata, top_post_count: 2 });
    expect(omitted.idempotency_key).toBe(explicit.idempotency_key);
    expect(omitted.audit.concentration.top_post_count).toBe(2);
  });

  it('marks post concentration as unsupported evidence instead of an observed empty result', () => {
    const receipt = parseFounderContentAnalyticsCsv(safeCsv, metadata);

    expect(receipt.metric_availability.post_concentration).toEqual({
      state: 'UNAVAILABLE',
      reason: 'post_level_metrics_not_present_in_csv_schema',
      observed_empty: false,
    });
    expect(receipt.metric_schema.post_concentration).toEqual({
      availability: 'unavailable',
      reason: 'post_level_metrics_not_present_in_csv_schema',
    });
  });

  it('rejects malformed quoted fields and overlong snapshot identities at ingress', () => {
    const malformedQuotedMetric = safeCsv.replace(',100,10,2,,', ',"10"5,10,2,,');
    expect(() => parseFounderContentAnalyticsCsv(malformedQuotedMetric, metadata))
      .toThrow(/quoted CSV field must be followed by a comma, newline, or end-of-input/);

    const longId = 's'.repeat(121);
    const overlongSnapshot = safeCsv.replaceAll('historical-2026-09-02', longId);
    expect(() => parseFounderContentAnalyticsCsv(overlongSnapshot, metadata))
      .toThrow(/snapshot_id exceeds 120 characters/);
  });

  it('deep-freezes the hashed audit payload so callers cannot mutate evidence under a stable hash', () => {
    const receipt = parseFounderContentAnalyticsCsv(safeCsv, metadata);
    expect(Object.isFrozen(receipt.audit)).toBe(true);
    expect(Object.isFrozen(receipt.audit.comparison)).toBe(true);
    expect(Object.isFrozen(receipt.audit.comparison.baseline)).toBe(true);
    expect(() => {
      receipt.audit.comparison.baseline.impressions = 999;
    }).toThrow();
    expect(receipt.audit.comparison.baseline.impressions).not.toBe(999);
  });
});