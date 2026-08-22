import { describe, expect, it } from 'vitest';
import { FOUNDER_OS_LAB_PROJECT_ADAPTERS } from '../projectAdapters.js';
import { assessProjectAdapterFreshness } from '../projectAdapterFreshness.js';

const foundAdapter = FOUNDER_OS_LAB_PROJECT_ADAPTERS.find(
  (candidate) => candidate.id === 'sekret-bip',
);
if (!foundAdapter) throw new Error('sekret-bip adapter missing');
const ADAPTER = foundAdapter;

function assess(overrides: Partial<Parameters<typeof assessProjectAdapterFreshness>[0]> = {}) {
  return assessProjectAdapterFreshness({
    repository: ADAPTER.repository,
    auditedHead: ADAPTER.auditedSourceHead,
    currentHead: ADAPTER.auditedSourceHead,
    auditedContractBlobs: ADAPTER.auditedContractBlobs,
    observedContractBlobs: { ...ADAPTER.auditedContractBlobs },
    ...overrides,
  });
}

describe('project adapter freshness', () => {
  it('verifies every checked-in adapter only when current main and every required contract blob match', () => {
    for (const adapter of FOUNDER_OS_LAB_PROJECT_ADAPTERS) {
      const result = assessProjectAdapterFreshness({
        repository: adapter.repository,
        auditedHead: adapter.auditedSourceHead,
        currentHead: adapter.auditedSourceHead,
        auditedContractBlobs: adapter.auditedContractBlobs,
        observedContractBlobs: { ...adapter.auditedContractBlobs },
      });

      expect(result).toMatchObject({
        state: 'verified',
        freshness: 'fresh',
        recommendation: 'hold',
        sourceHeadMatchesAudited: true,
        contractPathsMissing: [],
        contractPathsDrifted: [],
        founderReviewRequired: true,
        promotionAllowed: false,
        mutationAuthorized: false,
        blocker: null,
      });
      expect(result.contractPathsRequired).toEqual(Object.keys(adapter.auditedContractBlobs));
      expect(result.nextAction).not.toContain('Se’kret Bip');
    }
  });

  it('stays verified when authoritative main advances but required project contracts are unchanged', () => {
    const result = assess({
      currentHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });

    expect(result.state).toBe('verified');
    expect(result.freshness).toBe('fresh');
    expect(result.sourceHeadMatchesAudited).toBe(false);
    expect(result.contractPathsMissing).toEqual([]);
    expect(result.contractPathsDrifted).toEqual([]);
    expect(result.blocker).toBeNull();
    expect(result.reasons).toContain(
      'Repository main advanced, but every required project contract blob still matches the audited adapter snapshot.',
    );
  });

  it('requires review when authoritative main advances and a required project contract drifts', () => {
    const observed = {
      ...ADAPTER.auditedContractBlobs,
      'app/index.tsx': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    };
    const result = assess({
      currentHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      observedContractBlobs: observed,
    });

    expect(result.state).toBe('attention');
    expect(result.freshness).toBe('stale');
    expect(result.recommendation).toBe('review');
    expect(result.sourceHeadMatchesAudited).toBe(false);
    expect(result.contractPathsDrifted).toEqual(['app/index.tsx']);
    expect(result.blocker).toContain('Repository main advanced and required project contract blobs drifted');
    expect(result.mutationAuthorized).toBe(false);
  });

  it('requires every audited contract blob from the exact head', () => {
    const observed = { ...ADAPTER.auditedContractBlobs } as Record<string, string>;
    delete observed['screens/WebWelcomeScreen.tsx'];
    const result = assess({ observedContractBlobs: observed });

    expect(result.state).toBe('unknown');
    expect(result.freshness).toBe('missing');
    expect(result.contractPathsMissing).toEqual(['screens/WebWelcomeScreen.tsx']);
  });

  it('requires semantic review when a required blob differs at the audited head', () => {
    const observed = {
      ...ADAPTER.auditedContractBlobs,
      'app/index.tsx': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    };
    const result = assess({ observedContractBlobs: observed });

    expect(result.state).toBe('attention');
    expect(result.freshness).toBe('fresh');
    expect(result.recommendation).toBe('review');
    expect(result.contractPathsDrifted).toEqual(['app/index.tsx']);
    expect(result.mutationAuthorized).toBe(false);
  });

  it('does not convert malformed Git evidence into a freshness claim', () => {
    const result = assess({ currentHead: 'not-a-sha' });

    expect(result.state).toBe('unknown');
    expect(result.freshness).toBe('invalid');
    expect(result.blocker).toContain('current repository head is invalid');
  });
});
