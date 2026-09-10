export type ClaimSource =
  | 'live_provider'
  | 'exact_target_verification'
  | 'hashed_artifact'
  | 'test_execution'
  | 'model_inference'
  | 'founder_note';

export type ClaimStatus =
  | 'verified'
  | 'partially_verified'
  | 'inferred'
  | 'stale'
  | 'conflicted'
  | 'blocked'
  | 'unknown';

export type EvidenceScope =
  | 'ui_render'
  | 'api_response'
  | 'test_result'
  | 'runtime_health'
  | 'provider_execution'
  | 'repository_state'
  | 'authorization'
  | 'privacy_filter';

export interface TruthClaim {
  id: string;
  subjectType: string;
  subjectId: string;
  assertion: string;
  status: ClaimStatus;
  source: ClaimSource;
  evidenceScope: EvidenceScope[];
  targetFingerprint: string | null;
  freshnessExpiresAt: string | null;
  evidenceIds: string[];
  doesNotProve: string[];
  conflictIds: string[];
  provenanceId: string;
}

export interface ClaimEvidenceRecord {
  id: string;
  source: ClaimSource;
  scope: EvidenceScope;
  observedAt: string;
  freshnessExpiresAt: string | null;
  targetFingerprint: string | null;
  integrityDigest: string | null;
  provenanceId: string;
}

export interface ClaimEvidenceLink {
  claimId: string;
  evidenceId: string;
  compatibleScope: EvidenceScope;
}

export interface TruthRenderContext {
  now: string;
  currentTargetFingerprint?: string | null;
  evidenceById: ReadonlyMap<string, ClaimEvidenceRecord>;
  evidenceLinks: readonly ClaimEvidenceLink[];
}

function parseInstant(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasText(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Enforce the canonical truth precedence for evidence that is allowed to
 * render a verified claim green. Model inference and founder notes may inform
 * a claim, but they cannot independently verify one.
 */
function evidenceCanVerifyClaim(
  claim: TruthClaim,
  evidence: ClaimEvidenceRecord,
): boolean {
  switch (evidence.source) {
    case 'live_provider':
      return true;
    case 'exact_target_verification':
      return hasText(claim.targetFingerprint)
        && evidence.targetFingerprint === claim.targetFingerprint;
    case 'hashed_artifact':
      return hasText(evidence.integrityDigest);
    case 'test_execution':
      return hasText(claim.targetFingerprint)
        && evidence.targetFingerprint === claim.targetFingerprint;
    case 'model_inference':
    case 'founder_note':
      return false;
  }
}

function hasCompatibleEvidenceLink(
  claim: TruthClaim,
  evidence: ClaimEvidenceRecord,
  links: readonly ClaimEvidenceLink[],
): boolean {
  return links.some((link) => (
    link.claimId === claim.id
    && link.evidenceId === evidence.id
    && link.compatibleScope === evidence.scope
    && claim.evidenceScope.includes(link.compatibleScope)
  ));
}

/**
 * Green is a rendering decision, not a synonym for "looks good".
 * It is allowed only when the claim is verified, fresh, target-bound when
 * required, and backed by at least one explicitly linked compatible
 * authoritative evidence record that satisfies the canonical source-specific
 * verification binding.
 */
export function canRenderVerifiedClaim(
  claim: TruthClaim,
  context: TruthRenderContext,
): boolean {
  if (claim.status !== 'verified') return false;
  if (claim.conflictIds.length > 0) return false;

  const now = parseInstant(context.now);
  const expires = parseInstant(claim.freshnessExpiresAt);
  if (now === null || expires === null || expires <= now) return false;

  if (claim.targetFingerprint !== null) {
    if (!context.currentTargetFingerprint) return false;
    if (claim.targetFingerprint !== context.currentTargetFingerprint) return false;
  }

  return claim.evidenceIds.some((evidenceId) => {
    const evidence = context.evidenceById.get(evidenceId);
    if (!evidence) return false;
    if (!hasCompatibleEvidenceLink(claim, evidence, context.evidenceLinks)) return false;
    if (!evidenceCanVerifyClaim(claim, evidence)) return false;

    const evidenceExpires = parseInstant(evidence.freshnessExpiresAt);
    if (evidenceExpires !== null && evidenceExpires <= now) return false;

    if (
      claim.targetFingerprint !== null
      && evidence.targetFingerprint !== null
      && evidence.targetFingerprint !== claim.targetFingerprint
    ) {
      return false;
    }

    return true;
  });
}
