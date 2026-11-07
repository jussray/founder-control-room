import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildFounderContentAnalyticsAudit } = require(
  '../../../tools/founder-content-contracts/content-analytics-audit-contract.cjs',
) as {
  buildFounderContentAnalyticsAudit: (input: Record<string, unknown>) => Record<string, any>;
};

function dailyRange(start: string, values: Array<[number, number, number]>) {
  const rows: Array<Record<string, unknown>> = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  for (const [impressions, engagements, grossNewFollowers] of values) {
    rows.push({
      date: cursor.toISOString().slice(0, 10),
      impressions,
      engagements,
      gross_new_followers: grossNewFollowers,
      complete: true,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

const baselineDaily = dailyRange('2026-07-23', [
  [26, 0, 0], [46, 2, 1], [90, 5, 0], [291, 9, 1], [198, 9, 0], [441, 10, 1], [201, 4, 1],
  [176, 5, 0], [172, 0, 4], [99, 2, 0], [140, 1, 1], [690, 5, 4], [167, 7, 2], [92, 5, 3],
  [107, 5, 1], [47, 3, 2], [91, 3, 0], [262, 5, 4], [79, 0, 2], [72, 2, 3], [37, 0, 3],
  [40, 3, 5], [50, 2, 2], [26, 0, 0], [38, 1, 0], [46, 2, 2], [29, 2, 6], [1, 0, 0],
]);

function buildFixture(overrides: Record<string, unknown> = {}) {
  return buildFounderContentAnalyticsAudit({
    platform: 'linkedin',
    generated_at: '2026-08-20T20:58:00.000Z',
    snapshots: [
      {
        id: 'linkedin-28d-2026-08-19',
        captured_at: '2026-08-19T20:00:00.000Z',
        window_start: '2026-07-23',
        window_end: '2026-08-19',
        daily: baselineDaily,
        audience: {
          Founder: 0.06,
          Owner: 0.08,
          CXO: 0.06,
          'Software Engineer': 0.18,
        },
      },
      {
        id: 'linkedin-7d-2026-08-20',
        captured_at: '2026-08-20T20:00:00.000Z',
        window_start: '2026-08-14',
        window_end: '2026-08-20',
        daily: [
          { date: '2026-08-19', impressions: 72, engagements: 6, gross_new_followers: 0, complete: true },
          { date: '2026-08-20', impressions: 26, engagements: 0, gross_new_followers: 3, complete: false },
        ],
        headline: {
          impressions: 287,
          engagements: 13,
          members_reached: 149,
          gross_new_followers: 13,
          total_followers: 57,
        },
        posts: [
          { post_key: 'agentic-governance', impressions: 56, engagements: 6 },
          { post_key: 'ai-agents', impressions: 49, engagements: 5 },
          { post_key: 'other-current-posts', impressions: 182, engagements: 2 },
        ],
        audience: {
          Founder: 0.14,
          Owner: 0.15,
          CXO: 0.09,
          'Software Engineer': 0.09,
        },
      },
    ],
    comparison: {
      baseline_start: '2026-07-23',
      baseline_end: '2026-08-12',
      recent_start: '2026-08-13',
      recent_end: '2026-08-18',
    },
    top_post_count: 2,
    ...overrides,
  });
}

describe('founder content analytics audit contract', () => {
  it('reconciles overlapping exports by capture time and records revisions', () => {
    const audit = buildFixture();
    const aug19 = audit.reconciled_daily.find((row: Record<string, unknown>) => row.date === '2026-08-19');

    expect(aug19.impressions).toBe(72);
    expect(aug19.engagements).toBe(6);
    expect(audit.revisions).toHaveLength(1);
    expect(audit.revisions[0]).toMatchObject({
      date: '2026-08-19',
      previous_snapshot_id: 'linkedin-28d-2026-08-19',
      replacement_snapshot_id: 'linkedin-7d-2026-08-20',
    });
  });

  it('excludes partial days from complete baseline comparisons', () => {
    const audit = buildFixture();

    expect(audit.data_quality.partial_dates).toEqual(['2026-08-20']);
    expect(audit.comparison.baseline).toMatchObject({ state: 'COMPLETE', impressions: 3524, engagements: 82, days: 21 });
    expect(audit.comparison.recent).toMatchObject({ state: 'COMPLETE', impressions: 229, engagements: 10, days: 6 });
    expect(audit.comparison.change.avg_impressions_per_day).toBeCloseTo(-0.7725595914, 9);
    expect(audit.comparison.change.engagement_rate).toBeCloseTo(0.8766641815, 9);
  });

  it('measures current engagement concentration without mistaking reach for resonance', () => {
    const audit = buildFixture();

    expect(audit.concentration.top_share_of_engagements).toBeCloseTo(11 / 13, 12);
    expect(audit.concentration.top_share_of_impressions).toBeCloseTo(105 / 287, 12);
    expect(audit.concentration.top_posts[0]).toMatchObject({ post_key: 'agentic-governance', impressions: 56, engagements: 6 });
  });

  it('reports audience composition changes as percentage-point deltas', () => {
    const audit = buildFixture();
    const founder = audit.audience_shift.find((row: Record<string, unknown>) => row.segment === 'Founder');
    const engineer = audit.audience_shift.find((row: Record<string, unknown>) => row.segment === 'Software Engineer');

    expect(founder.delta_percentage_points).toBeCloseTo(8, 12);
    expect(engineer.delta_percentage_points).toBeCloseTo(-9, 12);
  });

  it('keeps analytics advisory-only and non-authorizing', () => {
    const audit = buildFixture();

    expect(audit.kind).toBe('fcr/founder-content-analytics-audit');
    expect(audit.audit_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(audit.authority).toMatchObject({
      observation_only: true,
      learning_authority: 'advisory_only',
      can_authorize_publish: false,
      can_change_content: false,
      can_execute: false,
      can_increase_authority: false,
    });
  });

  it('rejects raw/private payloads rather than learning from them', () => {
    expect(() => buildFixture({ raw_post_text: 'do not store me' }))
      .toThrow(/input\.raw_post_text is forbidden/);
  });

  it('returns INCOMPLETE instead of fabricating a comparison when evidence is missing', () => {
    const audit = buildFixture({
      comparison: {
        baseline_start: '2026-07-23',
        baseline_end: '2026-08-12',
        recent_start: '2026-08-13',
        recent_end: '2026-08-20',
      },
    });

    expect(audit.comparison.recent.state).toBe('INCOMPLETE');
    expect(audit.comparison.recent.engagement_rate).toBeNull();
    expect(audit.comparison.change.engagement_rate).toBeNull();
  });
});
