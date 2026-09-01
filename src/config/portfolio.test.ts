import { describe, expect, it } from 'vitest';
import {
  ACTIVE_PROJECT_SLUGS,
  EXTERNAL_PROJECTS,
  EXTERNAL_PROJECT_SLUGS,
  PORTFOLIO_PROJECTS,
  QUARANTINED_REPOSITORIES,
  getKnownProject,
  getPortfolioProject,
} from './portfolio.js';

describe('founder repository index', () => {
  it('indexes known external founder projects without exposing them through the authority lookup', () => {
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

  it('binds the private hair repository to the database registry slug', () => {
    expect(getPortfolioProject('juss-beautiful-hair-private')).toMatchObject({
      slug: 'juss-beautiful-hair-private',
      repository: 'jussray/jbh-private',
      status: 'active',
    });
    expect(getPortfolioProject('jbh-private')).toBeUndefined();
  });

  it('does not allow one repository to occupy more than one known project identity', () => {
    const known = [...PORTFOLIO_PROJECTS, ...EXTERNAL_PROJECTS];
    const normalized = known.map((project) => project.repository.toLowerCase());
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it('keeps known legacy and do-not-touch repositories quarantined from every project index', () => {
    expect(QUARANTINED_REPOSITORIES.has('jussray/do-not-use')).toBe(true);
    expect(QUARANTINED_REPOSITORIES.has("jussray/don-t-touch-this-one")).toBe(true);
    for (const project of [...PORTFOLIO_PROJECTS, ...EXTERNAL_PROJECTS]) {
      expect(QUARANTINED_REPOSITORIES.has(project.repository)).toBe(false);
    }
  });
});
