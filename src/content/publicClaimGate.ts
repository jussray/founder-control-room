export type PublicClaimClass =
  | 'verified_internal'
  | 'externally_verifiable'
  | 'founder_opinion'
  | 'aspirational'
  | 'unsupported';

export interface PublicClaim {
  id: string;
  text: string;
  classification: PublicClaimClass;
  rewrittenForUncertainty: boolean;
  futureTense: boolean;
}

export type PublicClaimGateResult =
  | { allowed: true }
  | {
      allowed: false;
      blockedClaimIds: string[];
      reason: 'unsupported_claim' | 'aspirational_not_future_tense';
    };

export function evaluatePublicClaimGate(
  claims: readonly PublicClaim[],
): PublicClaimGateResult {
  const unsupported = claims.filter((claim) => claim.classification === 'unsupported');
  if (unsupported.length > 0) {
    return {
      allowed: false,
      blockedClaimIds: unsupported.map((claim) => claim.id),
      reason: 'unsupported_claim',
    };
  }

  const invalidAspirational = claims.filter(
    (claim) => claim.classification === 'aspirational' && !claim.futureTense,
  );
  if (invalidAspirational.length > 0) {
    return {
      allowed: false,
      blockedClaimIds: invalidAspirational.map((claim) => claim.id),
      reason: 'aspirational_not_future_tense',
    };
  }

  return { allowed: true };
}
