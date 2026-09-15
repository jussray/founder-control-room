'use strict';

const { createHash } = require('node:crypto');
const { buildFounderContentAnalyticsAudit } = require('./content-analytics-audit-contract.cjs');

const CONTRACT = 'fcr/founder-content-analytics-csv-ingest@v1';
const MAX_BYTES = 1_000_000;
const MAX_ROWS = 5_000;
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

function fail(message) {
  const error = new Error(`CONTENT_ANALYTICS_CSV_REJECTED: ${message}`);
  error.code = 'CONTENT_ANALYTICS_CSV_REJECTED';
  throw error;
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

function validateComparison(comparison) {
  if (!comparison || typeof comparison !== 'object' || Array.isArray(comparison)) {
    fail('metadata.comparison is required');
  }
  for (const prefix of ['baseline', 'recent']) {
    const startField = `${prefix}_start`;
    const endField = `${prefix}_end`;
    const start = parseIsoDate(comparison[startField], `metadata.comparison.${startField}`);
    const end = parseIsoDate(comparison[endField], `metadata.comparison.${endField}`);
    if (start > end) fail(`metadata.comparison.${startField} is after metadata.comparison.${endField}`);
  }
}

function parseCsv(textValue) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < textValue.length; index += 1) {
    const char = textValue[index];
    if (quoted) {
      if (char === '"') {
        if (textValue[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
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
  if (field.length > 0 || row.length > 0) {
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

function parseFounderContentAnalyticsCsv(csvText, metadata = {}) {
  if (typeof csvText !== 'string') fail('CSV input must be UTF-8 text');
  const byteLength = Buffer.byteLength(csvText, 'utf8');
  if (byteLength === 0) fail('CSV input is empty');
  if (byteLength > MAX_BYTES) fail(`CSV input exceeds ${MAX_BYTES} bytes`);

  const platform = boundedText(metadata.platform, 'metadata.platform', 80).toLowerCase();
  const generatedAt = boundedText(metadata.generated_at, 'metadata.generated_at', 64);
  const accountId = boundedText(metadata.account_id, 'metadata.account_id', 200);
  const accountName = boundedText(metadata.account_name, 'metadata.account_name', 200);
  const fileName = boundedText(metadata.file_name, 'metadata.file_name', 240);
  if (!platform) fail('metadata.platform is required');
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) fail('metadata.generated_at must be an ISO timestamp');
  if (!accountId) fail('metadata.account_id is required');
  if (!accountName) fail('metadata.account_name is required');
  if (!fileName) fail('metadata.file_name is required');
  validateComparison(metadata.comparison);

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
    if (!row.snapshot_id) fail(`line ${lineNumber} snapshot_id is required`);
    if (!row.captured_at || Number.isNaN(Date.parse(row.captured_at))) fail(`line ${lineNumber} captured_at must be an ISO timestamp`);
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
  const snapshots = [...groups.values()].map((group) => ({
    id: group.id,
    captured_at: group.captured_at,
    window_start: group.window_start,
    window_end: group.window_end,
    daily: group.daily,
    audience: group.audience,
  }));

  const audit = buildFounderContentAnalyticsAudit({
    platform,
    generated_at: generatedAt,
    snapshots,
    comparison: metadata.comparison,
    top_post_count: metadata.top_post_count,
  });

  const sourceSha256 = createHash('sha256').update(csvText).digest('hex');
  const account = Object.freeze({ id: accountId, name: accountName });
  const source = Object.freeze({
    kind: 'normalized_csv',
    file_name: fileName,
    sha256: sourceSha256,
    bytes: byteLength,
    row_count: rows.length - 1,
  });
  const snapshotSources = Object.freeze([...groups.values()].map((group) => Object.freeze({
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
    source,
    snapshot_sources: snapshotSources,
    metric_schema: metricSchema,
    audit_hash: audit.audit_hash,
  };
  const idempotencyKey = createHash('sha256').update(JSON.stringify(receiptIdentity)).digest('hex');

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
