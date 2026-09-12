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
  /**
   * Live provider/browser transport state when known. An explicit false is a
   * hard eligibility failure so a disconnected provider cannot be selected
   * merely because its policy, quota, or price still look valid.
   *
   * Optional for compatibility with existing non-transport capability
   * candidates. Runtime-backed browser/tool candidates should always populate
   * this field from the current handshake rather than stale configuration.
   */
  transportReady?: boolean;
  /** Evidence/fingerprint for the transport observation used in selection. */
  transportEvidence?: string | null;
}

export interface CapabilitySelectionReceipt {
  providerId: string;
  costClass: CapabilityCostClass;
  eligibilityRevision: string;
  licenseEvidence: string | null;
  quotaEvidence: string | null;
  transportEvidence: string | null;
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
  if (candidate.transportReady === false) return false;
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
    transportEvidence: selected.transportEvidence ?? null,
  };
}

/**
 * FCR free-first invariant:
 * safety/privacy/rights/quality/quota/automation eligibility are gates;
 * a known live transport failure is also a hard gate; price is only a ranking
 * signal after those gates pass.
 *
 * Provider names are intentionally absent. Free status, license terms, quotas,
 * transport handshakes, and automation access can change, so runtime/provider
 * evidence must populate CapabilityCandidate instead of hard-coding a vendor
 * as permanently free or permanently available.
 *
 * Fallback does not inherit authority from the failed provider. The selected
 * candidate still has to satisfy the same requirements and emits its own
 * eligibility/transport evidence in the selection receipt.
 */
