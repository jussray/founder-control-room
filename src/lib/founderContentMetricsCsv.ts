import {
  dedupeFounderContentMetrics,
  normalizeFounderContentMetricObservation,
  type FounderContentMetricObservation,
  type FounderContentMetricSource,
  type FounderContentMetricUnit,
} from './founderContentMetrics.js';

// Persistence intake for the broader founder-content metric ledger. This is
// intentionally distinct from contentMetricsCsv.ts, whose narrower
// content-metrics-csv@v1 contract is the public-safe content-evidence import
// boundary used by the existing analytics/Attack-3000 lane.
const MAX_CSV_BYTES = 1_000_000;
const MAX_CSV_ROWS = 10_000;
const MAX_COLUMNS = 20;
const MAX_CELL_CHARS = 4_000;

const REQUIRED_HEADERS = [
  'provider',
  'platform',
  'source',
  'account_id',
  'page_id',
  'metric_name',
  'metric_unit',
  'metric_value',
  'observed_at',
] as const;

function reject(message: string): never {
  throw new Error(`FOUNDER_CONTENT_METRICS_CSV_REJECTED: ${message}`);
}

function parseRows(csv: string): string[][] {
  if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) reject(`CSV exceeds ${MAX_CSV_BYTES} bytes`);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ',') {
      if (cell.length > MAX_CELL_CHARS) reject(`cell exceeds ${MAX_CELL_CHARS} characters`);
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[index + 1] === '\n') index += 1;
      if (cell.length > MAX_CELL_CHARS) reject(`cell exceeds ${MAX_CELL_CHARS} characters`);
      row.push(cell);
      cell = '';
      if (row.some((candidate) => candidate.trim().length > 0)) rows.push(row);
      row = [];
      if (rows.length > MAX_CSV_ROWS + 1) reject(`CSV exceeds ${MAX_CSV_ROWS} data rows`);
    } else {
      cell += char;
    }
  }
  if (quoted) reject('unterminated quoted field');
  if (cell.length > MAX_CELL_CHARS) reject(`cell exceeds ${MAX_CELL_CHARS} characters`);
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((candidate) => candidate.trim().length > 0)) rows.push(row);
  }
  return rows;
}

function value(row: string[], index: Map<string, number>, name: string): string {
  const position = index.get(name);
  return position === undefined ? '' : (row[position] ?? '').trim();
}

function nullable(row: string[], index: Map<string, number>, name: string): string | null {
  return value(row, index, name) || null;
}

function parseMetricValue(raw: string): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) reject(`metric_value ${JSON.stringify(raw)} is not finite`);
  return parsed;
}

function parseProvenance(raw: string): Readonly<Record<string, string | number | boolean | null>> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return reject('provenance_json must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) reject('provenance_json must be an object');
  return parsed as Record<string, string | number | boolean | null>;
}

export function parseFounderContentMetricsCsv(csv: string): readonly FounderContentMetricObservation[] {
  const rows = parseRows(csv);
  if (rows.length < 2) reject('CSV must contain a header and at least one data row');
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  if (headers.length > MAX_COLUMNS) reject(`CSV exceeds ${MAX_COLUMNS} columns`);
  if (new Set(headers).size !== headers.length) reject('CSV headers must be unique');
  const indexes = new Map(headers.map((header, position) => [header, position]));
  for (const header of REQUIRED_HEADERS) {
    if (!indexes.has(header)) reject(`missing required header ${header}`);
  }

  const observations = rows.slice(1).map((row, rowIndex) => {
    if (row.length > headers.length) reject(`row ${rowIndex + 2} has more cells than the header`);
    const source = value(row, indexes, 'source') as FounderContentMetricSource;
    if (!['historical_csv', 'native_platform_export'].includes(source)) {
      reject(`row ${rowIndex + 2} source must be historical_csv or native_platform_export`);
    }
    return normalizeFounderContentMetricObservation({
      provider: value(row, indexes, 'provider'),
      platform: value(row, indexes, 'platform'),
      source,
      sourceMetricId: nullable(row, indexes, 'source_metric_id'),
      accountId: value(row, indexes, 'account_id'),
      pageId: value(row, indexes, 'page_id'),
      externalPostId: nullable(row, indexes, 'external_post_id'),
      audienceSegment: nullable(row, indexes, 'audience_segment'),
      metricName: value(row, indexes, 'metric_name'),
      metricUnit: value(row, indexes, 'metric_unit') as FounderContentMetricUnit,
      metricValue: parseMetricValue(value(row, indexes, 'metric_value')),
      observedAt: value(row, indexes, 'observed_at'),
      periodStart: nullable(row, indexes, 'period_start'),
      periodEnd: nullable(row, indexes, 'period_end'),
      importKind: 'historical_csv',
      provenance: parseProvenance(value(row, indexes, 'provenance_json')),
    });
  });
  return dedupeFounderContentMetrics(observations);
}
