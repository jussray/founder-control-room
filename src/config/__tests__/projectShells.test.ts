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
        expect.arrayContaining(['founder-intent', 'authority', 'evidence', 'outcome', 'recovery', 'continuity', 'next-gate']),
      );
      expect(shell.emphasis.every((family) => CONTAINER_FAMILIES.includes(family))).toBe(true);
    }
  });

  it('keeps Chief and PromptOS as individualized capability shells, not rival operating systems', () => {
    expect(getProjectShell('chief-ai-machine')).toMatchObject({
      identity: expect.stringContaining('inside FCR'),
      primaryOutcome: expect.stringContaining('without becoming a separate founder operating system'),
    });
    expect(getProjectShell('promptos')).toMatchObject({
      identity: expect.stringContaining('inside FCR'),
      primaryOutcome: expect.stringContaining('without becoming a parallel operating system'),
    });
  });

  it('preserves Se’kret Bip as a distinct customer-product boundary', () => {
    expect(getProjectShell('sekret-bip')).toMatchObject({
      identity: expect.stringContaining('isolated privacy and safety boundaries'),
      projectSpecificViews: expect.arrayContaining(['safety', 'mobile-runtime', 'playwright-proof']),
    });
  });
});
