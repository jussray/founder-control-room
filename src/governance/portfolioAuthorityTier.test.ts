import { describe, expect, it } from 'vitest';
import {
  CONTINUITY_ONLY_PROJECTS,
  EXTERNAL_PROJECTS,
  PORTFOLIO_PROJECTS,
  QUARANTINED_REPOSITORIES,
} from '../config/portfolio.js';
import {
  portfolioGovernanceProfile,
  portfolioHardConstraintViolations,
  portfolioRepositoryAuthorityClass,
} from './portfolioGovernanceProfiles.js';

describe('portfolio authority tier membrane', () => {
  it('gives every authority-bearing active repository a governance profile', () => {
    const missing = PORTFOLIO_PROJECTS
      .filter((project) => !portfolioGovernanceProfile(project.repository))
      .map((project) => project.repository);

    expect(missing).toEqual([]);
  });

  it('binds Sync Party to the active governance registry and production-proof floor', () => {
    const profile = portfolioGovernanceProfile('jussray/sync-party-game');

    expect(portfolioRepositoryAuthorityClass('jussray/sync-party-game')).toBe('active');
    expect(profile?.id).toBe('sync-party');
    expect(profile?.requiredClaims.production_claim).toEqual([
      'exact_production_version_verified',
      'multiplayer_runtime_verified',
    ]);
  });

  it('keeps external repositories observational unless separately promoted into the active authority registry', () => {
    expect(EXTERNAL_PROJECTS.some((project) => project.repository === 'jussray/solcontinuity')).toBe(true);
    expect(
      portfolioHardConstraintViolations(
        'jussray/solcontinuity',
        'deploy',
        'R2',
        'consequential',
      ),
    ).toContain('external repository has zero FCR mutation authority');

    expect(
      portfolioHardConstraintViolations(
        'jussray/SleepWealth-Agent',
        'paper_execution',
        'R2',
        'consequential',
      ),
    ).toContain('external repository has zero FCR mutation authority');
  });

  it('keeps Bip Jr continuity-only and preserves the quarantined legacy alias without authority', () => {
    expect(CONTINUITY_ONLY_PROJECTS.some((project) => project.repository === 'jussray/Bip-Jr')).toBe(true);
    expect(portfolioGovernanceProfile('jussray/Bip-Jr')?.id).toBe('sekret-bip-jr');
    expect(portfolioRepositoryAuthorityClass('jussray/Bip-Jr')).toBe('continuity-only');
    expect(
      portfolioHardConstraintViolations(
        'jussray/Bip-Jr',
        'authority_change',
        'R2',
        'consequential',
      ),
    ).toContain('continuity-only repository has zero FCR mutation authority');

    expect(QUARANTINED_REPOSITORIES.has('jussray/Se-kretBip')).toBe(true);
    expect(portfolioGovernanceProfile('jussray/Se-kretBip')?.id).toBe('sekret-bip-jr');
    expect(portfolioRepositoryAuthorityClass('jussray/Se-kretBip')).toBe('quarantined');
    expect(
      portfolioHardConstraintViolations(
        'jussray/Se-kretBip',
        'enable-public-social',
        'R2',
        'consequential',
      ),
    ).toEqual(expect.arrayContaining([
      'repository is quarantined and cannot receive FCR mutation authority',
      'project profile explicitly blocks action: enable-public-social',
    ]));
  });

  it('never lets an unknown repository acquire mutation authority from a stale governance profile', () => {
    expect(portfolioRepositoryAuthorityClass('jussray/not-registered')).toBe('unknown');
    expect(
      portfolioHardConstraintViolations(
        'jussray/not-registered',
        'deploy',
        'R2',
        'consequential',
      ),
    ).toContain('repository has no governed portfolio profile');
  });
});
