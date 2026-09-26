import { describe, expect, it } from 'vitest';
import {
  ACTIVE_PROJECT_SLUGS,
  CONTINUITY_ONLY_PROJECTS,
  CONTINUITY_ONLY_PROJECT_SLUGS,
  EXTERNAL_PROJECTS,
  EXTERNAL_PROJECT_SLUGS,
  PORTFOLIO_PROJECTS,
  QUARANTINED_REPOSITORIES,
  getKnownProject,
  getPortfolioProject,
} from './portfolio.js';

describe('founder repository index', () => {
  it('keeps challenge-stack-proven external projects distinct from continuity-only identities', () => {
    const expectedExternal = [
      ['think-tank', 'jussray/THINK-TANK'],
      ['solcontinuity', 'jussray/solcontinuity'],
      ['sleepwealth-agent', 'jussray/SleepWealth-Agent'],
      ['sweats', 'jussray/Sweats'],
    ] as const;

    for (const [slug, repository] of expectedExternal) {
      expect(getKnownProject(slug)).toMatchObject({
        slug,
        repository,
        status: 'external',
      });
      expect(getPortfolioProject(slug)).toBeUndefined();
      expect(EXTERNAL_PROJECT_SLUGS.has(slug)).toBe(true);
      expect(CONTINUITY_ONLY_PROJECT_SLUGS.has(slug)).toBe(false);
      expect(ACTIVE_PROJECT_SLUGS.has(slug)).toBe(false);
    }
  });

  it('indexes unverified portfolio subjects for continuity without claiming inherited challenge-stack state', () => {
    const expectedContinuityOnly = [
      ['bip-jr', 'jussray/Bip-Jr'],
      ['truth-compass', 'jussray/truth-compass'],
      ['truth-weaver', 'jussray/truth-weaver'],
      ['alexa-commerce-engine', 'jussray/alexa-commerce-engine-'],
      ['sync-party', 'jussray/sync-party-game'],
    ] as const;

    for (const [slug, repository] of expectedContinuityOnly) {
      expect(getKnownProject(slug)).toMatchObject({
        slug,
        repository,
        status: 'continuity-only',
      });
      expect(getPortfolioProject(slug)).toBeUndefined();
      expect(CONTINUITY_ONLY_PROJECT_SLUGS.has(slug)).toBe(true);
      expect(EXTERNAL_PROJECT_SLUGS.has(slug)).toBe(false);
      expect(ACTIVE_PROJECT_SLUGS.has(slug)).toBe(false);
    }
  });

  it('keeps the historical PORTFOLIO_PROJECTS allowlist active-only', () => {
    expect(PORTFOLIO_PROJECTS.every((project) => project.status === 'active')).toBe(true);
    expect([...ACTIVE_PROJECT_SLUGS].sort()).toEqual([
      'chief-ai-machine',
      'founder-control-room',
      'juss-beautiful-hair',
      'juss-beautiful-hair-private',
      'l99',
      'promptos',
      'sekret-bip',
      'untold-stories',
    ]);
  });

  it('records mobile store intent without promoting repository authority', () => {
    const intended = {
      'sekret-bip': 'native-existing',
      'juss-beautiful-hair': 'hybrid-native-candidate',
      'juss-beautiful-hair-private': 'native-client-required',
      l99: 'native-client-required',
      'chief-ai-machine': 'native-client-required',
      'untold-stories': 'hybrid-native-candidate',
      'founder-control-room': 'native-client-required',
      promptos: 'native-client-required',
      'think-tank': 'hybrid-native-candidate',
      'sleepwealth-agent': 'native-client-required',
      sweats: 'hybrid-native-candidate',
      'bip-jr': 'canonical-port-required',
      'truth-compass': 'native-client-required',
      'truth-weaver': 'native-client-required',
      'alexa-commerce-engine': 'native-client-required',
      'sync-party': 'hybrid-native-candidate',
    } as const;

    for (const [slug, carrierStrategy] of Object.entries(intended)) {
      expect(getKnownProject(slug)).toMatchObject({
        mobileDistribution: {
          targetStores: ['apple-app-store', 'google-play'],
          carrierStrategy,
        },
      });
    }

    expect(getKnownProject('solcontinuity')?.mobileDistribution).toBeUndefined();
    expect(getPortfolioProject('truth-compass')).toBeUndefined();
    expect(getPortfolioProject('sync-party')).toBeUndefined();
  });

  it('binds the private hair repository to the database registry slug', () => {
    expect(getPortfolioProject('juss-beautiful-hair-private')).toMatchObject({
      slug: 'juss-beautiful-hair-private',
      repository: 'jussray/jbh-private',
      status: 'active',
    });
    expect(getPortfolioProject('jbh-private')).toBeUndefined();
  });

  it('does not allow one repository to occupy more than one known project identity', () => {
    const known = [...PORTFOLIO_PROJECTS, ...EXTERNAL_PROJECTS, ...CONTINUITY_ONLY_PROJECTS];
    const normalized = known.map((project) => project.repository.toLowerCase());
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it('keeps known legacy and do-not-touch repositories quarantined from every project index', () => {
    expect(QUARANTINED_REPOSITORIES.has('jussray/do-not-use')).toBe(true);
    expect(QUARANTINED_REPOSITORIES.has("jussray/don-t-touch-this-one")).toBe(true);
    for (const project of [...PORTFOLIO_PROJECTS, ...EXTERNAL_PROJECTS, ...CONTINUITY_ONLY_PROJECTS]) {
      expect(QUARANTINED_REPOSITORIES.has(project.repository)).toBe(false);
    }
  });
});
