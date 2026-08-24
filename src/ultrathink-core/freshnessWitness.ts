export type FreshnessStatus =
  | 'VALID'
  | 'STALE'
  | 'BLOCKED'
  | 'NOT_EVALUATED';

export type FreshnessReason =
  | 'missing_evidence'
  | 'missing_verified_at'
  | 'missing_id'
  | 'missing_subject'
  | 'missing_repository'
  | 'missing_expected_sha'
  | 'missing_observed_sha'
  | 'invalid_verified_at'
  | 'verification_from_future'
  | 'invalid_expiry'
  | 'expired'
  | 'sha_drift';

export interface FreshnessWitness {
  id: string;
  subject: string;
  repository?: string;
  expectedMainSha?: string;
  observedMainSha?: string;
  evidenceRefs: readonly string[];
  verifiedAt?: string;
  expiresAt?: string;
}

export interface FreshnessEvaluation {
  status: FreshnessStatus;
  current: boolean;
  reasons: readonly FreshnessReason[];
}

function normalized(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsedTime(value: string | Date | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return Date.parse(value);
  return Date.now();
}

/**
 * Evaluate whether evidence is still current for an exact repository identity.
 *
 * Freshness is deliberately not authority. This witness only classifies whether
 * supplied evidence is usable right now; callers still need an authority lease
 * before performing a consequential action.
 */
export function evaluateFreshnessWitness(
  witness: FreshnessWitness,
  now?: string | Date,
): FreshnessEvaluation {
  const id = normalized(witness.id);
  const subject = normalized(witness.subject);
  const repository = normalized(witness.repository);
  const expectedMainSha = normalized(witness.expectedMainSha);
  const observedMainSha = normalized(witness.observedMainSha);
  const verifiedAt = normalized(witness.verifiedAt);
  const evidenceRefs = witness.evidenceRefs
    .map((evidenceRef) => normalized(evidenceRef))
    .filter((evidenceRef): evidenceRef is string => Boolean(evidenceRef));

  if (evidenceRefs.length === 0) {
    return {
      status: 'NOT_EVALUATED',
      current: false,
      reasons: ['missing_evidence'],
    };
  }

  if (!verifiedAt) {
    return {
      status: 'NOT_EVALUATED',
      current: false,
      reasons: ['missing_verified_at'],
    };
  }

  const blocked: FreshnessReason[] = [];
  if (!id) blocked.push('missing_id');
  if (!subject) blocked.push('missing_subject');
  if (!repository) blocked.push('missing_repository');
  if (!expectedMainSha) blocked.push('missing_expected_sha');
  if (!observedMainSha) blocked.push('missing_observed_sha');
  if (blocked.length > 0) {
    return { status: 'BLOCKED', current: false, reasons: blocked };
  }

  const verifiedTime = Date.parse(verifiedAt);
  const observedNow = parsedTime(now);
  if (!Number.isFinite(verifiedTime)) {
    return {
      status: 'NOT_EVALUATED',
      current: false,
      reasons: ['invalid_verified_at'],
    };
  }

  if (!Number.isFinite(observedNow) || verifiedTime > observedNow) {
    return {
      status: 'NOT_EVALUATED',
      current: false,
      reasons: ['verification_from_future'],
    };
  }

  const stale: FreshnessReason[] = [];
  if (expectedMainSha !== observedMainSha) stale.push('sha_drift');

  if (witness.expiresAt) {
    const expiry = Date.parse(witness.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= verifiedTime) {
      return {
        status: 'NOT_EVALUATED',
        current: false,
        reasons: ['invalid_expiry'],
      };
    }
    if (expiry <= observedNow) stale.push('expired');
  }

  if (stale.length > 0) {
    return { status: 'STALE', current: false, reasons: stale };
  }

  return { status: 'VALID', current: true, reasons: [] };
}
