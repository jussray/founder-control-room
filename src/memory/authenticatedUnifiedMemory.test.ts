import { describe, expect, it } from 'vitest';
import {
  authenticateUnifiedMemoryObservation,
  authenticatedMemoryForDecisionSupport,
  type AuthenticatedMemorySourceWitness,
  type AuthenticatedUnifiedMemoryTrustRoot,
  type CurrentMemoryProjectAuthorityWitness,
} from './authenticatedUnifiedMemory.js';
import type { NativeMemoryObservation, UnifiedMemoryRecord } from './unifiedMemory.js';

const NOW = new Date('2026-09-07T19:00:00.000Z');
const SHA = 'a'.repeat(40);
const HASH = `sha256:${'b'.repeat(64)}`;
const PLACEHOLDER_FINGERPRINT = `memfp:sha256:${'0'.repeat(64)}`;

function chief(overrides: Partial<NativeMemoryObservation> = {}): NativeMemoryObservation {
  return {
    sourceSystem: 'chief-ai-machine',
    projectSlug: 'chief-ai-machine',
    repository: 'jussray/chief-ai-machine',
    nativeKind: 'company-brain',
    nativeId: 'brain-1',
    observedAt: '2026-09-07T18:45:00.000Z',
    sourceSha: SHA,
    trust: 'verified',
    privacy: 'internal',
    summary: 'Sanitized operating principle.',
    categoryKeys: ['operating_principle'],
    contentHash: HASH,
    provenanceRefs: ['chief:company-brain:brain-1'],
    ...overrides,
  };
}

function sourceWitness(
  overrides: Partial<AuthenticatedMemorySourceWitness> = {},
): AuthenticatedMemorySourceWitness {
  return {
    version: 'fcr-memory-source-auth@v1',
    sourceSystem: 'chief-ai-machine',
    projectSlug: 'chief-ai-machine',
    repository: 'jussray/chief-ai-machine',
    sourceSha: SHA,
    continuityFingerprint: PLACEHOLDER_FINGERPRINT,
    observedAt: '2026-09-07T18:59:00.000Z',
    expiresAt: '2026-09-07T19:04:00.000Z',
    evidenceRef: 'auth:chief:session-1',
    ...overrides,
  };
}

function projectWitness(
  overrides: Partial<CurrentMemoryProjectAuthorityWitness> = {},
): CurrentMemoryProjectAuthorityWitness {
  return {
    version: 'fcr-memory-project-authority@v1',
    projectSlug: 'chief-ai-machine',
    repository: 'jussray/chief-ai-machine',
    registration: 'registered-active',
    observedAt: '2026-09-07T18:59:00.000Z',
    expiresAt: '2026-09-07T19:04:00.000Z',
    evidenceRef: 'authority:project:chief-ai-machine:1',
    ...overrides,
  };
}

function trustRoot(overrides: {
  authenticateSource?: (record: Readonly<UnifiedMemoryRecord>) => AuthenticatedMemorySourceWitness | null;
  resolveCurrentProjectAuthority?: (projectSlug: string) => CurrentMemoryProjectAuthorityWitness | null;
} = {}): AuthenticatedUnifiedMemoryTrustRoot {
  return {
    authenticateSource: overrides.authenticateSource ?? ((record) => sourceWitness({
      continuityFingerprint: record.continuityFingerprint,
    })),
    resolveCurrentProjectAuthority: overrides.resolveCurrentProjectAuthority ?? (() => projectWitness()),
  };
}

