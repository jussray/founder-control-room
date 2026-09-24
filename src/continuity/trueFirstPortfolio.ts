import type { PortfolioProject } from '../config/portfolio.js';
import { fingerprintNormalized, type ProofCookieContract } from '../security/attack20V3.js';

export const TRUE_FIRST_PORTFOLIO_CONTRACT = 'true-first-portfolio-v1' as const;

export type TruthEvidenceState = 'VERIFIED' | 'INFERRED' | 'UNKNOWN' | 'BLOCKED' | 'STALE';
export type TruthValue = 'TRUE' | 'FALSE' | 'UNKNOWN';

export interface EvidenceBoundTruthClaim {
  claimId: string;
  statement: string;
  value: TruthValue;
  state: TruthEvidenceState;
  evidenceRefs: readonly string[];
}

export interface TrueFirstBaselineInput {
  project: PortfolioProject;
  branch: string;
  headSha: string;
  scope: string;
  claims: readonly EvidenceBoundTruthClaim[];
  observedAt: string;
  freshnessWindowMs: number;
  predecessorCookieId?: string | null;
}

export interface TrueFirstBaseline {
  contract: typeof TRUE_FIRST_PORTFOLIO_CONTRACT;
  status: 'ESTABLISHED' | 'UNESTABLISHED';
  project: {
    slug: string;
    repository: string;
    portfolioStatus: PortfolioProject['status'];
  };
  subject: {
    branch: string;
    headSha: string;
    scope: string;
  };
  verifiedTrueClaims: readonly EvidenceBoundTruthClaim[];
  rejectedClaims: readonly EvidenceBoundTruthClaim[];
  baselineFingerprint: string;
  proofCookie: ProofCookieContract;
  authority: 'EVIDENCE_ONLY';
  browserCookieStored: false;
  observedAt: string;
  invalidatesOn: readonly string[];
}

export interface TruthChallengeInput {
  repository: string;
  branch: string;
  headSha: string;
  scope: string;
  claimId: string;
  statement: string;
  value: TruthValue;
  state: TruthEvidenceState;
  evidenceRefs: readonly string[];
  observedAt: string;
}

export interface TruthChallengeEvaluation {
  contract: 'true-first-challenge-v1';
  verdict:
    | 'RECONFIRMED_TRUE'
    | 'VERIFIED_CONTRADICTION'
    | 'UNRESOLVED'
    | 'BASELINE_STALE'
    | 'SUBJECT_MISMATCH'
    | 'CLAIM_NOT_IN_BASELINE';
  baselineFingerprint: string;
  challengeFingerprint: string;
  claimId: string;
  reason: string;
  authority: 'EVIDENCE_ONLY';
}

