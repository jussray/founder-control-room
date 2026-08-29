import { describe, expect, it } from 'vitest';
import {
  ACTIVE_PROJECT_SLUGS,
  EXTERNAL_PROJECT_SLUGS,
  PORTFOLIO_PROJECTS,
  QUARANTINED_REPOSITORIES,
  getPortfolioProject,
} from './portfolio.js';

describe('founder repository index', () => {
  it('indexes known external founder projects without granting active portfolio authority', () => {
    const expectedExternal = [
      ['think-tank', 'jussray/THINK-TANK'],
      ['solcontinuity', 'jussray/solcontinuity'],
      ['sleepwealth-agent', 'jussray/SleepWealth-Agent'],
      ['sweats', 'jussray/Sweats'],
    ] as const;

    for (const [slug, repository] of expectedExternal) {
      expect(getPortfolioProject(slug)).toMatchObject({
        slug,
        repository,
        status: 'external',
      });
      expect(EXTERNAL_PROJECT_SLUGS.has(slug)).toBe(true);
      expect(ACTIVE_PROJECT_SLUGS.has(slug)).toBe(false);
    }
  });

  it('keeps active authority limited to explicitly registered projects', () => {
    expect([...ACTIVE_PROJECT_SLUGS].sort()).toEqual([
      'chief-ai-machine',
      'founder-control-room',
      'jbh-private',
      'juss-beautiful-hair',
      'l99',
      'promptos',
      'sekret-bip',
      'untold-stories',
    ]);
  });

  it('does not allow one repository to occupy more than one indexed project identity', () => {
    const normalized = PORTFOLIO_PROJECTS.map((project) => project.repository.toLowerCase());
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it('keeps known legacy and do-not-touch repositories quarantined from the project index', () => {
    expect(QUARANTINED_REPOSITORIES.has('jussray/do-not-use')).toBe(true);
    expect(QUARANTINED_REPOSITORIES.has("jussray/don-t-touch-this-one")).toBe(true);
    for (const project of PORTFOLIO_PROJECTS) {
      expect(QUARANTINED_REPOSITORIES.has(project.repository)).toBe(false);
    }
  });
});
