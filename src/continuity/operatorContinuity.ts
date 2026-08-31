import { requestHash } from '../mcp/safety.js';

export const CONTINUITY_FINGERPRINT_CONTRACT = 'juss-continuity/fingerprint@v1' as const;
export const CONTINUITY_COOKIE_CONTRACT = 'juss-continuity/cookie@v1' as const;

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

export type ContinuityObservationV1 = {
  project: string;
  repository: string;
  targetBranch: string;
  /** Current authoritative target-branch SHA, usually the live main SHA. */
  targetSha: string;
  prNumber: number | null;
  baseSha: string | null;
  headSha: string | null;
  /** SHA-256 of the canonical changed-file/diff scope. */
  scopeFingerprint: string | null;
  /** SHA-256 of the exact-head machine-proof packet. */
  proofFingerprint: string | null;
  /** SHA-256 of the submitted-review + unresolved-thread state. */
  reviewFingerprint: string | null;
  /** SHA-256 of provider-native state relevant to the claim. */
  providerFingerprint: string | null;
  /** SHA-256 of runtime identity/readback relevant to the claim. */
  runtimeFingerprint: string | null;
  /** SHA-256 of the current founder/repository/provider authority state. */
  authorityFingerprint: string | null;
  observedAt: string;
};

export type ContinuityFingerprintV1 = {
  contract: typeof CONTINUITY_FINGERPRINT_CONTRACT;
  digest: string;
  observation: ContinuityObservationV1;
};

export type ContinuityCookieV1 = {
  contract: typeof CONTINUITY_COOKIE_CONTRACT;
  cookieId: string;
  fingerprint: ContinuityFingerprintV1;
  mintedAt: string;
  expiresAt: string;
  issuer: string;
  issuerIdentityState: 'verified' | 'unverified';
  /** Continuity is evidence only. It can never grant mutation authority. */
  authority: false;
};

export type ContinuityInvalidationReason =
  | 'cookie_contract_invalid'
  | 'cookie_id_malformed'
  | 'cookie_integrity_mismatch'
  | 'cookie_authority_invalid'
  | 'cookie_issuer_unverified'
  | 'cookie_time_invalid'
  | 'cookie_expired'
  | 'fingerprint_contract_invalid'
  | 'fingerprint_digest_malformed'
  | 'fingerprint_integrity_mismatch'
  | 'current_fingerprint_invalid'
  | 'project_moved'
  | 'repository_moved'
  | 'target_branch_moved'
  | 'target_sha_moved'
  | 'pr_moved'
  | 'base_sha_moved'
  | 'head_sha_moved'
  | 'scope_moved'
  | 'proof_moved'
  | 'review_moved'
  | 'provider_moved'
  | 'runtime_moved'
  | 'authority_moved';

export type ContinuityEvaluationV1 = {
  state: 'current' | 'stale' | 'invalid';
  currentFingerprintDigest: string | null;
  cookieFingerprintDigest: string | null;
  reasons: ContinuityInvalidationReason[];
  reacquireRequired: boolean;
  continuityMayAuthorizeAction: false;
};

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function repository(value: string): string {
  const normalized = requiredText(value, 'repository').toLowerCase();
  if (!normalized.includes('/')) throw new Error('repository must be owner/name');
  return normalized;
}

function sha(value: string | null, field: string, required = false): string | null {
  if (value === null) {
    if (required) throw new Error(`${field} is required`);
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!FULL_SHA.test(normalized)) throw new Error(`${field} must be a full 40-hex SHA`);
  return normalized;
}

function fingerprint(value: string | null, field: string): string | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (!SHA256.test(normalized)) throw new Error(`${field} must be a 64-hex SHA-256`);
  return normalized;
}

function timestamp(value: string, field: string): string {
  const normalized = requiredText(value, field);
  if (Number.isNaN(Date.parse(normalized))) throw new Error(`${field} must be an ISO-compatible timestamp`);
  return normalized;
}

