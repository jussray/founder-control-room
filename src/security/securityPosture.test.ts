import { describe, expect, it } from 'vitest';
import { buildSecurityPostureSnapshot } from './securityPosture.js';

describe('strategic security posture', () => {
  it('summarizes the current registered portfolio without claiming maturity proof', () => {
    const snapshot = buildSecurityPostureSnapshot(new Date('2026-09-11T00:00:00.000Z'));

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
      providerPqcEvidenceEntries: 10,
      providerPqcCurrentEntries: 2,
      providerPqcPlannedEntries: 2,
      providerPqcUnsupportedEntries: 4,
      providerPqcUnknownEntries: 2,
      provenProjects: 0,
    });
    expect(snapshot.projects).toHaveLength(8);
    expect(snapshot.projects.every((project) => project.assessmentState === 'target_only')).toBe(true);
    expect(snapshot.projects.every((project) => project.provenVersion === null)).toBe(true);
  });

  it('keeps target assignment explainable and evidence-gated', () => {
    const snapshot = buildSecurityPostureSnapshot(new Date('2026-09-11T00:00:00.000Z'));
    const bySlug = new Map(snapshot.projects.map((project) => [project.slug, project]));

    expect(bySlug.get('founder-control-room')?.targetVersion).toBe(10);
    expect(bySlug.get('sekret-bip')?.targetVersion).toBe(10);
    expect(bySlug.get('chief-ai-machine')?.targetVersion).toBe(10);
    expect(bySlug.get('juss-beautiful-hair')?.targetVersion).toBe(9);
    expect(bySlug.get('l99')?.targetVersion).toBe(8);
    expect(bySlug.get('sekret-bip')?.requiredProof).toContain('Playwright evidence for UI/runtime claims');
  });

  it('covers every active project with observed crypto evidence or an explicit review-required state', () => {
    const snapshot = buildSecurityPostureSnapshot(new Date('2026-09-11T00:00:00.000Z'));

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

  it('separates provider PQC documentation from project runtime proof', () => {
    const snapshot = buildSecurityPostureSnapshot(new Date('2026-09-11T00:00:00.000Z'));
    const evidence = snapshot.cryptography.providerPqcEvidence;
    const byId = new Map(evidence.entries.map((entry) => [entry.id, entry]));

    expect(evidence.summary).toEqual({
      entryCount: 10,
      currentCount: 2,
      plannedCount: 2,
      unsupportedCount: 4,
      unknownCount: 2,
    });
    expect(byId.get('github-app-jwt-signature')).toMatchObject({
      state: 'UNSUPPORTED',
      currentContract: 'GitHub App authentication JWTs must be signed with RS256.',
    });
    expect(byId.get('supabase-auth-jwt-signature')).toMatchObject({
      state: 'UNSUPPORTED',
      provider: 'Supabase',
    });
    expect(byId.get('firebase-app-check-jwt-signature')).toMatchObject({
      state: 'UNSUPPORTED',
      provider: 'Firebase / Google',
    });
    expect(byId.get('cloudflare-access-jwt-signature')).toMatchObject({
      state: 'UNSUPPORTED',
      provider: 'Cloudflare',
    });
    expect(byId.get('cloudflare-edge-tls-key-agreement')).toMatchObject({
      state: 'CURRENT',
      plane: 'transport-key-agreement',
    });
    expect(byId.get('google-api-tls-key-agreement')).toMatchObject({
      state: 'CURRENT',
      plane: 'transport-key-agreement',
    });
    expect(byId.get('cloudflare-visitor-tls-signatures')?.state).toBe('PLANNED');
    expect(byId.get('google-identity-signature-roadmap')?.state).toBe('PLANNED');
    expect(byId.get('github-public-tls')?.state).toBe('UNKNOWN');
    expect(byId.get('supabase-public-tls')?.state).toBe('UNKNOWN');
    expect(evidence.entries.every((entry) => entry.requiredRuntimeEvidenceBeforeChange.length > 0)).toBe(true);
  });

  it('expires CURRENT provider PQC claims when the bounded evidence lease lapses', () => {
    const snapshot = buildSecurityPostureSnapshot(new Date('2026-09-18T00:00:00.000Z'));
    const evidence = snapshot.cryptography.providerPqcEvidence;
    const byId = new Map(evidence.entries.map((entry) => [entry.id, entry]));

    expect(evidence.summary.currentCount).toBe(0);
    expect(evidence.summary.unknownCount).toBe(4);
    expect(byId.get('cloudflare-edge-tls-key-agreement')).toMatchObject({
      state: 'UNKNOWN',
      currentContract: expect.stringContaining('evidence lease expired'),
    });
    expect(byId.get('google-api-tls-key-agreement')).toMatchObject({
      state: 'UNKNOWN',
      currentContract: expect.stringContaining('evidence lease expired'),
    });
  });

  it('publishes defensive Lantern and truth boundaries without adding authority', () => {
    const snapshot = buildSecurityPostureSnapshot(new Date('2026-09-11T00:00:00.000Z'));

    expect(snapshot.lantern.valid).toBe(true);
    expect(snapshot.lantern.errors).toEqual([]);
    expect(snapshot.lantern.policy.hackBackAllowed).toBe(false);
    expect(snapshot.lantern.policy.outboundAttackCapabilityAllowed).toBe(false);
    expect(snapshot.lantern.policy.humanIdentityClaimFromNetworkSignalAllowed).toBe(false);
    expect(snapshot.truthBoundaries).toEqual({
      targetVersionIsNotCurrentMaturity: true,
      frameworkMappingIsNotCertification: true,
      providerClaimsRequireRuntimeEvidence: true,
      providerRoadmapIsNotRuntimeProof: true,
      cryptographicInventoryIsObservationNotQuantumSafety: true,
      securityPostureIsReadOnly: true,
      analyticsAreAggregateAndPrivacySafe: true,
      noHumanIdentityClaimFromNetworkSignal: true,
    });
  });
});
