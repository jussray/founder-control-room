import { createHash } from 'node:crypto';

export const CONTENT_METRICS_CSV_CONTRACT = 'content-metrics-csv@v1' as const;

const MAX_CSV_BYTES = 1024 * 1024;
const MAX_DATA_ROWS = 10_000;
const MAX_FIELD_LENGTH = 2_000;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export const CONTENT_METRIC_NAMES = [
  'impressions',
  'reactions',
  'comments',
  'profile_views',
  'attributed_visits',
  'qualified_conversations',
  'attributed_contacts',
  'attributed_deals',
] as const;

export type ContentMetricName = (typeof CONTENT_METRIC_NAMES)[number];
export type ContentMetricCsvEvidenceState = 'OBSERVED' | 'UNKNOWN_NO_EVIDENCE';

const REQUIRED_HEADERS = [
  'observation_id',
  'content_fingerprint',
  'provider',
  'account_id',
  'page_id',
  'audience_segment',
  'metric_name',
  'metric_value',
  'unit',
  'window_start',
  'window_end',
  'observed_at',
  'source',
  'source_ref',
] as const;

type RequiredHeader = (typeof REQUIRED_HEADERS)[number];

export interface ContentMetricCsvProvenance {
  source: string;
  sourceRef: string;
  rowFingerprint: string;
}

export interface ContentMetricCsvObservation {
  observationId: string;
  contentFingerprint: string;
  provider: string;
  accountId: string;
  pageId: string;
  audienceSegment: string;
  metricName: ContentMetricName;
  metricValue: number | null;
  unit: 'count';
  windowStart: string;
  windowEnd: string;
  observedAt: string;
  evidenceState: ContentMetricCsvEvidenceState;
  provenance: ContentMetricCsvProvenance;
}

export interface ContentMetricCsvReceipt {
  contract: typeof CONTENT_METRICS_CSV_CONTRACT;
  authority: 'observation_only';
  freshnessAuthority: false;
  publicationAuthority: false;
  strategyMutationAuthority: false;
  importFingerprint: string;
  inputRowCount: number;
  normalizedRowCount: number;
  duplicateRowsCollapsed: number;
  observations: readonly ContentMetricCsvObservation[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
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

    if (char === '"' && field.length === 0) {
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

  if (quoted) throw new Error('content metrics CSV contains an unterminated quoted field');
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value.trim() !== ''));
}

function requiredString(value: string | undefined, field: string, rowNumber: number): string {
  const normalized = value?.trim() ?? '';
  if (!normalized) throw new Error(`content metrics CSV row ${rowNumber}: ${field} is required`);
  if (normalized.length > MAX_FIELD_LENGTH || /[\u0000\r\n]/.test(normalized)) {
    throw new Error(`content metrics CSV row ${rowNumber}: ${field} is invalid`);
  }
  return normalized;
}

function timestamp(value: string | undefined, field: string, rowNumber: number): string {
  const normalized = requiredString(value, field, rowNumber);
  if (!ISO_TIMESTAMP.test(normalized) || !Number.isFinite(Date.parse(normalized))) {
    throw new Error(`content metrics CSV row ${rowNumber}: ${field} must be an offset-aware ISO timestamp`);
  }
  return normalized;
}

function metricValue(value: string | undefined, rowNumber: number): number | null {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;
  if (!/^(?:0|[1-9]\d*)$/.test(normalized)) {
    throw new Error(`content metrics CSV row ${rowNumber}: metric_value must be a non-negative integer or blank`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`content metrics CSV row ${rowNumber}: metric_value exceeds safe integer range`);
  }
  return parsed;
}

function normalizeHeader(row: string[]): RequiredHeader[] {
  const headers = row.map((value) => value.trim());
  if (headers.length !== REQUIRED_HEADERS.length || headers.some((value, index) => value !== REQUIRED_HEADERS[index])) {
    throw new Error(`content metrics CSV headers must exactly equal: ${REQUIRED_HEADERS.join(',')}`);
  }
  return headers as RequiredHeader[];
}

function canonicalRowWithoutFingerprint(row: Omit<ContentMetricCsvObservation, 'provenance'> & { source: string; sourceRef: string }): string {
  return JSON.stringify({
    observationId: row.observationId,
    contentFingerprint: row.contentFingerprint,
    provider: row.provider,
    accountId: row.accountId,
    pageId: row.pageId,
    audienceSegment: row.audienceSegment,
    metricName: row.metricName,
    metricValue: row.metricValue,
    unit: row.unit,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    observedAt: row.observedAt,
    source: row.source,
    sourceRef: row.sourceRef,
  });
}

function duplicateIdentity(row: ContentMetricCsvObservation): string {
  return [
    row.observationId,
    row.accountId,
    row.pageId,
    row.audienceSegment,
    row.metricName,
  ].join('|');
}

function canonicalNormalizedRow(row: ContentMetricCsvObservation): string {
  return JSON.stringify(row);
}