function prNumber(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value <= 0) throw new Error('prNumber must be a positive integer or null');
  return value;
}

function normalizeObservation(input: ContinuityObservationV1): ContinuityObservationV1 {
  return {
    project: requiredText(input.project, 'project'),
    repository: repository(input.repository),
    targetBranch: requiredText(input.targetBranch, 'targetBranch'),
    targetSha: sha(input.targetSha, 'targetSha', true)!,
    prNumber: prNumber(input.prNumber),
    baseSha: sha(input.baseSha, 'baseSha'),
    headSha: sha(input.headSha, 'headSha'),
    scopeFingerprint: fingerprint(input.scopeFingerprint, 'scopeFingerprint'),
    proofFingerprint: fingerprint(input.proofFingerprint, 'proofFingerprint'),
    reviewFingerprint: fingerprint(input.reviewFingerprint, 'reviewFingerprint'),
    providerFingerprint: fingerprint(input.providerFingerprint, 'providerFingerprint'),
    runtimeFingerprint: fingerprint(input.runtimeFingerprint, 'runtimeFingerprint'),
    authorityFingerprint: fingerprint(input.authorityFingerprint, 'authorityFingerprint'),
    observedAt: timestamp(input.observedAt, 'observedAt'),
  };
}

export function createContinuityFingerprint(
  input: ContinuityObservationV1,
): ContinuityFingerprintV1 {
  const observation = normalizeObservation(input);
  return {
    contract: CONTINUITY_FINGERPRINT_CONTRACT,
    digest: requestHash({ contract: CONTINUITY_FINGERPRINT_CONTRACT, observation }),
    observation,
  };
}

function fingerprintIntegrityValid(value: ContinuityFingerprintV1): boolean {
  if (value.contract !== CONTINUITY_FINGERPRINT_CONTRACT || !SHA256.test(value.digest)) return false;
  try {
    return createContinuityFingerprint(value.observation).digest === value.digest.toLowerCase();
  } catch {
    return false;
  }
}

function expectedCookieId(value: Omit<ContinuityCookieV1, 'cookieId'>): string {
  return requestHash({
    contract: value.contract,
    fingerprintDigest: value.fingerprint.digest,
    mintedAt: value.mintedAt,
    expiresAt: value.expiresAt,
    issuer: value.issuer,
    issuerIdentityState: value.issuerIdentityState,
    authority: value.authority,
  });
}

