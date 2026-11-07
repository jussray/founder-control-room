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
}

function parseInstant(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Green is a rendering decision, not a synonym for "looks good".
 * It is allowed only when the claim is verified, fresh, target-bound when
 * required, and backed by at least one compatible evidence record.
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
    if (!claim.evidenceScope.includes(evidence.scope)) return false;

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
