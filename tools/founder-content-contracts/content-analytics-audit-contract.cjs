'use strict';

const { createHash } = require('node:crypto');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FORBIDDEN_FIELDS = new Set([
  'raw_post_text',
  'dm_text',
  'comment_text',
  'provider_payload',
  'customer_data',
  'private_notes',
]);
const DAILY_METRICS = Object.freeze(['impressions', 'engagements', 'gross_new_followers']);

function reject(errors) {
  const error = new Error(`CONTENT_ANALYTICS_AUDIT_REJECTED: ${errors.join('; ')}`);
  error.code = 'CONTENT_ANALYTICS_AUDIT_REJECTED';
  error.details = errors;
  throw error;
}

function asString(value, max = 240) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertIso(value, field, errors) {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) errors.push(`${field} must be ISO UTC`);
}

function assertDay(value, field, errors) {
  if (!DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) errors.push(`${field} must be YYYY-MM-DD`);
}

function assertMetric(value, field, errors) {
  if (value === null || value === undefined) return;
  if (!Number.isInteger(value) || value < 0) errors.push(`${field} must be a non-negative integer or null`);
}

function findForbidden(value, path = 'input', hits = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbidden(item, `${path}[${index}]`, hits));
    return hits;
  }
  if (!isRecord(value)) return hits;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.has(key)) hits.push(`${path}.${key}`);
    findForbidden(child, `${path}.${key}`, hits);
  }
  return hits;
}

function normalizeAudience(value, field, errors) {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) {
    errors.push(`${field} must be an object of segment shares`);
    return {};
  }
  const normalized = {};
  for (const [segment, share] of Object.entries(value)) {
    const key = asString(segment, 160);
    if (!key) {
      errors.push(`${field} contains an empty segment`);
      continue;
    }
    if (typeof share !== 'number' || !Number.isFinite(share) || share < 0 || share > 1) {
      errors.push(`${field}.${key} must be a share between 0 and 1`);
      continue;
    }
    normalized[key] = share;
  }
  return normalized;
}

function normalizeSnapshot(input, index, errors) {
  if (!isRecord(input)) {
    errors.push(`snapshots[${index}] must be an object`);
    return null;
  }
  const id = asString(input.id, 120);
  const capturedAt = asString(input.captured_at, 64);
  const windowStart = asString(input.window_start, 10);
  const windowEnd = asString(input.window_end, 10);
  if (!id) errors.push(`snapshots[${index}].id is required`);
  assertIso(capturedAt, `snapshots[${index}].captured_at`, errors);
  assertDay(windowStart, `snapshots[${index}].window_start`, errors);
  assertDay(windowEnd, `snapshots[${index}].window_end`, errors);
  if (windowStart && windowEnd && windowStart > windowEnd) errors.push(`snapshots[${index}] window_start must not be after window_end`);

  const dailyInput = Array.isArray(input.daily) ? input.daily : [];
  const daily = dailyInput.map((row, rowIndex) => {
    if (!isRecord(row)) {
      errors.push(`snapshots[${index}].daily[${rowIndex}] must be an object`);
      return null;
    }
    const date = asString(row.date, 10);
    assertDay(date, `snapshots[${index}].daily[${rowIndex}].date`, errors);
    const normalized = { date, complete: row.complete === true };
    for (const metric of DAILY_METRICS) {
      const value = row[metric] === undefined ? null : row[metric];
      assertMetric(value, `snapshots[${index}].daily[${rowIndex}].${metric}`, errors);
      normalized[metric] = value ?? null;
    }
    return normalized;
  }).filter(Boolean);

  const postsInput = Array.isArray(input.posts) ? input.posts : [];
  const posts = postsInput.map((row, rowIndex) => {
    if (!isRecord(row)) {
      errors.push(`snapshots[${index}].posts[${rowIndex}] must be an object`);
      return null;
    }
    const postKey = asString(row.post_key, 240);
    if (!postKey) errors.push(`snapshots[${index}].posts[${rowIndex}].post_key is required`);
    const impressions = row.impressions === undefined ? null : row.impressions;
    const engagements = row.engagements === undefined ? null : row.engagements;
    assertMetric(impressions, `snapshots[${index}].posts[${rowIndex}].impressions`, errors);
    assertMetric(engagements, `snapshots[${index}].posts[${rowIndex}].engagements`, errors);
    return { post_key: postKey, impressions: impressions ?? null, engagements: engagements ?? null };
  }).filter(Boolean);

  const headline = isRecord(input.headline) ? {
    impressions: input.headline.impressions ?? null,
    engagements: input.headline.engagements ?? null,
    members_reached: input.headline.members_reached ?? null,
    gross_new_followers: input.headline.gross_new_followers ?? null,
    total_followers: input.headline.total_followers ?? null,
  } : {};
  for (const [key, value] of Object.entries(headline)) {
    assertMetric(value, `snapshots[${index}].headline.${key}`, errors);
  }

  return {
    id,
    captured_at: capturedAt,
    window_start: windowStart,
    window_end: windowEnd,
    daily,
    posts,
    audience: normalizeAudience(input.audience, `snapshots[${index}].audience`, errors),
    headline,
  };
}