function requireIsoTimestamp(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} must be an ISO timestamp`);
}

function requireHeadSha(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40,64}$/.test(normalized)) {
    throw new Error('headSha must be a 40-64 character hexadecimal commit identity');
  }
  return normalized;
}

function normalizeRefs(refs: readonly string[]): string[] {
  return [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))].sort();
}

function normalizeClaim(claim: EvidenceBoundTruthClaim): EvidenceBoundTruthClaim {
  return {
    claimId: claim.claimId.trim(),
    statement: claim.statement.trim(),
    value: claim.value,
    state: claim.state,
    evidenceRefs: normalizeRefs(claim.evidenceRefs),
  };
}

function sortClaims(claims: readonly EvidenceBoundTruthClaim[]): EvidenceBoundTruthClaim[] {
  return claims
    .map(normalizeClaim)
    .sort((left, right) => `${left.claimId}:${left.statement}:${left.state}:${left.value}`.localeCompare(
      `${right.claimId}:${right.statement}:${right.state}:${right.value}`,
    ));
}

function isVerifiedTrueClaim(claim: EvidenceBoundTruthClaim): boolean {
  return claim.state === 'VERIFIED' && claim.value === 'TRUE' && claim.evidenceRefs.length > 0;
}

/**
 * Build the strongest currently provable TRUE baseline before searching for falsehood.
 *
 * Only VERIFIED + TRUE claims with at least one evidence reference enter the baseline.
 * Everything else remains visible in rejectedClaims so uncertainty is preserved rather
 * than silently upgraded into truth. The resulting fingerprint and proof cookie are
 * continuity markers only and never grant mutation or publication authority.
 */
export function buildTrueFirstBaseline(input: TrueFirstBaselineInput): TrueFirstBaseline {
  requireIsoTimestamp(input.observedAt, 'observedAt');
  if (!Number.isFinite(input.freshnessWindowMs) || input.freshnessWindowMs <= 0) {
    throw new Error('freshnessWindowMs must be a positive finite number');
  }
  if (!input.branch.trim()) throw new Error('branch is required');
  if (!input.scope.trim()) throw new Error('scope is required');
  if (!input.project.repository.trim()) throw new Error('project repository is required');

  const headSha = requireHeadSha(input.headSha);
  const claims = sortClaims(input.claims);
  const verifiedTrueClaims = claims.filter(isVerifiedTrueClaim);
  const rejectedClaims = claims.filter((claim) => !isVerifiedTrueClaim(claim));

  const baselineFingerprint = fingerprintNormalized({
    contract: TRUE_FIRST_PORTFOLIO_CONTRACT,
    project: {
      slug: input.project.slug,
      repository: input.project.repository,
      portfolioStatus: input.project.status,
    },
    subject: {
      branch: input.branch.trim(),
      headSha,
      scope: input.scope.trim(),
    },
    verifiedTrueClaims,
  });

  const expiresAt = new Date(Date.parse(input.observedAt) + input.freshnessWindowMs).toISOString();
  const proofCookie: ProofCookieContract = {
    cookieId: `true-first-${fingerprintNormalized({
      baselineFingerprint,
      observedAt: input.observedAt,
      predecessorCookieId: input.predecessorCookieId ?? null,
    }).slice(0, 32)}`,
    contextType: 'verification-run',
    owner: 'fcr-true-first-portfolio',
    createdAt: input.observedAt,
    expiresAt,
    parentCookieId: input.predecessorCookieId ?? null,
  };

  return {
    contract: TRUE_FIRST_PORTFOLIO_CONTRACT,
    status: verifiedTrueClaims.length > 0 ? 'ESTABLISHED' : 'UNESTABLISHED',
    project: {
      slug: input.project.slug,
      repository: input.project.repository,
      portfolioStatus: input.project.status,
    },
    subject: {
      branch: input.branch.trim(),
      headSha,
      scope: input.scope.trim(),
    },
    verifiedTrueClaims,
    rejectedClaims,
    baselineFingerprint,
    proofCookie,
    authority: 'EVIDENCE_ONLY',
    browserCookieStored: false,
    observedAt: input.observedAt,
    invalidatesOn: [
      'repository identity changes',
      'branch changes',
      'authoritative head moves',
      'scope changes',
      'verified evidence changes',
      'proof cookie expires or is revoked',
    ],
  };
}

/**
 * Test a candidate FALSE/TRUE observation only against the exact TRUE baseline subject.
 * A moved head is not called false. It makes the prior baseline stale and forces a fresh
 * baseline first, preventing historical truth from being misreported as current truth.
 */
export function evaluateTruthChallenge(
  baseline: TrueFirstBaseline,
  challenge: TruthChallengeInput,
  evaluatedAt = new Date(),
): TruthChallengeEvaluation {
  requireIsoTimestamp(challenge.observedAt, 'challenge.observedAt');
  const challengeHeadSha = requireHeadSha(challenge.headSha);
  const challengeObservedMs = Date.parse(challenge.observedAt);
  const baselineObservedMs = Date.parse(baseline.observedAt);
  const challengeFingerprint = fingerprintNormalized({
    repository: challenge.repository.trim(),
    branch: challenge.branch.trim(),
    headSha: challengeHeadSha,
    scope: challenge.scope.trim(),
    claimId: challenge.claimId.trim(),
    statement: challenge.statement.trim(),
    value: challenge.value,
    state: challenge.state,
    evidenceRefs: normalizeRefs(challenge.evidenceRefs),
    observedAt: challenge.observedAt,
  });

  const result = (
    verdict: TruthChallengeEvaluation['verdict'],
    reason: string,
  ): TruthChallengeEvaluation => ({
    contract: 'true-first-challenge-v1',
    verdict,
    baselineFingerprint: baseline.baselineFingerprint,
    challengeFingerprint,
    claimId: challenge.claimId.trim(),
    reason,
    authority: 'EVIDENCE_ONLY',
  });

  if (
    challenge.repository.trim().toLowerCase() !== baseline.project.repository.toLowerCase()
    || challenge.branch.trim() !== baseline.subject.branch
    || challenge.scope.trim() !== baseline.subject.scope
  ) {
    return result('SUBJECT_MISMATCH', 'Challenge repository, branch, or scope does not match the baseline subject.');
  }

  if (
    challengeHeadSha !== baseline.subject.headSha
    || (baseline.proofCookie.expiresAt != null && Date.parse(baseline.proofCookie.expiresAt) <= evaluatedAt.getTime())
    || baseline.proofCookie.revokedAt != null
  ) {
    return result('BASELINE_STALE', 'The exact-head baseline is no longer current enough to classify this observation as true or false. Rebuild the TRUE baseline first.');
  }

  const baselineClaim = baseline.verifiedTrueClaims.find(
    (claim) => claim.claimId === challenge.claimId.trim(),
  );
  if (!baselineClaim) {
    return result('CLAIM_NOT_IN_BASELINE', 'The challenged claim was not part of the verified TRUE baseline.');
  }

  if (baselineClaim.statement !== challenge.statement.trim()) {
    return result('SUBJECT_MISMATCH', 'The challenge reused a claim ID for different claim text.');
  }

  if (
    challengeObservedMs > evaluatedAt.getTime()
    || challengeObservedMs < baselineObservedMs
    || challenge.state !== 'VERIFIED'
    || normalizeRefs(challenge.evidenceRefs).length === 0
    || challenge.value === 'UNKNOWN'
  ) {
    return result('UNRESOLVED', 'The challenge is not a fresh evidence-bound verified TRUE/FALSE observation newer than the baseline.');
  }

  if (challenge.value === 'FALSE') {
    return result('VERIFIED_CONTRADICTION', 'Fresh verified evidence contradicts a claim in the exact TRUE baseline.');
  }

  return result('RECONFIRMED_TRUE', 'Fresh verified evidence reconfirms the claim in the exact TRUE baseline.');
}
