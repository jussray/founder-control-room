export type FreshnessStatus =
  | 'VALID'
  | 'STALE'
  | 'BLOCKED'
  | 'NOT_EVALUATED';

export type FreshnessReason =
  | 'missing_evidence'
  | 'unverified_evidence'
  | 'missing_verified_at'
  | 'missing_expiry'
  | 'missing_id'
  | 'missing_subject'
  | 'missing_repository'
  | 'missing_expected_sha'
  | 'missing_current_sha'
  | 'invalid_expected_sha'
  | 'invalid_current_sha'
  | 'invalid_verified_at'
  | 'verification_from_future'
  | 'invalid_expiry'
  | 'expired'
  | 'sha_drift';

export interface FreshnessEvidenceRef {
  id: string;
  verified: boolean;
}

export interface FreshnessWitness {
  id: string;
  subject: string;
  repository?: string;
  expectedMainSha?: string;
  evidenceRefs: readonly FreshnessEvidenceRef[];
  verifiedAt?: string;
  expiresAt?: string;
}

export interface FreshnessObservation {
  currentMainSha?: string;
  observedAt: string | Date;
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

function normalizedSha(value: string | undefined): string | undefined {
  const sha = normalized(value)?.toLowerCase();
  return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : undefined;
}

function strictIsoTime(value: string | undefined): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return undefined;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    return undefined;
  }
  return parsed;
}

function observationTime(value: string | Date): number | undefined {
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return strictIsoTime(value);
}

/**
 * Classify whether a bounded evidence witness is current against a fresh,
 * separately supplied observation of repository main.
 *
 * Freshness is evidence state, never execution authority. A VALID result does
 * not grant merge, deploy, publish, provider, or other consequential authority.
 */
export function evaluateFreshnessWitness(
  witness: FreshnessWitness,
  observation: FreshnessObservation,
): FreshnessEvaluation {
  const id = normalized(witness.id);
  const subject = normalized(witness.subject);
  const repository = normalized(witness.repository);
  const expectedRaw = normalized(witness.expectedMainSha);
  const currentRaw = normalized(observation.currentMainSha);
  const expectedMainSha = normalizedSha(expectedRaw);
  const currentMainSha = normalizedSha(currentRaw);
  const verifiedAt = normalized(witness.verifiedAt);
  const expiresAt = normalized(witness.expiresAt);
  const evidenceRefs = witness.evidenceRefs.filter((ref) => normalized(ref.id));

  if (evidenceRefs.length === 0) {
    return { status: 'NOT_EVALUATED', current: false, reasons: ['missing_evidence'] };
  }
  if (evidenceRefs.some((ref) => !ref.verified)) {
    return { status: 'NOT_EVALUATED', current: false, reasons: ['unverified_evidence'] };
  }
  if (!verifiedAt) {
    return { status: 'NOT_EVALUATED', current: false, reasons: ['missing_verified_at'] };
  }
  if (!expiresAt) {
    return { status: 'NOT_EVALUATED', current: false, reasons: ['missing_expiry'] };
  }

  const blocked: FreshnessReason[] = [];
  if (!id) blocked.push('missing_id');
  if (!subject) blocked.push('missing_subject');
  if (!repository) blocked.push('missing_repository');
  if (!expectedRaw) blocked.push('missing_expected_sha');
  else if (!expectedMainSha) blocked.push('invalid_expected_sha');
  if (!currentRaw) blocked.push('missing_current_sha');
  else if (!currentMainSha) blocked.push('invalid_current_sha');
  if (blocked.length > 0) {
    return { status: 'BLOCKED', current: false, reasons: blocked };
  }

  const verifiedTime = strictIsoTime(verifiedAt);
  const observedNow = observationTime(observation.observedAt);
  if (verifiedTime === undefined) {
    return { status: 'NOT_EVALUATED', current: false, reasons: ['invalid_verified_at'] };
  }
  if (observedNow === undefined || verifiedTime > observedNow) {
    return { status: 'NOT_EVALUATED', current: false, reasons: ['verification_from_future'] };
  }

  const expiry = strictIsoTime(expiresAt);
  if (expiry === undefined || expiry <= verifiedTime) {
    return { status: 'NOT_EVALUATED', current: false, reasons: ['invalid_expiry'] };
  }

  if (expectedMainSha !== currentMainSha) {
    return { status: 'BLOCKED', current: false, reasons: ['sha_drift'] };
  }
  if (expiry <= observedNow) {
    return { status: 'STALE', current: false, reasons: ['expired'] };
  }

  return { status: 'VALID', current: true, reasons: [] };
}
