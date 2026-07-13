export const CONTRACT_VERSION = '1.0' as const;
export const ALLOWED_REPOSITORY = 'jussray/l99-' as const;
export const ALLOWED_REF = 'refs/heads/main' as const;
export const OIDC_AUDIENCE = 'founder-control-room' as const;
export const ALLOWED_WORKFLOW = '.github/workflows/publish-control-room-status.yml' as const;

const ALLOWED_STATUSES = new Set([
  'planned',
  'integrated',
  'verified',
  'released',
  'blocked',
  'at-risk',
  'demo',
]);
const ALLOWED_RISKS = new Set(['low', 'medium', 'high', 'critical']);
const ALLOWED_GATE_STATUSES = new Set(['pass', 'fail', 'unknown']);
const SECRET_PATTERN = /(service[_-]?role[_-]?key|api[_-]?key|secret\s*[:=]|sk-[a-z0-9_-]{10,}|sb_secret_[a-z0-9_-]{10,}|authorization\s*:\s*bearer)/i;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const SAFE_REF_PATTERN = /^(?!.*\.\.)(?!https?:\/\/)[A-Za-z0-9_./-]{1,220}$/;

export interface GateResult {
  gate: string;
  passed: boolean;
}

export interface L99StatusEnvelope {
  schema_version: typeof CONTRACT_VERSION;
  repository: typeof ALLOWED_REPOSITORY;
  commit: string;
  observed_at: string;
  status: string;
  risk_level: string;
  gate_status: 'pass' | 'fail' | 'unknown';
  gate_results: GateResult[];
  proof_refs: string[];
  blockers: string[];
  next_gate: string;
  source_run_id: string;
  source_run_attempt: number;
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('payload_must_be_object');
  }
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field}_must_be_string`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) throw new Error(`${field}_invalid_length`);
  if (SECRET_PATTERN.test(cleaned)) throw new Error(`${field}_contains_sensitive_material`);
  return cleaned;
}

function boundedStringArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
  validator?: (item: string) => boolean,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${field}_invalid_array`);
  return value.map((item, index) => {
    const cleaned = boundedString(item, `${field}_${index}`, maxLength);
    if (validator && !validator(cleaned)) throw new Error(`${field}_${index}_invalid`);
    return cleaned;
  });
}

function parseObservedAt(value: unknown, now = Date.now()): string {
  const observedAt = boundedString(value, 'observed_at', 64);
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp)) throw new Error('observed_at_invalid');
  const futureSkewMs = timestamp - now;
  const ageMs = now - timestamp;
  if (futureSkewMs > 5 * 60 * 1000) throw new Error('observed_at_in_future');
  if (ageMs > 24 * 60 * 60 * 1000) throw new Error('observed_at_stale');
  return new Date(timestamp).toISOString();
}

function parseGateResults(value: unknown): GateResult[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error('gate_results_invalid_array');
  const seen = new Set<string>();
  return value.map((item, index) => {
    const row = requireObject(item);
    const gate = boundedString(row.gate, `gate_results_${index}_gate`, 80);
    if (!/^[a-z0-9_-]+$/i.test(gate)) throw new Error(`gate_results_${index}_gate_invalid`);
    if (seen.has(gate)) throw new Error('gate_results_duplicate_gate');
    seen.add(gate);
    if (typeof row.passed !== 'boolean') throw new Error(`gate_results_${index}_passed_invalid`);
    return { gate, passed: row.passed };
  });
}

export function validateStatusEnvelope(
  value: unknown,
  expectedCommit: string,
  now = Date.now(),
): L99StatusEnvelope {
  const row = requireObject(value);
  const serialized = JSON.stringify(row);
  if (serialized.length > 32_768) throw new Error('payload_too_large');
  if (SECRET_PATTERN.test(serialized)) throw new Error('payload_contains_sensitive_material');

  if (row.schema_version !== CONTRACT_VERSION) throw new Error('schema_version_invalid');
  if (row.repository !== ALLOWED_REPOSITORY) throw new Error('repository_invalid');

  const commit = boundedString(row.commit, 'commit', 40).toLowerCase();
  if (!COMMIT_PATTERN.test(commit)) throw new Error('commit_invalid');
  if (!COMMIT_PATTERN.test(expectedCommit) || commit !== expectedCommit.toLowerCase()) {
    throw new Error('commit_does_not_match_oidc_claim');
  }

  const status = boundedString(row.status, 'status', 32);
  if (!ALLOWED_STATUSES.has(status)) throw new Error('status_invalid');
  const riskLevel = boundedString(row.risk_level, 'risk_level', 16);
  if (!ALLOWED_RISKS.has(riskLevel)) throw new Error('risk_level_invalid');
  const gateStatus = boundedString(row.gate_status, 'gate_status', 16);
  if (!ALLOWED_GATE_STATUSES.has(gateStatus)) throw new Error('gate_status_invalid');

  const gateResults = parseGateResults(row.gate_results);
  const derivedGateStatus = gateResults.length === 0
    ? 'unknown'
    : gateResults.every((result) => result.passed) ? 'pass' : 'fail';
  if (gateStatus !== derivedGateStatus) throw new Error('gate_status_mismatch');

  return {
    schema_version: CONTRACT_VERSION,
    repository: ALLOWED_REPOSITORY,
    commit,
    observed_at: parseObservedAt(row.observed_at, now),
    status,
    risk_level: riskLevel,
    gate_status: gateStatus as L99StatusEnvelope['gate_status'],
    gate_results: gateResults,
    proof_refs: boundedStringArray(row.proof_refs, 'proof_refs', 20, 220, (item) => SAFE_REF_PATTERN.test(item)),
    blockers: boundedStringArray(row.blockers, 'blockers', 20, 360),
    next_gate: boundedString(row.next_gate, 'next_gate', 700),
    source_run_id: boundedString(row.source_run_id, 'source_run_id', 64),
    source_run_attempt: Number.isInteger(row.source_run_attempt) && Number(row.source_run_attempt) > 0
      ? Number(row.source_run_attempt)
      : (() => { throw new Error('source_run_attempt_invalid'); })(),
  };
}

export function eventSeverity(envelope: L99StatusEnvelope): 'info' | 'warning' | 'error' | 'critical' {
  if (envelope.risk_level === 'critical') return 'critical';
  if (envelope.gate_status === 'fail' || envelope.status === 'blocked') return 'error';
  if (envelope.risk_level === 'high' || envelope.status === 'at-risk') return 'warning';
  return 'info';
}

export function evidenceStatus(envelope: L99StatusEnvelope): 'pass' | 'fail' | 'warn' | 'pending' {
  if (envelope.gate_status === 'fail' || envelope.status === 'blocked') return 'fail';
  if (envelope.status === 'at-risk' || envelope.risk_level === 'high' || envelope.risk_level === 'critical') return 'warn';
  if (envelope.gate_status === 'pass' && ['integrated', 'verified', 'released'].includes(envelope.status)) return 'pass';
  return 'pending';
}
