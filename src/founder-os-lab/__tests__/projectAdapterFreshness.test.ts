import { describe, expect, it } from 'vitest';
import { FOUNDER_OS_LAB_PROJECT_ADAPTERS } from '../projectAdapters.js';
import { assessProjectAdapterFreshness } from '../projectAdapterFreshness.js';

const ADAPTER = FOUNDER_OS_LAB_PROJECT_ADAPTERS.find((candidate) => candidate.id === 'sekret-bip');
if (!ADAPTER) throw new Error('sekret-bip adapter missing');

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
  it('verifies only when current main and every required contract blob match the audit', () => {
    const result = assess();

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
    expect(result.contractPathsRequired).toEqual(Object.keys(ADAPTER.auditedContractBlobs));
  });

  it('fails stale when authoritative main advances beyond the audited head', () => {
    const result = assess({
      currentHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });

    expect(result.state).toBe('stale');
    expect(result.freshness).toBe('stale');
    expect(result.sourceHeadMatchesAudited).toBe(false);
    expect(result.blocker).toContain('no longer matches audited adapter head');
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
