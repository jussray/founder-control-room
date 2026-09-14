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
  transportEvidence?: string | null;
}

export type CapabilityIneligibilityReason =
  | 'safety'
  | 'privacy'
  | 'quality'
  | 'quota'
  | 'transport'
  | 'commercial-rights'
  | 'automation';

export interface CapabilityDecisionTrace {
  providerId: string;
  eligible: boolean;
  reasons: CapabilityIneligibilityReason[];
  eligibilityRevision: string;
}

const COST_RANK: Record<CapabilityCostClass, number> = {
  LOCAL_NO_PROVIDER_FEE: 0,
  HOSTED_FREE_ALLOWANCE: 1,
  PAID: 2,
};

export function explainCapabilityCandidateIneligibility(
  candidate: CapabilityCandidate,
  requirements: CapabilityRequirements,
): CapabilityIneligibilityReason[] {
  const reasons: CapabilityIneligibilityReason[] = [];
  if (!candidate.safetyEligible) reasons.push('safety');
  if (!candidate.privacyEligible) reasons.push('privacy');
  if (!requirements.minimumQualityMet(candidate)) reasons.push('quality');
  if (!candidate.quotaAvailable) reasons.push('quota');
  if (candidate.transportReady === false) reasons.push('transport');
  if (requirements.commercialUseRequired && candidate.commercialRights !== 'VERIFIED') {
    reasons.push('commercial-rights');
  }
  if (requirements.automationRequired && !candidate.automationEligible) reasons.push('automation');
  return reasons;
}

export function traceCapabilityDecision(
  candidates: CapabilityCandidate[],
  requirements: CapabilityRequirements,
): CapabilityDecisionTrace[] {
  return candidates.map((candidate) => {
    const reasons = explainCapabilityCandidateIneligibility(candidate, requirements);
    return {
      providerId: candidate.id,
      eligible: reasons.length === 0,
      reasons,
      eligibilityRevision: candidate.eligibilityRevision,
    };
  });
}

export function isCapabilityCandidateEligible(
  candidate: CapabilityCandidate,
  requirements: CapabilityRequirements,
): boolean {
  return explainCapabilityCandidateIneligibility(candidate, requirements).length === 0;
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
    ...(selected.transportEvidence !== undefined
      ? { transportEvidence: selected.transportEvidence }
      : {}),
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
 * eligibility/transport evidence in the selection receipt when observed.
 * Decision traces explain why cheaper candidates were rejected without turning
 * those explanations into authority.
 */
