export type CapabilityCostClass =
  | 'LOCAL_NO_PROVIDER_FEE'
  | 'HOSTED_FREE_ALLOWANCE'
  | 'PAID';

export type EvidenceState = 'VERIFIED' | 'UNKNOWN' | 'RESTRICTED';

export interface CapabilityRequirements {
  commercialUseRequired: boolean;
  automationRequired: boolean;
  minimumQualityMet: (candidate: CapabilityCandidate) => boolean;
}

export interface CapabilityCandidate {
  id: string;
  costClass: CapabilityCostClass;
  safetyEligible: boolean;
  privacyEligible: boolean;
  commercialRights: EvidenceState;
  quotaAvailable: boolean;
  automationEligible: boolean;
  licenseEvidence: string | null;
  quotaEvidence: string | null;
  eligibilityRevision: string;
}

export interface CapabilitySelectionReceipt {
  providerId: string;
  costClass: CapabilityCostClass;
  eligibilityRevision: string;
  licenseEvidence: string | null;
  quotaEvidence: string | null;
}

const COST_RANK: Record<CapabilityCostClass, number> = {
  LOCAL_NO_PROVIDER_FEE: 0,
  HOSTED_FREE_ALLOWANCE: 1,
  PAID: 2,
};

export function isCapabilityCandidateEligible(
  candidate: CapabilityCandidate,
  requirements: CapabilityRequirements,
): boolean {
  if (!candidate.safetyEligible || !candidate.privacyEligible) return false;
  if (!requirements.minimumQualityMet(candidate)) return false;
  if (!candidate.quotaAvailable) return false;
  if (requirements.commercialUseRequired && candidate.commercialRights !== 'VERIFIED') return false;
  if (requirements.automationRequired && !candidate.automationEligible) return false;
  return true;
}

export function selectFreeFirstCapability(
  candidates: CapabilityCandidate[],
  requirements: CapabilityRequirements,
): CapabilitySelectionReceipt | null {
  const eligible = candidates
    .filter((candidate) => isCapabilityCandidateEligible(candidate, requirements))
    .sort((a, b) => COST_RANK[a.costClass] - COST_RANK[b.costClass]);

  const selected = eligible[0];
  if (!selected) return null;

  return {
    providerId: selected.id,
    costClass: selected.costClass,
    eligibilityRevision: selected.eligibilityRevision,
    licenseEvidence: selected.licenseEvidence,
    quotaEvidence: selected.quotaEvidence,
  };
}

/**
 * FCR free-first invariant:
 * safety/privacy/rights/quality/quota/automation eligibility are gates;
 * price is only a ranking signal after those gates pass.
 *
 * Provider names are intentionally absent. Free status, license terms, quotas,
 * and automation access can change, so runtime/provider evidence must populate
 * CapabilityCandidate instead of hard-coding a vendor as permanently free.
 */
