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
    expect(receipt.audience_segments).toContainEqual(expect.objectContaining({
      audience_segment: 'Founder',
      baseline_share: 0.2,
      current_share: 0.3,
      delta_percentage_points: expect.closeTo(10, 10),
    }));
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
});