export function parseContentMetricsCsv(csv: string): ContentMetricCsvReceipt {
  if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) {
    throw new Error(`content metrics CSV exceeds ${MAX_CSV_BYTES} bytes`);
  }

  const rows = parseCsvRows(csv);
  if (rows.length === 0) throw new Error('content metrics CSV is empty');
  const headers = normalizeHeader(rows[0]);
  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_DATA_ROWS) {
    throw new Error(`content metrics CSV exceeds ${MAX_DATA_ROWS} data rows`);
  }

  const accepted = new Map<string, ContentMetricCsvObservation>();
  let duplicates = 0;

  dataRows.forEach((values, dataIndex) => {
    const rowNumber = dataIndex + 2;
    if (values.length !== headers.length) {
      throw new Error(`content metrics CSV row ${rowNumber}: expected ${headers.length} fields, received ${values.length}`);
    }
    const raw = Object.fromEntries(headers.map((header, index) => [header, values[index]])) as Record<RequiredHeader, string>;

    const windowStart = timestamp(raw.window_start, 'window_start', rowNumber);
    const windowEnd = timestamp(raw.window_end, 'window_end', rowNumber);
    const observedAt = timestamp(raw.observed_at, 'observed_at', rowNumber);
    if (Date.parse(windowStart) > Date.parse(windowEnd)) {
      throw new Error(`content metrics CSV row ${rowNumber}: window_start must not follow window_end`);
    }
    if (Date.parse(observedAt) < Date.parse(windowEnd)) {
      throw new Error(`content metrics CSV row ${rowNumber}: observed_at must not predate window_end`);
    }

    const metricName = requiredString(raw.metric_name, 'metric_name', rowNumber);
    if (!CONTENT_METRIC_NAMES.includes(metricName as ContentMetricName)) {
      throw new Error(`content metrics CSV row ${rowNumber}: unsupported metric_name ${metricName}`);
    }
    const unit = requiredString(raw.unit, 'unit', rowNumber);
    if (unit !== 'count') {
      throw new Error(`content metrics CSV row ${rowNumber}: unit must be count`);
    }
    const value = metricValue(raw.metric_value, rowNumber);
    const source = requiredString(raw.source, 'source', rowNumber);
    const sourceRef = requiredString(raw.source_ref, 'source_ref', rowNumber);

    const canonical = {
      observationId: requiredString(raw.observation_id, 'observation_id', rowNumber),
      contentFingerprint: requiredString(raw.content_fingerprint, 'content_fingerprint', rowNumber),
      provider: requiredString(raw.provider, 'provider', rowNumber),
      accountId: requiredString(raw.account_id, 'account_id', rowNumber),
      pageId: requiredString(raw.page_id, 'page_id', rowNumber),
      audienceSegment: requiredString(raw.audience_segment, 'audience_segment', rowNumber),
      metricName: metricName as ContentMetricName,
      metricValue: value,
      unit: 'count' as const,
      windowStart,
      windowEnd,
      observedAt,
      evidenceState: value === null ? 'UNKNOWN_NO_EVIDENCE' as const : 'OBSERVED' as const,
      source,
      sourceRef,
    };
    const rowFingerprint = sha256(canonicalRowWithoutFingerprint(canonical));
    const normalized: ContentMetricCsvObservation = {
      observationId: canonical.observationId,
      contentFingerprint: canonical.contentFingerprint,
      provider: canonical.provider,
      accountId: canonical.accountId,
      pageId: canonical.pageId,
      audienceSegment: canonical.audienceSegment,
      metricName: canonical.metricName,
      metricValue: canonical.metricValue,
      unit: canonical.unit,
      windowStart: canonical.windowStart,
      windowEnd: canonical.windowEnd,
      observedAt: canonical.observedAt,
      evidenceState: canonical.evidenceState,
      provenance: { source, sourceRef, rowFingerprint },
    };

    const identity = duplicateIdentity(normalized);
    const previous = accepted.get(identity);
    if (!previous) {
      accepted.set(identity, normalized);
      return;
    }
    if (canonicalNormalizedRow(previous) !== canonicalNormalizedRow(normalized)) {
      throw new Error(`content metrics CSV row ${rowNumber}: conflicting duplicate metric identity ${identity}`);
    }
    duplicates += 1;
  });

  const observations = [...accepted.values()].sort((left, right) =>
    duplicateIdentity(left).localeCompare(duplicateIdentity(right))
  );
  const importFingerprint = sha256(observations.map(canonicalNormalizedRow).join('\n'));

  return {
    contract: CONTENT_METRICS_CSV_CONTRACT,
    authority: 'observation_only',
    freshnessAuthority: false,
    publicationAuthority: false,
    strategyMutationAuthority: false,
    importFingerprint,
    inputRowCount: dataRows.length,
    normalizedRowCount: observations.length,
    duplicateRowsCollapsed: duplicates,
    observations,
  };
}
