import {readFile} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';

const targets = [
  {
    mission: 'ae933e98-ec1d-4a94-b9de-804c4fa78ab8',
    pullRequest: 38,
    branch: 'fix/private-security-exact-head',
    head: 'a8a4c4fd892f78ba8d6f239598fbe93cef80b7ca',
    evidenceState: 'runner_startup_failure',
  },
  {
    mission: '887083a2-e347-4b5f-9f11-758117752c46',
    pullRequest: 32,
    branch: 'fix/paid-order-reconciliation',
    head: '3a9f67c810fab470f4158b5f847b19a25a5b021f',
    evidenceState: 'exact-head required checks passed and evidence imported',
  },
  {
    mission: '07e07483-cb88-4ac5-9952-32fbb051f8d5',
    pullRequest: 29,
    branch: 'fix/hydrogen-build-baseline-current-main',
    head: 'ce86a74d7d6e3bc8238d1131d79d5b57c3911518',
    evidenceState: 'exact-head required checks passed and evidence imported',
  },
] as const;

const staleHeads = [
  'a77bdcd4314eb9753da6354ffd35d17df5ba6927',
  '9444483d63d1d10823b80323f3b4c796b444be0c',
  'eb23d6e364a483b28e0ea8d6577d050b293b9930',
  '94ce1b365e38718b1a8372759d6f94909cbf08de',
  '698fe6298eb6b30d0c803fac3970690644ccbc1e',
  'd534a2f2fa75e7a8bfa5ffe26a814cf4e9decb18',
] as const;

describe('storefront mission contract', () => {
  it('keeps executable verifiers and the runbook on the reconciled targets', async () => {
    const [runbook, workspaceVerifier, terminalVerifier] = await Promise.all([
      readFile(new URL('../docs/LOCAL_WORKSPACE.md', import.meta.url), 'utf8'),
      readFile(new URL('./verify-local-workspace.mjs', import.meta.url), 'utf8'),
      readFile(new URL('./verify-guarded-terminal-contract.mjs', import.meta.url), 'utf8'),
    ]);

    for (const target of targets) {
      expect(runbook).toContain(target.mission);
      expect(runbook).toContain(`| \`${target.pullRequest}\` |`);
      expect(runbook).toContain(target.branch);
      expect(runbook).toContain(target.head);
      expect(runbook).toContain(target.evidenceState);
      expect(workspaceVerifier).toContain(`head: '${target.head}'`);
      expect(terminalVerifier).toContain(target.head);
    }

    for (const staleHead of staleHeads) {
      expect(runbook).not.toContain(staleHead);
      expect(workspaceVerifier).not.toContain(staleHead);
      expect(terminalVerifier).not.toContain(staleHead);
    }

    expect(runbook).not.toContain('| `17` |');
    expect(runbook).toContain('Untold PR #17 is retired and must not be reopened, targeted, or used as evidence.');
  });
});
