import { describe, expect, it } from 'vitest';
import { buildSecurityPostureSnapshot } from './securityPosture.js';

describe('strategic security posture', () => {
  it('summarizes the current registered portfolio without claiming maturity proof', () => {
    const snapshot = buildSecurityPostureSnapshot();

    expect(snapshot.summary).toEqual({
      totalProjects: 8,
      v8Targets: 1,
      v9Targets: 4,
      v10Targets: 3,
      playwrightRequiredProjects: 3,
      totalStageObligations: 74,
      uniqueControlCount: 57,
      frameworkSignalCount: expect.any(Number),
      provenProjects: 0,
    });
    expect(snapshot.projects).toHaveLength(8);
    expect(snapshot.projects.every((project) => project.assessmentState === 'target_only')).toBe(true);
    expect(snapshot.projects.every((project) => project.provenVersion === null)).toBe(true);
  });

  it('keeps target assignment explainable and evidence-gated', () => {
    const snapshot = buildSecurityPostureSnapshot();
    const bySlug = new Map(snapshot.projects.map((project) => [project.slug, project]));

    expect(bySlug.get('founder-control-room')?.targetVersion).toBe(10);
    expect(bySlug.get('sekret-bip')?.targetVersion).toBe(10);
    expect(bySlug.get('chief-ai-machine')?.targetVersion).toBe(10);
    expect(bySlug.get('juss-beautiful-hair')?.targetVersion).toBe(9);
    expect(bySlug.get('l99')?.targetVersion).toBe(8);
    expect(bySlug.get('sekret-bip')?.requiredProof).toContain('Playwright evidence for UI/runtime claims');
  });

  it('publishes defensive Lantern and truth boundaries without adding authority', () => {
    const snapshot = buildSecurityPostureSnapshot();

    expect(snapshot.lantern.valid).toBe(true);
    expect(snapshot.lantern.errors).toEqual([]);
    expect(snapshot.lantern.policy.hackBackAllowed).toBe(false);
    expect(snapshot.lantern.policy.outboundAttackCapabilityAllowed).toBe(false);
    expect(snapshot.lantern.policy.humanIdentityClaimFromNetworkSignalAllowed).toBe(false);
    expect(snapshot.truthBoundaries).toEqual({
      targetVersionIsNotCurrentMaturity: true,
      frameworkMappingIsNotCertification: true,
      providerClaimsRequireRuntimeEvidence: true,
      securityPostureIsReadOnly: true,
      analyticsAreAggregateAndPrivacySafe: true,
      noHumanIdentityClaimFromNetworkSignal: true,
    });
  });
});
