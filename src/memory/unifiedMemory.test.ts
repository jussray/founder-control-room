import { describe, expect, it } from 'vitest';
import {
  buildUnifiedMemoryView,
  memoryRecordsForContinuity,
  memoryRecordsForDecisionSupport,
  normalizeUnifiedMemoryObservation,
  type NativeMemoryObservation,
} from './unifiedMemory.js';

const NOW = new Date('2026-08-29T20:00:00.000Z');
const SHA = 'a'.repeat(40);
const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function chief(overrides: Partial<NativeMemoryObservation> = {}): NativeMemoryObservation {
  return {
    sourceSystem: 'chief-ai-machine',
    projectSlug: 'chief-ai-machine',
    repository: 'jussray/chief-ai-machine',
    nativeKind: 'company-brain',
    nativeId: 'asset-1',
    observedAt: '2026-08-29T19:00:00.000Z',
    sourceSha: SHA,
    trust: 'verified',
    privacy: 'internal',
    summary: 'Approved founder operating principle.',
    categoryKeys: ['company_brain'],
    contentHash: HASH_A,
    provenanceRefs: ['chief:company-brain:asset-1'],
    ...overrides,
  };
}

describe('unified portfolio memory spine', () => {
  it('normalizes raw Chief Company Brain into registered continuity memory without execution or decision authority', () => {
    const result = normalizeUnifiedMemoryObservation(chief(), NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.record).toMatchObject({
      version: 'fcr-unified-memory@v1',
      sourceSystem: 'chief-ai-machine',
      sourceVerification: 'untrusted-import',
      projectRegistration: 'registered',
      kind: 'semantic',
      durable: true,
      observationState: 'fresh',
      continuityUsable: true,
      decisionSupportUsable: false,
      executionAuthority: false,
    });
    expect(result.record.summary).toBe('Approved founder operating principle.');
    expect(result.record.continuityFingerprint).toMatch(/^memfp:sha256:[0-9a-f]{64}$/);
  });

  it('ignores a forged payload authentication claim instead of laundering it into decision support', () => {
    const forged = {
      ...chief(),
      sourceVerification: 'authenticated-source' as const,
    };
    const result = normalizeUnifiedMemoryObservation(forged, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.record).toMatchObject({
      sourceVerification: 'untrusted-import',
      projectRegistration: 'registered',
      observationState: 'fresh',
      trust: 'verified',
      continuityUsable: true,
      decisionSupportUsable: false,
      executionAuthority: false,
    });
    expect(memoryRecordsForDecisionSupport(buildUnifiedMemoryView([forged], NOW))).toHaveLength(0);
  });

  it('rejects a registered source trying to claim another project identity', () => {
    const spoofed = normalizeUnifiedMemoryObservation(chief({
      projectSlug: 'sekret-bip',
    }), NOW);

    expect(spoofed.ok).toBe(false);
    if (!spoofed.ok) {
      expect(spoofed.errors.join(' ')).toContain('projectSlug must be exactly chief-ai-machine');
    }
  });

  it('allows FCR itself to project sanitized continuity evidence into another registered portfolio project', () => {
    const result = normalizeUnifiedMemoryObservation({
      sourceSystem: 'founder-control-room',
      projectSlug: 'sekret-bip',
      repository: 'jussray/founder-control-room',
      nativeKind: 'evidence',
      nativeId: 'receipt-1',
      observedAt: '2026-08-29T19:45:00.000Z',
      trust: 'verified',
      privacy: 'internal',
      summary: 'Sanitized exact-head verification receipt.',
      provenanceRefs: ['fcr:evidence:receipt-1'],
    }, NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.projectRegistration).toBe('registered');
      expect(result.record.projectSlug).toBe('sekret-bip');
      expect(result.record.sourceVerification).toBe('untrusted-import');
      expect(result.record.decisionSupportUsable).toBe(false);
      expect(result.record.executionAuthority).toBe(false);
    }
  });

  it('keeps Se’kret Bip memory metadata-only and rejects private content crossing into FCR', () => {
    const safe = normalizeUnifiedMemoryObservation({
      sourceSystem: 'sekret-bip',
      projectSlug: 'sekret-bip',
      repository: 'jussray/Sekret-Bip',
      nativeKind: 'memory-category',
      nativeId: 'memory-7',
      observedAt: '2026-08-29T19:30:00.000Z',
      trust: 'verified',
      privacy: 'restricted',
      categoryKeys: ['mood', 'journalTags'],
      provenanceRefs: ['sekret:preflight:memory-7'],
    }, NOW);

    expect(safe.ok).toBe(true);
    if (safe.ok) {
      expect(safe.record.contentMode).toBe('metadata-only');
      expect(safe.record.summary).toBeNull();
      expect(safe.record.categoryKeys).toEqual(['mood', 'journalTags']);
      expect(safe.record.projectRegistration).toBe('registered');
      expect(safe.record.decisionSupportUsable).toBe(false);
      expect(safe.record.executionAuthority).toBe(false);
    }

    const leaked = normalizeUnifiedMemoryObservation({
      sourceSystem: 'sekret-bip',
      projectSlug: 'sekret-bip',
      repository: 'jussray/Sekret-Bip',
      nativeKind: 'memory-category',
      nativeId: 'memory-8',
      observedAt: '2026-08-29T19:30:00.000Z',
      trust: 'verified',
      privacy: 'restricted',
      summary: 'raw private journal content',
      categoryKeys: ['journal'],
      provenanceRefs: ['sekret:preflight:memory-8'],
    }, NOW);

    expect(leaked.ok).toBe(false);
    if (!leaked.ok) expect(leaked.errors.join(' ')).toContain('metadata-only');
  });

  it('keeps explicitly indexed external product memory continuity-only instead of granting portfolio authority', () => {
    const result = normalizeUnifiedMemoryObservation({
      sourceSystem: 'solcontinuity',
      projectSlug: 'solcontinuity',
      repository: 'jussray/solcontinuity',
      nativeKind: 'evidence-history',
      nativeId: 'evidence-44',
      observedAt: '2026-08-29T19:00:00.000Z',
      trust: 'verified',
      privacy: 'internal',
      summary: 'Sanitized provider evidence history.',
      provenanceRefs: ['solcontinuity:evidence:44'],
    }, NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record).toMatchObject({
        projectRegistration: 'external',
        sourceVerification: 'untrusted-import',
        continuityUsable: true,
        decisionSupportUsable: false,
        executionAuthority: false,
      });
    }
  });

  it('keeps finance-shaped external agent memory metadata-only and continuity-only', () => {
    const result = normalizeUnifiedMemoryObservation({
      sourceSystem: 'sleepwealth-agent',
      projectSlug: 'sleepwealth-agent',
      repository: 'jussray/SleepWealth-Agent',
      nativeKind: 'audit-entry',
      nativeId: 'audit-44',
      observedAt: '2026-08-29T19:00:00.000Z',
      trust: 'verified',
      privacy: 'private',
      categoryKeys: ['order_rejected', 'risk_gate'],
      provenanceRefs: ['audit:44'],
    }, NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.kind).toBe('audit');
      expect(result.record.summary).toBeNull();
      expect(result.record.contentMode).toBe('metadata-only');
      expect(result.record.projectRegistration).toBe('external');
      expect(result.record.decisionSupportUsable).toBe(false);
    }
  });

  it('lets stale observations support continuity but not current decision truth', () => {
    const view = buildUnifiedMemoryView([
      chief({ observedAt: '2026-08-20T19:00:00.000Z' }),
    ], NOW);

    expect(view.records[0]).toMatchObject({
      observationState: 'stale',
      continuityUsable: true,
      decisionSupportUsable: false,
    });
    expect(memoryRecordsForContinuity(view)).toHaveLength(1);
    expect(memoryRecordsForDecisionSupport(view)).toHaveLength(0);
  });

  it('fails future-dated and revoked observations closed', () => {
    const future = normalizeUnifiedMemoryObservation(
      chief({ observedAt: '2026-08-30T20:00:00.000Z' }),
      NOW,
    );
    expect(future.ok).toBe(true);
    if (future.ok) {
      expect(future.record.observationState).toBe('future');
      expect(future.record.continuityUsable).toBe(false);
      expect(future.record.decisionSupportUsable).toBe(false);
    }

    const revoked = normalizeUnifiedMemoryObservation(
      chief({ trust: 'revoked', revokedAt: '2026-08-29T19:30:00.000Z' }),
      NOW,
    );
    expect(revoked.ok).toBe(true);
    if (revoked.ok) {
      expect(revoked.record.observationState).toBe('revoked');
      expect(revoked.record.revokedAt).toBe('2026-08-29T19:30:00.000Z');
      expect(revoked.record.continuityUsable).toBe(false);
      expect(revoked.record.decisionSupportUsable).toBe(false);
    }
  });

  it('uses the newest observation for one native identity', () => {
    const view = buildUnifiedMemoryView([
      chief({ observedAt: '2026-08-29T17:00:00.000Z', summary: 'older', contentHash: HASH_A }),
      chief({ observedAt: '2026-08-29T19:00:00.000Z', summary: 'newer', contentHash: HASH_B }),
    ], NOW);

    expect(view.conflicts).toHaveLength(0);
    expect(view.records).toHaveLength(1);
    expect(view.records[0]?.summary).toBe('newer');
  });

  it('does not choose between contradictory observations at the same source time', () => {
    const view = buildUnifiedMemoryView([
      chief({ summary: 'version-a', contentHash: HASH_A }),
      chief({ summary: 'version-b', contentHash: HASH_B }),
    ], NOW);

    expect(view.records).toHaveLength(0);
    expect(view.conflicts).toHaveLength(1);
    expect(view.conflicts[0]?.variants).toBe(2);
    expect(view.conflicts[0]?.fingerprints).toHaveLength(2);
    expect(view.summary.conflicted).toBe(1);
  });

  it('canonicalizes equivalent timestamps before fingerprinting', () => {
    const first = normalizeUnifiedMemoryObservation(chief({
      observedAt: '2026-08-29T19:00:00Z',
    }), NOW);
    const second = normalizeUnifiedMemoryObservation(chief({
      observedAt: '2026-08-29T15:00:00-04:00',
    }), NOW);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.record.observedAt).toBe(second.record.observedAt);
      expect(first.record.continuityFingerprint).toBe(second.record.continuityFingerprint);
    }
  });

  it('rejects repository spoofing and malformed provenance instead of laundering it into memory', () => {
    const spoofed = buildUnifiedMemoryView([
      chief({ repository: 'jussray/founder-control-room' }),
      chief({ nativeId: 'asset-2', provenanceRefs: [] }),
    ], NOW);

    expect(spoofed.records).toHaveLength(0);
    expect(spoofed.rejected).toHaveLength(2);
    expect(spoofed.rejected[0]?.errors.join(' ')).toContain('repository must be exactly');
    expect(spoofed.rejected[1]?.errors.join(' ')).toContain('provenanceRefs');
  });

  it('maps the memory organs found across the portfolio into one canonical continuity vocabulary without granting decision authority', () => {
    const inputs: NativeMemoryObservation[] = [
      {
        sourceSystem: 'founder-control-room',
        projectSlug: 'founder-control-room', repository: 'jussray/founder-control-room',
        nativeKind: 'decision', nativeId: 'decision-1', observedAt: '2026-08-29T19:00:00.000Z', trust: 'verified', privacy: 'internal',
        summary: 'Founder decision receipt.', provenanceRefs: ['fcr:decision:1'],
      },
      {
        sourceSystem: 'storyengine',
        projectSlug: 'l99', repository: 'jussray/StoryEngine',
        nativeKind: 'canon', nativeId: 'canon-1', observedAt: '2026-08-29T19:00:00.000Z', trust: 'verified', privacy: 'internal',
        summary: 'Approved narrative canon.', provenanceRefs: ['l99:canon:1'],
      },
      {
        sourceSystem: 'promptos',
        projectSlug: 'promptos', repository: 'jussray/promptos',
        nativeKind: 'prompt-asset', nativeId: 'prompt-1', observedAt: '2026-08-29T19:00:00.000Z', trust: 'verified', privacy: 'internal',
        summary: 'Portable prompt asset.', provenanceRefs: ['promptos:asset:1'],
      },
      {
        sourceSystem: 'think-tank',
        projectSlug: 'think-tank', repository: 'jussray/THINK-TANK',
        nativeKind: 'idea-record', nativeId: 'idea-1', observedAt: '2026-08-29T19:00:00.000Z', trust: 'submitted-unverified', privacy: 'private',
        summary: 'Founder idea record.', provenanceRefs: ['think-tank:idea:1'],
      },
      {
        sourceSystem: 'solcontinuity',
        projectSlug: 'solcontinuity', repository: 'jussray/solcontinuity',
        nativeKind: 'evidence-history', nativeId: 'evidence-1', observedAt: '2026-08-29T19:00:00.000Z', trust: 'verified', privacy: 'internal',
        summary: 'Sanitized provider evidence history.', provenanceRefs: ['solcontinuity:evidence:1'],
      },
    ];

    const view = buildUnifiedMemoryView(inputs, NOW);

    expect(view.rejected).toHaveLength(0);
    expect(view.conflicts).toHaveLength(0);
    expect(view.records.map((record) => record.kind).sort()).toEqual([
      'decision', 'evidence', 'narrative', 'semantic', 'semantic',
    ]);
    expect(view.records.every((record) => record.sourceVerification === 'untrusted-import')).toBe(true);
    expect(view.records.every((record) => record.executionAuthority === false)).toBe(true);
    expect(view.summary.verifiedForDecisionSupport).toBe(0);
    expect(view.summary.externalContinuityOnly).toBe(2);
  });
});
