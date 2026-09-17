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

describe('founder content analytics CSV ingestion', () => {
  it('binds a safe CSV import to account, page, source, historical provenance, units, and explicit audience segments', () => {
    const receipt = parseFounderContentAnalyticsCsv(safeCsv, metadata);

    expect(receipt.contract).toBe('fcr/founder-content-analytics-csv-ingest@v1');
    expect(receipt.account).toEqual({
      id: 'linkedin-account-safe-fixture',
      name: 'Safe Fixture Account',
    });
    expect(receipt.page).toEqual({ id: 'linkedin-page-safe-fixture' });
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

  it('is idempotent for the same logical evidence even when presentation provenance changes', () => {
    const first = parseFounderContentAnalyticsCsv(safeCsv, metadata);
    const second = parseFounderContentAnalyticsCsv(safeCsv, metadata);
    const renamedAndRegenerated = parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      generated_at: '2026-09-05T12:00:00.000Z',
      file_name: 'renamed-safe-fixture.csv',
      account_name: 'Renamed Display Account',
    });
    const otherPage = parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      page_id: 'different-linkedin-page',
    });

    expect(first.idempotency_key).toBe(second.idempotency_key);
    expect(first.idempotency_key).toBe(renamedAndRegenerated.idempotency_key);
    expect(renamedAndRegenerated.source.sha256).toBe(first.source.sha256);
    expect(renamedAndRegenerated.source.file_name).toBe('renamed-safe-fixture.csv');
    expect(renamedAndRegenerated.generated_at).toBe('2026-09-05T12:00:00.000Z');
    expect(otherPage.idempotency_key).not.toBe(first.idempotency_key);
  });

  it('rejects duplicate dates inside one snapshot instead of silently overwriting them', () => {
    const duplicate = `${safeCsv.trim()}\ncurrent-2026-09-03,2026-09-03T23:00:00.000Z,2026-09-02,2026-09-03,current_export,daily,2026-09-03,true,131,16,2,,\n`;

    expect(() => parseFounderContentAnalyticsCsv(duplicate, metadata))
      .toThrow(/duplicate daily date 2026-09-03/);
  });

  it('rejects duplicate audience segments inside one snapshot', () => {
    const duplicate = `${safeCsv.trim()}\ncurrent-2026-09-03,2026-09-03T23:00:00.000Z,2026-09-02,2026-09-03,current_export,audience,,,,,,Founder,0.31\n`;
    expect(() => parseFounderContentAnalyticsCsv(duplicate, metadata))
      .toThrow(/duplicate audience_segment Founder/);
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

  it('rejects timestamps without an explicit offset instead of guessing provenance time', () => {
    expect(() => parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      generated_at: '2026-09-04T12:00:00',
    })).toThrow(/metadata\.generated_at must be an offset-aware ISO timestamp/);

    const offsetlessCapture = safeCsv.replace(
      '2026-09-03T23:00:00.000Z',
      '2026-09-03T23:00:00.000',
    );
    expect(() => parseFounderContentAnalyticsCsv(offsetlessCapture, metadata))
      .toThrow(/captured_at must be an offset-aware ISO timestamp/);
  });

  it('rejects impossible generated and captured timestamps instead of accepting Date.parse normalization', () => {
    expect(() => parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      generated_at: '2026-02-30T12:00:00.000Z',
    })).toThrow(/metadata\.generated_at date must be a real calendar date/);

    const impossibleCapture = safeCsv.replace(
      '2026-09-03T23:00:00.000Z',
      '2026-02-30T23:00:00.000Z',
    );
    expect(() => parseFounderContentAnalyticsCsv(impossibleCapture, metadata))
      .toThrow(/captured_at date must be a real calendar date/);
  });

  it('rejects trailing text after a quoted field instead of silently changing the metric value', () => {
    const malformedQuotedMetric = safeCsv.replace(
      'historical_import,daily,2026-09-01,true,100,10,2,,',
      'historical_import,daily,2026-09-01,true,"10"5,10,2,,',
    );

    expect(() => parseFounderContentAnalyticsCsv(malformedQuotedMetric, metadata))
      .toThrow(/quoted CSV field must be followed by a comma, newline, or end-of-input/);
  });

  it('rejects snapshot IDs longer than the downstream audit identity bound', () => {
    const overlongSnapshotId = safeCsv.replaceAll('current-2026-09-03', 's'.repeat(121));

    expect(() => parseFounderContentAnalyticsCsv(overlongSnapshotId, metadata))
      .toThrow(/snapshot_id exceeds 120 characters/);
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

  it('rejects missing or overlong account/page identity instead of weakening provenance', () => {
    expect(() => parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      account_id: 'a'.repeat(201),
    })).toThrow(/metadata\.account_id exceeds 200 characters/);

    expect(() => parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      page_id: '',
    })).toThrow(/metadata\.page_id is required/);

    expect(() => parseFounderContentAnalyticsCsv(safeCsv, {
      ...metadata,
      page_id: 'p'.repeat(201),
    })).toThrow(/metadata\.page_id exceeds 200 characters/);
  });
});