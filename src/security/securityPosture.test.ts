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
      uniqueControlCount: 62,
      frameworkSignalCount: expect.any(Number),
      cryptographicInventoryEntries: 7,
      cryptographicReviewRequiredProjects: 3,
      publicKeyMigrationEntries: 4,
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

  it('covers every active project with observed crypto evidence or an explicit review-required state', () => {
    const snapshot = buildSecurityPostureSnapshot();

    expect(snapshot.cryptography.coverage).toEqual({
      activeProjectCount: 8,
      representedProjectCount: 8,
      inventoryEntryCount: 7,
      reviewRequiredProjectCount: 3,
      publicKeyMigrationEntryCount: 4,
      missingProjectSlugs: [],
      overlappingProjectSlugs: [],
    });

    const byId = new Map(snapshot.cryptography.inventory.map((entry) => [entry.id, entry]));
    expect(byId.get('fcr-github-app-rs256')).toMatchObject({
      algorithm: 'RS256 / RSA-SHA256',
      quantumMigrationClass: 'PUBLIC_KEY_MIGRATION_REQUIRED',
    });
    expect(byId.get('fcr-founder-session-aes256gcm')).toMatchObject({
      algorithm: 'AES-256-GCM',
      quantumMigrationClass: 'SYMMETRIC_MONITOR',
    });
    expect(byId.get('sekret-firebase-appcheck-rs256')).toMatchObject({
      provider: 'Firebase / Google',
      quantumMigrationClass: 'PUBLIC_KEY_MIGRATION_REQUIRED',
    });
    expect(snapshot.cryptography.reviewRequired.map((entry) => entry.projectSlug).sort()).toEqual([
      'chief-ai-machine',
      'juss-beautiful-hair',
      'promptos',
    ]);
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
      cryptographicInventoryIsObservationNotQuantumSafety: true,
      securityPostureIsReadOnly: true,
      analyticsAreAggregateAndPrivacySafe: true,
      noHumanIdentityClaimFromNetworkSignal: true,
    });
  });
});