function reconcileDaily(snapshots) {
  const sorted = [...snapshots].sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
  const latest = new Map();
  const revisions = [];

  for (const snapshot of sorted) {
    for (const row of snapshot.daily) {
      const previous = latest.get(row.date);
      if (previous) {
        const changed = DAILY_METRICS.some((metric) => previous[metric] !== row[metric]) || previous.complete !== row.complete;
        if (changed) {
          revisions.push({
            date: row.date,
            previous_snapshot_id: previous.snapshot_id,
            replacement_snapshot_id: snapshot.id,
            previous: Object.fromEntries(DAILY_METRICS.map((metric) => [metric, previous[metric]])),
            replacement: Object.fromEntries(DAILY_METRICS.map((metric) => [metric, row[metric]])),
          });
        }
      }
      latest.set(row.date, { ...row, snapshot_id: snapshot.id, captured_at: snapshot.captured_at });
    }
  }

  return {
    daily: [...latest.values()].sort((a, b) => a.date.localeCompare(b.date)),
    revisions,
  };
}

function dateRange(start, end) {
  const days = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const stop = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= stop) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function aggregateRange(reconciled, start, end) {
  const expectedDates = dateRange(start, end);
  const byDate = new Map(reconciled.map((row) => [row.date, row]));
  const rows = expectedDates.map((date) => byDate.get(date)).filter(Boolean);
  const missingDates = expectedDates.filter((date) => !byDate.has(date));
  const incompleteDates = rows.filter((row) => row.complete !== true).map((row) => row.date);
  const unknownMetricDates = rows.filter((row) => row.impressions === null || row.engagements === null).map((row) => row.date);
  const complete = missingDates.length === 0 && incompleteDates.length === 0 && unknownMetricDates.length === 0;

  if (!complete) {
    return {
      state: 'INCOMPLETE',
      start,
      end,
      days: expectedDates.length,
      missing_dates: missingDates,
      incomplete_dates: incompleteDates,
      unknown_metric_dates: unknownMetricDates,
      impressions: null,
      engagements: null,
      avg_impressions_per_day: null,
      avg_engagements_per_day: null,
      engagement_rate: null,
    };
  }

  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const engagements = rows.reduce((sum, row) => sum + row.engagements, 0);
  return {
    state: 'COMPLETE',
    start,
    end,
    days: expectedDates.length,
    missing_dates: [],
    incomplete_dates: [],
    unknown_metric_dates: [],
    impressions,
    engagements,
    avg_impressions_per_day: impressions / expectedDates.length,
    avg_engagements_per_day: engagements / expectedDates.length,
    engagement_rate: impressions > 0 ? engagements / impressions : null,
  };
}

function ratioChange(current, baseline) {
  if (current === null || baseline === null || baseline === 0) return null;
  return current / baseline - 1;
}

function buildComparison(reconciled, comparison, errors) {
  if (!isRecord(comparison)) {
    errors.push('comparison is required');
    return null;
  }
  const baselineStart = asString(comparison.baseline_start, 10);
  const baselineEnd = asString(comparison.baseline_end, 10);
  const recentStart = asString(comparison.recent_start, 10);
  const recentEnd = asString(comparison.recent_end, 10);
  assertDay(baselineStart, 'comparison.baseline_start', errors);
  assertDay(baselineEnd, 'comparison.baseline_end', errors);
  assertDay(recentStart, 'comparison.recent_start', errors);
  assertDay(recentEnd, 'comparison.recent_end', errors);
  if (errors.length > 0) return null;

  const baseline = aggregateRange(reconciled, baselineStart, baselineEnd);
  const recent = aggregateRange(reconciled, recentStart, recentEnd);
  return {
    baseline,
    recent,
    change: {
      avg_impressions_per_day: ratioChange(recent.avg_impressions_per_day, baseline.avg_impressions_per_day),
      avg_engagements_per_day: ratioChange(recent.avg_engagements_per_day, baseline.avg_engagements_per_day),
      engagement_rate: ratioChange(recent.engagement_rate, baseline.engagement_rate),
    },
  };
}

