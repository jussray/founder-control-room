import { describe, expect, it } from 'vitest';
import { PORTFOLIO_PROJECTS } from '../portfolio.js';
import {
  CONTAINER_FAMILIES,
  PROJECT_SHELLS,
  assertProjectShellCoverage,
  getProjectShell,
} from '../projectShells.js';

describe('project-specific FCR shells', () => {
  it('covers every authority-bearing project exactly once', () => {
    expect(() => assertProjectShellCoverage()).not.toThrow();
    expect(new Set(PROJECT_SHELLS.map((shell) => shell.projectSlug)).size).toBe(PROJECT_SHELLS.length);
    expect(PROJECT_SHELLS.length).toBe(PORTFOLIO_PROJECTS.length);
  });

  it('keeps one shared FCR container model while allowing project-specific views', () => {
    for (const shell of PROJECT_SHELLS) {
      expect(shell.projectSpecificViews.length).toBeGreaterThan(0);
      expect(shell.inheritedFcrContracts).toEqual(
        expect.arrayContaining([
          'founder-intent',
          'authority',
          'evidence',
          'outcome',
          'recovery',
          'continuity',
          'next-gate',
          'growth-opportunity-intelligence',
        ]),
      );
      expect(shell.emphasis.every((family) => CONTAINER_FAMILIES.includes(family))).toBe(true);
    }
  });

  it('represents Chief and PromptOS as standalone peers rather than FCR submodules', () => {
    const chief = getProjectShell('chief-ai-machine');
    const promptos = getProjectShell('promptos');

    expect(chief).toMatchObject({
      identity: expect.stringContaining('standalone Chief'),
      primaryOutcome: expect.stringContaining('both systems remain independently operable'),
    });
    expect(promptos).toMatchObject({
      identity: expect.stringContaining('standalone PromptOS'),
      primaryOutcome: expect.stringContaining('both systems remain independently operable'),
    });
    expect(chief?.identity).not.toContain('capability inside FCR');
    expect(promptos?.identity).not.toContain('capability inside FCR');
  });

  it('preserves Se’kret Bip as a distinct customer-product boundary', () => {
    expect(getProjectShell('sekret-bip')).toMatchObject({
      identity: expect.stringContaining('isolated privacy and safety boundaries'),
      projectSpecificViews: expect.arrayContaining(['safety', 'mobile-runtime', 'playwright-proof']),
    });
  });

  it('treats Founder Control Room as a full standalone operating/build environment and first-party business', () => {
    expect(getProjectShell('founder-control-room')).toMatchObject({
      identity: expect.stringContaining('standalone founder operating and build intelligence'),
      primaryOutcome: expect.stringContaining('with or without external AI providers'),
      projectSpecificViews: expect.arrayContaining([
        'catalog',
        'storefront-runtime',
        'shopify',
        'checkout',
        'revenue-proof',
        'playwright-proof',
      ]),
    });
  });
});
