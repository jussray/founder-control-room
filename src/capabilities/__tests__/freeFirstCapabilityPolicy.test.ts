import { describe, expect, it } from 'vitest';
import {
  isCapabilityCandidateEligible,
  selectFreeFirstCapability,
  type CapabilityCandidate,
  type CapabilityRequirements,
} from '../freeFirstCapabilityPolicy.js';

const requirements: CapabilityRequirements = {
  commercialUseRequired: true,
  automationRequired: true,
  minimumQualityMet: () => true,
};

function candidate(
  id: string,
  costClass: CapabilityCandidate['costClass'],
  transportReady: boolean,
  transportEvidence: string,
): CapabilityCandidate {
  return {
    id,
    costClass,
    safetyEligible: true,
    privacyEligible: true,
    commercialRights: 'VERIFIED',
    quotaAvailable: true,
    automationEligible: true,
    licenseEvidence: 'verified-license',
    quotaEvidence: 'verified-quota',
    eligibilityRevision: `eligibility:${id}:r1`,
    transportReady,
    transportEvidence,
  };
}

describe('free-first capability transport readiness', () => {
  it('rejects a provider after a live transport handshake failure', () => {
    const disconnected = candidate(
      'opera-browser-connector',
      'LOCAL_NO_PROVIDER_FEE',
      false,
      'transport:opera:browser_not_connected',
    );

    expect(isCapabilityCandidateEligible(disconnected, requirements)).toBe(false);
  });

  it('falls through to the next eligible provider and preserves its transport fingerprint', () => {
    const disconnected = candidate(
      'opera-browser-connector',
      'LOCAL_NO_PROVIDER_FEE',
      false,
      'transport:opera:browser_not_connected',
    );
    const fallback = candidate(
      'approved-browser-fallback',
      'HOSTED_FREE_ALLOWANCE',
      true,
      'transport:fallback:ready:r7',
    );

    expect(selectFreeFirstCapability([disconnected, fallback], requirements)).toEqual({
      providerId: 'approved-browser-fallback',
      costClass: 'HOSTED_FREE_ALLOWANCE',
      eligibilityRevision: 'eligibility:approved-browser-fallback:r1',
      licenseEvidence: 'verified-license',
      quotaEvidence: 'verified-quota',
      transportEvidence: 'transport:fallback:ready:r7',
    });
  });
});
