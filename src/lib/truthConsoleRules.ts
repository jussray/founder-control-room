export type TruthClassification =
  | 'verified'
  | 'inferred'
  | 'unknown'
  | 'blocked'
  | 'conflicted'
  | 'stale';

export type TruthContinuityState = 'current' | 'stale' | 'expired';

export type TruthEvidenceRuleInput = {
  id?: unknown;
  relation?: unknown;
  status?: unknown;
};

export type TruthEvidenceIdentity = Array<{
  id: unknown;
  status: unknown;
  relation: unknown;
}>;

export function classifyTruthEvidence(rows: readonly TruthEvidenceRuleInput[]): TruthClassification {
  if (rows.length === 0) return 'unknown';
  if (rows.some((row) => row.relation === 'contradicts' || row.status === 'fail')) return 'conflicted';

  const supporting = rows.filter((row) => row.relation === 'supports');
  if (supporting.length > 0 && supporting.every((row) => row.status === 'pass')) return 'verified';
  if (rows.some((row) => row.status === 'pending')) return 'unknown';
  return 'inferred';
}

export function truthContinuityState(
  row: { invalidated_at?: unknown; valid_until?: unknown },
  now = Date.now(),
): TruthContinuityState {
  if (row.invalidated_at) return 'stale';
  if (typeof row.valid_until === 'string') {
    const expiresAt = Date.parse(row.valid_until);
    if (Number.isFinite(expiresAt) && expiresAt <= now) return 'expired';
  }
  return 'current';
}

export function truthEvidenceIdentity(rows: readonly TruthEvidenceRuleInput[]): TruthEvidenceIdentity {
  return rows
    .map((row) => ({ id: row.id, status: row.status, relation: row.relation }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
