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
  account_id: 'linkedin-page-safe-fixture',
  account_name: 'Safe Fixture Account',
  file_name: 'founder-content-analytics-safe.csv',
  comparison: {
    baseline_start: '2026-09-01',
    baseline_end: '2026-09-01',
    recent_start: '2026-09-02',
    recent_end: '2026-09-02',
  },
};

describe('founder content analytics CSV ingestion', () => {
  it('binds a safe CSV import to account, source, historical provenance, units, and explicit audience segments', () => {
    const receipt = parseFounderContentAnalyticsCsv(safeCsv, metadata);

    expect(receipt.contract).toBe('fcr/founder-content-analytics-csv-ingest@v1');
    expect(receipt.account).toEqual({
      id: 'linkedin-page-safe-fixture',
      name: 'Safe Fixture Account',
    });
    expect(receipt.source).toMatchObject({
      kind: 'normalized_csv',
      file_name: 'founder-content-analytics-safe.csv',
      row_count: 8,
    });
    expect(receipt.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.idempotency_key).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.snapshot_sources).toEqual([
      expect.objectContaining({ snapshot_id: 'historical-2026-09-02', import_kind: 'historical_import' }),
      expect.objectContaining({ snapshot_id: 'current-2026-09-03', import_kind: 'current_export' }),
    ]);
    expect(receipt.metric_schema.impressions).toEqual({ unit: 'count', nullable: true });
    expect(receipt.metric_schema.audience_share).toEqual({ unit: 'ratio_0_to_1', nullable: false });
    const founder = receipt.audience_segments.find(
      (entry: Record<string, unknown>) => entry.audience_segment === 'Founder',
    );
    expect(founder).toMatchObject({
      audience_segment: 'Founder',
      baseline_share: 0.2,
      current_share: 0.3,
    });
    expect(founder.delta_percentage_points).toBeCloseTo(10, 10);
    expect(receipt.audit.revisions).toContainEqual(expect.objectContaining({
      date: '2026-09-02',
      previous_snapshot_id: 'historical-2026-09-02',
      replacement_snapshot_id: 'current-2026-09-03',
    }));
    expect(receipt.audit.reconciled_daily.find((row: Record<string, unknown>) => row.date === '2026-09-03'))
      .toMatchObject({ engagements: null });
    expect(receipt.authority).toEqual({
      observation_only: true,
      can_authorize_publish: false,
      can_execute: false,
    });
  });

  it('is idempotent for the same bytes and metadata and changes identity when provenance changes', () => {
    const first = parseFounderContentAnalyticsCsv(safeCsv, metadata);
    const second = parseFounderContentAnalyticsCsv(safeCsv, metadata);
    const renamed = parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      file_name: 'renamed-safe-fixture.csv',
    });

    expect(first.idempotency_key).toBe(second.idempotency_key);
    expect(first.audit.audit_hash).toBe(second.audit.audit_hash);
    expect(renamed.idempotency_key).not.toBe(first.idempotency_key);
    expect(renamed.source.sha256).toBe(first.source.sha256);
  });

  it('rejects duplicate dates inside one snapshot instead of silently overwriting them', () => {
    const duplicate = `${safeCsv.trim()}\ncurrent-2026-09-03,2026-09-03T23:00:00.000Z,2026-09-02,2026-09-03,current_export,daily,2026-09-03,true,131,16,2,,\n`;

    expect(() => parseFounderContentAnalyticsCsv(duplicate, metadata))
      .toThrow(/duplicate daily date 2026-09-03/);
  });

  it('rejects daily rows that fall outside the declared snapshot window', () => {
    const outsideWindow = safeCsv.replace(
      'current-2026-09-03,2026-09-03T23:00:00.000Z,2026-09-02,2026-09-03,current_export,daily,2026-09-03,true,130,,2,,',
      'current-2026-09-03,2026-09-03T23:00:00.000Z,2026-09-02,2026-09-03,current_export,daily,2026-09-04,true,130,,2,,',
    );

    expect(() => parseFounderContentAnalyticsCsv(outsideWindow, metadata))
      .toThrow(/daily date 2026-09-04 falls outside snapshot window 2026-09-02\.\.2026-09-03/);
  });

  it('rejects reversed comparison windows instead of emitting false-complete zero evidence', () => {
    expect(() => parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      comparison: {
        baseline_start: '2026-09-02',
        baseline_end: '2026-09-01',
        recent_start: '2026-09-02',
        recent_end: '2026-09-03',
      },
    })).toThrow(/baseline_start is after metadata\.comparison\.baseline_end/);
  });

  it('rejects impossible calendar dates instead of normalizing them into provenance', () => {
    const impossible = safeCsv.replaceAll('2026-09-01', '2026-02-30');

    expect(() => parseFounderContentAnalyticsCsv(impossible, {
      ...metadata,
      comparison: {
        baseline_start: '2026-02-30',
        baseline_end: '2026-02-30',
        recent_start: '2026-09-02',
        recent_end: '2026-09-02',
      },
    })).toThrow(/must be a real calendar date/);
  });

  it('rejects prototype-sensitive audience segment names before they can alias object behavior', () => {
    for (const reserved of ['__proto__', 'prototype', 'constructor', 'Constructor']) {
      const reservedSegment = safeCsv.replaceAll('Founder', reserved);
      expect(() => parseFounderContentAnalyticsCsv(reservedSegment, metadata))
        .toThrow(new RegExp(`audience_segment ${reserved} is reserved`, 'i'));
    }
  });

  it('keeps missing metric values null and makes incomplete comparison evidence explicit', () => {
    const receipt = parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      comparison: {
        baseline_start: '2026-09-01',
        baseline_end: '2026-09-01',
        recent_start: '2026-09-03',
        recent_end: '2026-09-03',
      },
    });

    expect(receipt.audit.comparison.recent.state).toBe('INCOMPLETE');
    expect(receipt.audit.comparison.recent.engagements).toBeNull();
    expect(receipt.audit.comparison.change.engagement_rate).toBeNull();
  });

  it('rejects overlong account identity instead of truncating distinct provenance into one receipt identity', () => {
    expect(() => parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      account_id: 'a'.repeat(201),
    })).toThrow(/metadata\.account_id exceeds 200 characters/);
  });
});
