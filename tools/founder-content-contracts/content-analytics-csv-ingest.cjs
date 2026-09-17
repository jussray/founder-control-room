'use strict';

const { createHash } = require('node:crypto');
const { buildFounderContentAnalyticsAudit } = require('./content-analytics-audit-contract.cjs');

const CONTRACT = 'fcr/founder-content-analytics-csv-ingest@v1';
const MAX_BYTES = 1_000_000;
const MAX_ROWS = 5_000;
const DEFAULT_TOP_POST_COUNT = 2;
const EXPECTED_COLUMNS = Object.freeze([
  'snapshot_id',
  'captured_at',
  'window_start',
  'window_end',
  'import_kind',
  'row_type',
  'date',
  'complete',
  'impressions',
  'engagements',
  'gross_new_followers',
  'audience_segment',
  'audience_share',
]);
const IMPORT_KINDS = new Set(['historical_import', 'current_export']);
const RESERVED_AUDIENCE_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const OFFSET_AWARE_ISO_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

function fail(message) {
  const error = new Error(`CONTENT_ANALYTICS_CSV_REJECTED: ${message}`);
  error.code = 'CONTENT_ANALYTICS_CSV_REJECTED';
  throw error;
}

function compareOrdinal(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function boundedText(value, field, max = 240) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (normalized.length > max) fail(`${field} exceeds ${max} characters`);
  return normalized;
}

function parseIsoDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${field} must be YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(`${field} must be a real calendar date`);
  }
  return value;
}

function parseIsoTimestamp(value, field) {
  if (typeof value !== 'string') fail(`${field} must be an offset-aware ISO timestamp`);
  const match = OFFSET_AWARE_ISO_TIMESTAMP.exec(value);
  if (!match) fail(`${field} must be an offset-aware ISO timestamp`);

  parseIsoDate(match[1], `${field} date`);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  if (hour > 23 || minute > 59 || second > 59) fail(`${field} must be a real ISO timestamp`);

  const offset = match[5];
  if (offset !== 'Z') {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      fail(`${field} has an invalid UTC offset`);
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) fail(`${field} must be a real ISO timestamp`);
  return parsed.toISOString();
}

function normalizeTopPostCount(value) {
  if (value === undefined || value === null) return DEFAULT_TOP_POST_COUNT;
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail('metadata.top_post_count must be a positive safe integer when provided');
  }
  return value;
}

function validateComparison(comparison) {
  if (!comparison || typeof comparison !== 'object' || Array.isArray(comparison)) {
    fail('metadata.comparison is required');
  }

  const values = {};
  for (const prefix of ['baseline', 'recent']) {
    const startField = `${prefix}_start`;
    const endField = `${prefix}_end`;
    const start = parseIsoDate(comparison[startField], `metadata.comparison.${startField}`);
    const end = parseIsoDate(comparison[endField], `metadata.comparison.${endField}`);
    if (start > end) fail(`metadata.comparison.${startField} is after metadata.comparison.${endField}`);
    values[startField] = start;
    values[endField] = end;
  }

  if (values.recent_start <= values.baseline_end) {
    fail('metadata.comparison.recent_start must be after metadata.comparison.baseline_end');
  }
}