export function mintContinuityCookie(input: {
  fingerprint: ContinuityFingerprintV1;
  mintedAt: string;
  expiresAt: string;
  issuer: string;
  issuerIdentityState: 'verified' | 'unverified';
}): ContinuityCookieV1 {
  if (!fingerprintIntegrityValid(input.fingerprint)) throw new Error('fingerprint integrity is invalid');
  const mintedAt = timestamp(input.mintedAt, 'mintedAt');
  const expiresAt = timestamp(input.expiresAt, 'expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(mintedAt)) throw new Error('expiresAt must be after mintedAt');
  const withoutId: Omit<ContinuityCookieV1, 'cookieId'> = {
    contract: CONTINUITY_COOKIE_CONTRACT,
    fingerprint: input.fingerprint,
    mintedAt,
    expiresAt,
    issuer: requiredText(input.issuer, 'issuer'),
    issuerIdentityState: input.issuerIdentityState,
    authority: false,
  };
  return { ...withoutId, cookieId: expectedCookieId(withoutId) };
}

function same(a: string | number | null, b: string | number | null): boolean {
  return a === b;
}

export function evaluateContinuityCookie(
  cookie: ContinuityCookieV1,
  current: ContinuityFingerprintV1,
  now: string,
): ContinuityEvaluationV1 {
  const reasons: ContinuityInvalidationReason[] = [];
  const push = (reason: ContinuityInvalidationReason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (cookie.contract !== CONTINUITY_COOKIE_CONTRACT) push('cookie_contract_invalid');
  if (!SHA256.test(cookie.cookieId)) push('cookie_id_malformed');
  if (cookie.authority !== false) push('cookie_authority_invalid');
  if (cookie.issuerIdentityState !== 'verified') push('cookie_issuer_unverified');

  if (cookie.fingerprint.contract !== CONTINUITY_FINGERPRINT_CONTRACT) push('fingerprint_contract_invalid');
  if (!SHA256.test(cookie.fingerprint.digest)) push('fingerprint_digest_malformed');
  if (!fingerprintIntegrityValid(cookie.fingerprint)) push('fingerprint_integrity_mismatch');
  if (!fingerprintIntegrityValid(current)) push('current_fingerprint_invalid');

  try {
    const { cookieId: _cookieId, ...withoutId } = cookie;
    if (expectedCookieId(withoutId) !== cookie.cookieId.toLowerCase()) push('cookie_integrity_mismatch');
  } catch {
    push('cookie_integrity_mismatch');
  }

  const nowMs = Date.parse(now);
  const mintedAtMs = Date.parse(cookie.mintedAt);
  const expiresAtMs = Date.parse(cookie.expiresAt);
  if (
    Number.isNaN(nowMs)
    || Number.isNaN(mintedAtMs)
    || Number.isNaN(expiresAtMs)
    || expiresAtMs <= mintedAtMs
    || mintedAtMs > nowMs
  ) {
    push('cookie_time_invalid');
  } else if (nowMs > expiresAtMs) {
    push('cookie_expired');
  }

  if (fingerprintIntegrityValid(cookie.fingerprint) && fingerprintIntegrityValid(current)) {
    const prior = cookie.fingerprint.observation;
    const next = current.observation;
    if (!same(prior.project, next.project)) push('project_moved');
    if (!same(prior.repository, next.repository)) push('repository_moved');
    if (!same(prior.targetBranch, next.targetBranch)) push('target_branch_moved');
    if (!same(prior.targetSha, next.targetSha)) push('target_sha_moved');
    if (!same(prior.prNumber, next.prNumber)) push('pr_moved');
    if (!same(prior.baseSha, next.baseSha)) push('base_sha_moved');
    if (!same(prior.headSha, next.headSha)) push('head_sha_moved');
    if (!same(prior.scopeFingerprint, next.scopeFingerprint)) push('scope_moved');
    if (!same(prior.proofFingerprint, next.proofFingerprint)) push('proof_moved');
    if (!same(prior.reviewFingerprint, next.reviewFingerprint)) push('review_moved');
    if (!same(prior.providerFingerprint, next.providerFingerprint)) push('provider_moved');
    if (!same(prior.runtimeFingerprint, next.runtimeFingerprint)) push('runtime_moved');
    if (!same(prior.authorityFingerprint, next.authorityFingerprint)) push('authority_moved');
  }

  const invalidReasons = new Set<ContinuityInvalidationReason>([
    'cookie_contract_invalid',
    'cookie_id_malformed',
    'cookie_integrity_mismatch',
    'cookie_authority_invalid',
    'cookie_issuer_unverified',
    'cookie_time_invalid',
    'fingerprint_contract_invalid',
    'fingerprint_digest_malformed',
    'fingerprint_integrity_mismatch',
    'current_fingerprint_invalid',
  ]);
  const state = reasons.some((reason) => invalidReasons.has(reason))
    ? 'invalid'
    : reasons.length > 0
      ? 'stale'
      : 'current';

  return {
    state,
    currentFingerprintDigest: fingerprintIntegrityValid(current) ? current.digest.toLowerCase() : null,
    cookieFingerprintDigest: fingerprintIntegrityValid(cookie.fingerprint)
      ? cookie.fingerprint.digest.toLowerCase()
      : null,
    reasons: [...reasons].sort((a, b) => a.localeCompare(b)),
    reacquireRequired: state !== 'current',
    continuityMayAuthorizeAction: false,
  };
}
