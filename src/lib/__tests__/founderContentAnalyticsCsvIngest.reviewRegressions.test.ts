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
    expect(receipt.audit.current_snapshot.captured_at).toBe('2026-09-03T23:00:00.000Z');
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

  it('rejects a snapshot captured before its declared observation window ends', () => {
    const futureObservation = safeCsv.replaceAll(
      '2026-09-02T23:00:00.000Z',
      '2026-09-01T23:00:00.000Z',
    );
    expect(() => parseFounderContentAnalyticsCsv(futureObservation, metadata))
      .toThrow(/captured_at must not be before its window_end/);
  });

  it('rejects equal capture timestamps even when snapshot windows are disjoint', () => {
    const lines = safeCsv.trimEnd().split('\n');
    const disjoint = lines
      .filter((line) => !line.startsWith('current-2026-09-03,') || !line.includes(',daily,2026-09-02,'))
      .map((line) => {
        if (line.startsWith('historical-2026-09-02,')) {
          return line.replace('2026-09-02T23:00:00.000Z', '2026-09-03T12:00:00.000Z');
        }
        if (line.startsWith('current-2026-09-03,')) {
          return line
            .replace('2026-09-03T23:00:00.000Z', '2026-09-03T12:00:00.000Z')
            .replace(',2026-09-02,2026-09-03,current_export,', ',2026-09-03,2026-09-03,current_export,');
        }
        return line;
      })
      .join('\n');

    expect(() => parseFounderContentAnalyticsCsv(disjoint, {
      ...metadata,
      comparison: {
        baseline_start: '2026-09-01',
        baseline_end: '2026-09-01',
        recent_start: '2026-09-03',
        recent_end: '2026-09-03',
      },
    })).toThrow(/must not share captured_at/);
  });

  it('rejects extra archival snapshots that would decouple audience shift from the declared comparison windows', () => {
    const [header, ...rows] = safeCsv.trimEnd().split('\n');
    const archivalRows = [
      'archival-2026-08-31,2026-08-31T23:00:00.000Z,2026-08-31,2026-08-31,historical_import,daily,2026-08-31,true,50,5,1,,',
      'archival-2026-08-31,2026-08-31T23:00:00.000Z,2026-08-31,2026-08-31,historical_import,audience,,,,,,Founder,0.10',
    ];
    const ambiguousAudience = [header, ...archivalRows, ...rows].join('\n');

    expect(() => parseFounderContentAnalyticsCsv(ambiguousAudience, metadata))
      .toThrow(/extra snapshots make audience comparison ambiguous/);
  });

  it('rejects reconciled comparison totals that exceed the JavaScript safe-integer range', () => {
    const unsafeAggregate = safeCsv
      .replace(',2026-09-02,true,125,15,1,,', ',2026-09-02,true,9007199254740991,15,1,,')
      .replace(',2026-09-03,true,130,,2,,', ',2026-09-03,true,1,,2,,');

    expect(() => parseFounderContentAnalyticsCsv(unsafeAggregate, {
      ...metadata,
      comparison: {
        baseline_start: '2026-09-01',
        baseline_end: '2026-09-01',
        recent_start: '2026-09-02',
        recent_end: '2026-09-03',
      },
    })).toThrow(/recent impressions aggregate exceeds the safe integer range/);
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

  it('marks absent audience rows unavailable instead of presenting an observed empty segment set', () => {
    const dailyOnlyCsv = safeCsv
      .split('\n')
      .filter((line) => !line.includes(',audience,'))
      .join('\n');
    const receipt = parseFounderContentAnalyticsCsv(dailyOnlyCsv, metadata);

    expect(receipt.audience_segments).toEqual([]);
    expect(receipt.metric_availability.audience_segments).toEqual({
      state: 'UNAVAILABLE',
      reason: 'audience_rows_not_present_for_comparison_snapshots',
      observed_empty: false,
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
