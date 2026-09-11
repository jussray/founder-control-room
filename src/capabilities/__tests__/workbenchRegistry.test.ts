import { describe, expect, it } from 'vitest';
import { capabilities } from '../workbenchRegistry.js';
import {
  isCapabilityCandidateEligible,
  selectFreeFirstCapability,
  type CapabilityCandidate,
} from '../freeFirstCapabilityPolicy.js';

describe('capability workbench registry', () => {
  it('keeps every reviewed capability complete and uniquely addressable', () => {
    const ids = capabilities.map((capability) => capability.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(capabilities.length).toBeGreaterThanOrEqual(12);

    for (const capability of capabilities) {
      expect(capability.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/);
      expect(capability.inputs.length).toBeGreaterThan(0);
      expect(capability.proof.length).toBeGreaterThan(0);
      expect(capability.risk).toBeTruthy();
      expect(capability.implementation).toBeTruthy();
    }
  });

  it('keeps voice and future interaction surfaces inside the shared FCR authority runtime', () => {
    const runtime = capabilities.find((capability) => capability.id === 'shared-capability-runtime-v1');

    expect(runtime).toBeDefined();
    expect(runtime?.kind).toBe('Contract');
    expect(runtime?.purpose).toContain('same intent, live-authority, consequence, approval, execution-receipt, outcome-verification, and next-gate spine');
    expect(runtime?.environment).toContain('FCR remains the control plane');
    expect(runtime?.proof).toContain('Capability discovery is treated as a hint, never execution authority');
    expect(runtime?.proof).toContain('Live authority is rechecked immediately before execution');
    expect(runtime?.proof).toContain('Approvals bind to the exact proposal instead of an unscoped yes/no utterance');
    expect(runtime?.proof).toContain('Provider acceptance and verified founder outcome remain separate truth states');
    expect(runtime?.risk).toContain('does not expose provider credentials');
    expect(runtime?.risk).toContain('does not');
    expect(runtime?.implementation).toContain("type Surface = 'voice' | 'text' | 'mobile' | 'desktop' | 'automation' | 'future'");
    expect(runtime?.implementation).toContain("type Consequence = 'READ' | 'REVERSIBLE_WRITE' | 'CONSEQUENTIAL_WRITE'");
    expect(runtime?.implementation).toContain('Bind approval to proposalId');
  });

  it('uses cost only after safety, privacy, rights, quality, quota, and automation gates pass', () => {
    const candidates: CapabilityCandidate[] = [
      {
        id: 'unsafe-local',
        costClass: 'LOCAL_NO_PROVIDER_FEE',
        safetyEligible: false,
        privacyEligible: true,
        commercialRights: 'VERIFIED',
        quotaAvailable: true,
        automationEligible: true,
        licenseEvidence: 'verified-license',
        quotaEvidence: 'local-runtime',
        eligibilityRevision: 'r1',
      },
      {
        id: 'hosted-free',
        costClass: 'HOSTED_FREE_ALLOWANCE',
        safetyEligible: true,
        privacyEligible: true,
        commercialRights: 'VERIFIED',
        quotaAvailable: true,
        automationEligible: true,
        licenseEvidence: 'verified-license',
        quotaEvidence: 'verified-free-quota',
        eligibilityRevision: 'r2',
      },
      {
        id: 'paid',
        costClass: 'PAID',
        safetyEligible: true,
        privacyEligible: true,
        commercialRights: 'VERIFIED',
        quotaAvailable: true,
        automationEligible: true,
        licenseEvidence: 'verified-license',
        quotaEvidence: 'paid-capacity',
        eligibilityRevision: 'r3',
      },
    ];

    const requirements = {
      commercialUseRequired: true,
      automationRequired: true,
      minimumQualityMet: () => true,
    };

    expect(isCapabilityCandidateEligible(candidates[0], requirements)).toBe(false);
    expect(selectFreeFirstCapability(candidates, requirements)).toEqual({
      providerId: 'hosted-free',
      costClass: 'HOSTED_FREE_ALLOWANCE',
      eligibilityRevision: 'r2',
      licenseEvidence: 'verified-license',
      quotaEvidence: 'verified-free-quota',
    });
  });

  it('falls back to paid only when lower-cost candidates fail current eligibility', () => {
    const candidates: CapabilityCandidate[] = [
      {
        id: 'local-no-rights',
        costClass: 'LOCAL_NO_PROVIDER_FEE',
        safetyEligible: true,
        privacyEligible: true,
        commercialRights: 'UNKNOWN',
        quotaAvailable: true,
        automationEligible: true,
        licenseEvidence: null,
        quotaEvidence: 'local-runtime',
        eligibilityRevision: 'r4',
      },
      {
        id: 'free-no-automation',
        costClass: 'HOSTED_FREE_ALLOWANCE',
        safetyEligible: true,
        privacyEligible: true,
        commercialRights: 'VERIFIED',
        quotaAvailable: true,
        automationEligible: false,
        licenseEvidence: 'verified-license',
        quotaEvidence: 'verified-free-quota',
        eligibilityRevision: 'r5',
      },
      {
        id: 'paid-eligible',
        costClass: 'PAID',
        safetyEligible: true,
        privacyEligible: true,
        commercialRights: 'VERIFIED',
        quotaAvailable: true,
        automationEligible: true,
        licenseEvidence: 'verified-license',
        quotaEvidence: 'paid-capacity',
        eligibilityRevision: 'r6',
      },
    ];

    expect(selectFreeFirstCapability(candidates, {
      commercialUseRequired: true,
      automationRequired: true,
      minimumQualityMet: () => true,
    })?.providerId).toBe('paid-eligible');
  });
});