function parseCsv(textValue) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let justClosedQuote = false;

  for (let index = 0; index < textValue.length; index += 1) {
    const char = textValue[index];
    if (quoted) {
      if (char === '"') {
        if (textValue[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          justClosedQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (justClosedQuote) {
      if (char === ',') {
        row.push(field);
        field = '';
        justClosedQuote = false;
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        justClosedQuote = false;
      } else if (char === '\r' && textValue[index + 1] === '\n') {
        // Keep waiting for the LF delimiter without accepting trailing field text.
      } else {
        fail('quoted CSV field must be followed by a comma, newline, or end-of-input');
      }
      continue;
    }

    if (char === '"') {
      if (field.length !== 0) fail('quote must begin at the start of a CSV field');
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) fail('unterminated quoted CSV field');
  if (field.length > 0 || row.length > 0 || justClosedQuote) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value !== ''));
}

function integerOrNull(value, field) {
  if (value === '') return null;
  if (!/^\d+$/.test(value)) fail(`${field} must be a non-negative integer or empty`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail(`${field} exceeds the safe integer range`);
  return parsed;
}

function share(value, field) {
  if (value === '') fail(`${field} is required`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) fail(`${field} must be between 0 and 1`);
  return parsed;
}

function assertSnapshotMetadata(group, row, lineNumber) {
  for (const field of ['captured_at', 'window_start', 'window_end', 'import_kind']) {
    if (group[field] !== row[field]) {
      fail(`line ${lineNumber} changes ${field} inside snapshot ${group.id}`);
    }
  }
}

function windowsOverlap(left, right) {
  return left.window_start <= right.window_end && right.window_start <= left.window_end;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function canonicalSnapshotEvidence(group) {
  return {
    snapshot_id: group.id,
    captured_at: group.captured_at,
    window_start: group.window_start,
    window_end: group.window_end,
    import_kind: group.import_kind,
    daily: [...group.daily].sort((left, right) => compareOrdinal(left.date, right.date)),
    audience: Object.fromEntries(
      Object.entries(group.audience).sort(([left], [right]) => compareOrdinal(left, right)),
    ),
  };
}

function parseFounderContentAnalyticsCsv(csvText, metadata = {}) {
  if (typeof csvText !== 'string') fail('CSV input must be UTF-8 text');
  const byteLength = Buffer.byteLength(csvText, 'utf8');
  if (byteLength === 0) fail('CSV input is empty');
  if (byteLength > MAX_BYTES) fail(`CSV input exceeds ${MAX_BYTES} bytes`);

  const platform = boundedText(metadata.platform, 'metadata.platform', 80).toLowerCase();
  const generatedAtInput = boundedText(metadata.generated_at, 'metadata.generated_at', 64);
  const accountId = boundedText(metadata.account_id, 'metadata.account_id', 200);
  const accountName = boundedText(metadata.account_name, 'metadata.account_name', 200);
  const pageId = boundedText(metadata.page_id, 'metadata.page_id', 200);
  const fileName = boundedText(metadata.file_name, 'metadata.file_name', 240);
  if (!platform) fail('metadata.platform is required');
  const generatedAt = parseIsoTimestamp(generatedAtInput, 'metadata.generated_at');
  if (!accountId) fail('metadata.account_id is required');
  if (!accountName) fail('metadata.account_name is required');
  if (!pageId) fail('metadata.page_id is required');
  if (!fileName) fail('metadata.file_name is required');
  validateComparison(metadata.comparison);
  const topPostCount = normalizeTopPostCount(metadata.top_post_count);

  const rows = parseCsv(csvText);
  if (rows.length < 2) fail('CSV must contain a header and at least one data row');
  if (rows.length - 1 > MAX_ROWS) fail(`CSV contains more than ${MAX_ROWS} data rows`);

  const header = rows[0].map((value) => value.trim());
  if (JSON.stringify(header) !== JSON.stringify(EXPECTED_COLUMNS)) {
    fail(`CSV header must exactly equal: ${EXPECTED_COLUMNS.join(',')}`);
  }

  const groups = new Map();
  for (let index = 1; index < rows.length; index += 1) {
    const values = rows[index];
    const lineNumber = index + 1;
    if (values.length !== EXPECTED_COLUMNS.length) {
      fail(`line ${lineNumber} has ${values.length} columns; expected ${EXPECTED_COLUMNS.length}`);
    }
    const row = Object.fromEntries(EXPECTED_COLUMNS.map((column, columnIndex) => [column, values[columnIndex].trim()]));
    row.snapshot_id = boundedText(row.snapshot_id, `line ${lineNumber} snapshot_id`, 120);
    if (!row.snapshot_id) fail(`line ${lineNumber} snapshot_id is required`);
    row.captured_at = parseIsoTimestamp(row.captured_at, `line ${lineNumber} captured_at`);
    parseIsoDate(row.window_start, `line ${lineNumber} window_start`);
    parseIsoDate(row.window_end, `line ${lineNumber} window_end`);
    if (row.window_start > row.window_end) fail(`line ${lineNumber} window_start is after window_end`);
    if (!IMPORT_KINDS.has(row.import_kind)) fail(`line ${lineNumber} import_kind must be historical_import or current_export`);

    let group = groups.get(row.snapshot_id);
    if (!group) {
      group = {
        id: row.snapshot_id,
        captured_at: row.captured_at,
        window_start: row.window_start,
        window_end: row.window_end,
        import_kind: row.import_kind,
        daily: [],
        audience: Object.create(null),
        seenDates: new Set(),
        seenSegments: new Set(),
      };
      groups.set(row.snapshot_id, group);
    } else {
      assertSnapshotMetadata(group, row, lineNumber);
    }

    if (row.row_type === 'daily') {
      parseIsoDate(row.date, `line ${lineNumber} daily date`);
      if (row.date < group.window_start || row.date > group.window_end) {
        fail(`line ${lineNumber} daily date ${row.date} falls outside snapshot window ${group.window_start}..${group.window_end}`);
      }
      if (group.seenDates.has(row.date)) fail(`snapshot ${row.snapshot_id} contains duplicate daily date ${row.date}`);
      group.seenDates.add(row.date);
      if (!['true', 'false'].includes(row.complete)) fail(`line ${lineNumber} complete must be true or false`);
      if (row.audience_segment || row.audience_share) fail(`line ${lineNumber} daily rows must not carry audience fields`);
      group.daily.push({
        date: row.date,
        complete: row.complete === 'true',
        impressions: integerOrNull(row.impressions, `line ${lineNumber} impressions`),
        engagements: integerOrNull(row.engagements, `line ${lineNumber} engagements`),
        gross_new_followers: integerOrNull(row.gross_new_followers, `line ${lineNumber} gross_new_followers`),
      });
    } else if (row.row_type === 'audience') {
      if (row.date || row.complete || row.impressions || row.engagements || row.gross_new_followers) {
        fail(`line ${lineNumber} audience rows must not carry daily metric fields`);
      }
      const segment = boundedText(row.audience_segment, `line ${lineNumber} audience_segment`, 160);
      if (!segment) fail(`line ${lineNumber} audience_segment is required`);
      if (RESERVED_AUDIENCE_SEGMENTS.has(segment.toLowerCase())) {
        fail(`line ${lineNumber} audience_segment ${segment} is reserved`);
      }
      if (group.seenSegments.has(segment)) fail(`snapshot ${row.snapshot_id} contains duplicate audience_segment ${segment}`);
      group.seenSegments.add(segment);
      group.audience[segment] = share(row.audience_share, `line ${lineNumber} audience_share`);
    } else {
      fail(`line ${lineNumber} row_type must be daily or audience`);
    }
  }

  if (groups.size < 2) fail('CSV must contain at least two snapshots for comparison');
  const groupList = [...groups.values()];
  const generatedAtMs = Date.parse(generatedAt);
  for (const group of groupList) {
    if (Date.parse(group.captured_at) > generatedAtMs) {
      fail(`snapshot ${group.id} captured_at must not be after metadata.generated_at`);
    }
  }
  for (let leftIndex = 0; leftIndex < groupList.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < groupList.length; rightIndex += 1) {
      const left = groupList[leftIndex];
      const right = groupList[rightIndex];
      if (left.captured_at === right.captured_at && windowsOverlap(left, right)) {
        fail(`overlapping snapshots ${left.id} and ${right.id} must not share captured_at`);
      }
    }
  }

  const snapshots = groupList.map((group) => ({
    id: group.id,
    captured_at: group.captured_at,
    window_start: group.window_start,
    window_end: group.window_end,
    daily: group.daily,
    audience: group.audience,
  }));

  const audit = deepFreeze(buildFounderContentAnalyticsAudit({
    platform,
    generated_at: generatedAt,
    snapshots,
    comparison: metadata.comparison,
    top_post_count: topPostCount,
  }));

  const sourceSha256 = createHash('sha256').update(csvText).digest('hex');
  const account = Object.freeze({ id: accountId, name: accountName });
  const page = Object.freeze({ id: pageId });
  const source = Object.freeze({
    kind: 'normalized_csv',
    file_name: fileName,
    sha256: sourceSha256,
    bytes: byteLength,
    row_count: rows.length - 1,
  });
  const snapshotSources = Object.freeze(groupList.map((group) => Object.freeze({
    snapshot_id: group.id,
    captured_at: group.captured_at,
    window_start: group.window_start,
    window_end: group.window_end,
    import_kind: group.import_kind,
  })));
  const metricSchema = Object.freeze({
    impressions: Object.freeze({ unit: 'count', nullable: true }),
    engagements: Object.freeze({ unit: 'count', nullable: true }),
    gross_new_followers: Object.freeze({ unit: 'count', nullable: true }),
    audience_share: Object.freeze({ unit: 'ratio_0_to_1', nullable: false }),
    audience_delta: Object.freeze({ unit: 'percentage_points', nullable: true }),
    post_concentration: Object.freeze({
      availability: 'unavailable',
      reason: 'post_level_metrics_not_present_in_csv_schema',
    }),
  });
  const metricAvailability = Object.freeze({
    post_concentration: Object.freeze({
      state: 'UNAVAILABLE',
      reason: 'post_level_metrics_not_present_in_csv_schema',
      observed_empty: false,
    }),
  });
  const audienceSegments = Object.freeze(audit.audience_shift.map((entry) => Object.freeze({
    audience_segment: entry.segment,
    baseline_share: entry.baseline_share,
    current_share: entry.current_share,
    delta_percentage_points: entry.delta_percentage_points,
  })));
  const receiptIdentity = {
    contract: CONTRACT,
    platform,
    generated_at: generatedAt,
    account,
    page,
    source,
    snapshot_sources: snapshotSources,
    metric_schema: metricSchema,
    metric_availability: metricAvailability,
    audit_hash: audit.audit_hash,
  };
  const comparisonIdentity = Object.freeze({
    baseline_start: metadata.comparison.baseline_start,
    baseline_end: metadata.comparison.baseline_end,
    recent_start: metadata.comparison.recent_start,
    recent_end: metadata.comparison.recent_end,
  });
  const normalizedEvidence = groupList
    .map(canonicalSnapshotEvidence)
    .sort((left, right) => compareOrdinal(left.captured_at, right.captured_at)
      || compareOrdinal(left.snapshot_id, right.snapshot_id));
  const idempotencyIdentity = {
    contract: CONTRACT,
    platform,
    account_id: accountId,
    page_id: pageId,
    normalized_evidence: normalizedEvidence,
    comparison: comparisonIdentity,
    top_post_count: topPostCount,
  };
  const idempotencyKey = createHash('sha256').update(JSON.stringify(idempotencyIdentity)).digest('hex');

  return Object.freeze({
    ...receiptIdentity,
    idempotency_key: idempotencyKey,
    audience_segments: audienceSegments,
    audit,
    authority: Object.freeze({
      observation_only: true,
      can_authorize_publish: false,
      can_execute: false,
    }),
  });
}

module.exports = {
  CONTRACT,
  EXPECTED_COLUMNS,
  parseFounderContentAnalyticsCsv,
};