function buildConcentration(snapshot, topCount) {
  const observed = snapshot.posts.filter((post) => Number.isInteger(post.impressions) && Number.isInteger(post.engagements));
  const totalImpressions = observed.reduce((sum, post) => sum + post.impressions, 0);
  const totalEngagements = observed.reduce((sum, post) => sum + post.engagements, 0);
  const top = [...observed]
    .sort((a, b) => b.engagements - a.engagements || b.impressions - a.impressions || a.post_key.localeCompare(b.post_key))
    .slice(0, topCount);
  const topImpressions = top.reduce((sum, post) => sum + post.impressions, 0);
  const topEngagements = top.reduce((sum, post) => sum + post.engagements, 0);
  return {
    top_post_count: topCount,
    top_posts: top.map((post) => ({
      ...post,
      engagement_rate: post.impressions > 0 ? post.engagements / post.impressions : null,
    })),
    top_share_of_impressions: totalImpressions > 0 ? topImpressions / totalImpressions : null,
    top_share_of_engagements: totalEngagements > 0 ? topEngagements / totalEngagements : null,
  };
}

function buildAudienceShift(baseline, current) {
  const segments = [...new Set([...Object.keys(baseline.audience), ...Object.keys(current.audience)])].sort();
  return segments.map((segment) => {
    const baselineShare = Object.prototype.hasOwnProperty.call(baseline.audience, segment) ? baseline.audience[segment] : null;
    const currentShare = Object.prototype.hasOwnProperty.call(current.audience, segment) ? current.audience[segment] : null;
    return {
      segment,
      baseline_share: baselineShare,
      current_share: currentShare,
      delta_percentage_points: baselineShare === null || currentShare === null ? null : (currentShare - baselineShare) * 100,
    };
  });
}

function buildFounderContentAnalyticsAudit(input = {}) {
  const errors = [];
  for (const hit of findForbidden(input)) errors.push(`${hit} is forbidden`);

  const platform = asString(input.platform, 80).toLowerCase();
  const generatedAt = asString(input.generated_at, 64);
  if (!platform) errors.push('platform is required');
  assertIso(generatedAt, 'generated_at', errors);

  if (!Array.isArray(input.snapshots) || input.snapshots.length < 2) {
    errors.push('snapshots must contain at least two overlapping or comparable exports');
  }
  const snapshots = (Array.isArray(input.snapshots) ? input.snapshots : [])
    .map((snapshot, index) => normalizeSnapshot(snapshot, index, errors))
    .filter(Boolean);
  const ids = snapshots.map((snapshot) => snapshot.id);
  if (new Set(ids).size !== ids.length) errors.push('snapshot ids must be unique');

  const topCount = Number.isInteger(input.top_post_count) && input.top_post_count > 0 ? input.top_post_count : 2;
  if (errors.length > 0) reject(errors);

  const reconciled = reconcileDaily(snapshots);
  const comparisonErrors = [];
  const comparison = buildComparison(reconciled.daily, input.comparison, comparisonErrors);
  if (comparisonErrors.length > 0) reject(comparisonErrors);

  const ordered = [...snapshots].sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
  const baselineAudienceSnapshot = ordered[0];
  const currentSnapshot = ordered[ordered.length - 1];
  const partialDates = reconciled.daily.filter((row) => row.complete !== true).map((row) => row.date);

  const identity = {
    version: 1,
    platform,
    generated_at: generatedAt,
    snapshot_ids: ordered.map((snapshot) => snapshot.id),
    comparison,
    current_snapshot: {
      id: currentSnapshot.id,
      captured_at: currentSnapshot.captured_at,
      window_start: currentSnapshot.window_start,
      window_end: currentSnapshot.window_end,
      headline: currentSnapshot.headline,
    },
    concentration: buildConcentration(currentSnapshot, topCount),
    audience_shift: buildAudienceShift(baselineAudienceSnapshot, currentSnapshot),
    data_quality: {
      revision_count: reconciled.revisions.length,
      revised_dates: [...new Set(reconciled.revisions.map((revision) => revision.date))],
      partial_dates: partialDates,
      latest_observation_wins: true,
      incomplete_days_excluded_from_complete_comparisons: true,
    },
  };

  return Object.freeze({
    kind: 'fcr/founder-content-analytics-audit',
    ...identity,
    audit_hash: createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
    reconciled_daily: reconciled.daily,
    revisions: reconciled.revisions,
    authority: Object.freeze({
      observation_only: true,
      learning_authority: 'advisory_only',
      can_authorize_publish: false,
      can_change_content: false,
      can_execute: false,
      can_increase_authority: false,
    }),
    privacy: Object.freeze({
      raw_post_text_stored: false,
      private_messages_stored: false,
      raw_comments_stored: false,
      provider_payload_stored: false,
      customer_private_data_stored: false,
    }),
  });
}

module.exports = {
  buildFounderContentAnalyticsAudit,
  DAILY_METRICS,
};