describe('authenticated unified memory ingress', () => {
  it('keeps the raw record untrusted while a separate fresh envelope becomes decision-support usable', async () => {
    const result = await authenticateUnifiedMemoryObservation(chief(), trustRoot(), NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.envelope).toMatchObject({
      version: 'fcr-authenticated-unified-memory@v1',
      sourceVerification: 'authenticated-source',
      projectRegistration: 'registered',
      decisionSupportUsable: true,
      executionAuthority: false,
    });
    expect(result.envelope.record).toMatchObject({
      sourceVerification: 'untrusted-import',
      decisionSupportUsable: false,
      executionAuthority: false,
    });
    expect(result.envelope.sourceWitness.continuityFingerprint).toBe(result.envelope.record.continuityFingerprint);
  });

  it('fails closed when the source cannot be authenticated outside the payload', async () => {
    const result = await authenticateUnifiedMemoryObservation(
      chief(),
      trustRoot({ authenticateSource: () => null }),
      NOW,
    );

    expect(result).toEqual({ ok: false, errors: ['MEMORY_SOURCE_AUTHENTICATION_REQUIRED'] });
  });

  it('rejects a source witness bound to the wrong exact source SHA', async () => {
    const result = await authenticateUnifiedMemoryObservation(
      chief(),
      trustRoot({
        authenticateSource: (record) => sourceWitness({
          continuityFingerprint: record.continuityFingerprint,
          sourceSha: 'c'.repeat(40),
        }),
      }),
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('MEMORY_SOURCE_SHA_MISMATCH');
  });

  it('rejects a witness for another normalized record even when source repository and SHA match', async () => {
    const result = await authenticateUnifiedMemoryObservation(
      chief(),
      trustRoot({
        authenticateSource: () => sourceWitness({
          continuityFingerprint: `memfp:sha256:${'c'.repeat(64)}`,
        }),
      }),
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('MEMORY_SOURCE_RECORD_MISMATCH');
  });

  it('returns immutable snapshots so callers cannot rewrite an authenticated record after validation', async () => {
    const result = await authenticateUnifiedMemoryObservation(chief(), trustRoot(), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.isFrozen(result.envelope)).toBe(true);
    expect(Object.isFrozen(result.envelope.record)).toBe(true);
    expect(Object.isFrozen(result.envelope.record.categoryKeys)).toBe(true);
    expect(Object.isFrozen(result.envelope.record.provenanceRefs)).toBe(true);
    expect(Object.isFrozen(result.envelope.sourceWitness)).toBe(true);
    expect(Object.isFrozen(result.envelope.projectAuthority)).toBe(true);

    expect(() => {
      (result.envelope.record as { summary: string | null }).summary = 'tampered after authentication';
    }).toThrow(TypeError);
    expect(() => {
      result.envelope.record.categoryKeys.push('tampered');
    }).toThrow(TypeError);
  });

  it('rejects stale project authority rather than inheriting bootstrap registration forever', async () => {
    const result = await authenticateUnifiedMemoryObservation(
      chief(),
      trustRoot({
        resolveCurrentProjectAuthority: () => projectWitness({
          observedAt: '2026-09-07T18:40:00.000Z',
          expiresAt: '2026-09-07T19:04:00.000Z',
        }),
      }),
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('MEMORY_PROJECT_WITNESS_NOT_CURRENT');
  });

  it('does not promote unverified memory even when both trust-root witnesses are current', async () => {
    const result = await authenticateUnifiedMemoryObservation(
      chief({ trust: 'submitted-unverified' }),
      trustRoot(),
      NOW,
    );

    expect(result).toEqual({ ok: false, errors: ['MEMORY_RECORD_NOT_CURRENT_DECISION_EVIDENCE'] });
  });

  it('keeps external finance-shaped memory continuity-only even with a cooperative authenticator', async () => {
    const input: NativeMemoryObservation = {
      sourceSystem: 'sleepwealth-agent',
      projectSlug: 'sleepwealth-agent',
      repository: 'jussray/SleepWealth-Agent',
      nativeKind: 'audit-entry',
      nativeId: 'audit-1',
      observedAt: '2026-09-07T18:45:00.000Z',
      sourceSha: SHA,
      trust: 'verified',
      privacy: 'private',
      categoryKeys: ['audit'],
      provenanceRefs: ['sleepwealth:audit:audit-1'],
    };

    const result = await authenticateUnifiedMemoryObservation(input, {
      authenticateSource: (record) => ({
        ...sourceWitness({ continuityFingerprint: record.continuityFingerprint }),
        sourceSystem: 'sleepwealth-agent',
        projectSlug: 'sleepwealth-agent',
        repository: 'jussray/SleepWealth-Agent',
        evidenceRef: 'auth:sleepwealth:session-1',
      }),
      resolveCurrentProjectAuthority: () => ({
        ...projectWitness(),
        projectSlug: 'sleepwealth-agent',
        repository: 'jussray/SleepWealth-Agent',
        evidenceRef: 'authority:project:sleepwealth-agent:1',
      }),
    }, NOW);

    expect(result).toEqual({ ok: false, errors: ['MEMORY_RECORD_NOT_CURRENT_DECISION_EVIDENCE'] });
  });

  it('re-reads trust-root state at the use boundary and drops an envelope when project authority disappears', async () => {
    const authenticated = await authenticateUnifiedMemoryObservation(chief(), trustRoot(), NOW);
    expect(authenticated.ok).toBe(true);
    if (!authenticated.ok) return;

    const current = await authenticatedMemoryForDecisionSupport(
      [authenticated.envelope],
      trustRoot({ resolveCurrentProjectAuthority: () => null }),
      new Date('2026-09-07T19:01:00.000Z'),
    );

    expect(current).toEqual([]);
  });

  it('re-reads record freshness at the use boundary instead of trusting a cached envelope forever', async () => {
    const authenticated = await authenticateUnifiedMemoryObservation(chief(), trustRoot(), NOW);
    expect(authenticated.ok).toBe(true);
    if (!authenticated.ok) return;

    const laterTrustRoot = trustRoot({
      authenticateSource: (record) => sourceWitness({
        continuityFingerprint: record.continuityFingerprint,
        observedAt: '2026-09-10T18:45:00.000Z',
        expiresAt: '2026-09-10T18:50:00.000Z',
      }),
      resolveCurrentProjectAuthority: () => projectWitness({
        observedAt: '2026-09-10T18:45:00.000Z',
        expiresAt: '2026-09-10T18:50:00.000Z',
      }),
    });

    const current = await authenticatedMemoryForDecisionSupport(
      [authenticated.envelope],
      laterTrustRoot,
      new Date('2026-09-10T18:46:00.000Z'),
    );

    expect(current).toEqual([]);
  });

  it('fails closed when the trust root throws instead of treating an outage as approval', async () => {
    const result = await authenticateUnifiedMemoryObservation(chief(), {
      authenticateSource: () => {
        throw new Error('provider unavailable');
      },
      resolveCurrentProjectAuthority: () => projectWitness(),
    }, NOW);

    expect(result).toEqual({ ok: false, errors: ['MEMORY_TRUST_ROOT_UNAVAILABLE'] });
  });
});
