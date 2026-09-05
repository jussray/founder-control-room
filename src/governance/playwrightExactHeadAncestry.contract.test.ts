import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/playwright.yml', 'utf8');

describe('Playwright exact-head ancestry contract', () => {
  it('fails stale pull-request heads before candidate-dependent proof steps', () => {
    expect(workflow).toContain("PR_BASE_SHA: ${{ github.event.pull_request.base.sha || '' }}");
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('git merge-base --is-ancestor "$PR_BASE_SHA" "$EXPECTED_HEAD_SHA"');
    expect(workflow).toContain('STALE_BASE: $PR_BASE_SHA is not an ancestor of $EXPECTED_HEAD_SHA');

    const ancestryGate = workflow.indexOf('Record and verify exact head and base ancestry');
    const dependencyInstall = workflow.indexOf('Install dependencies');
    const evidenceProof = workflow.indexOf('Prove Evidence Trust Plane');

    expect(ancestryGate).toBeGreaterThan(-1);
    expect(dependencyInstall).toBeGreaterThan(ancestryGate);
    expect(evidenceProof).toBeGreaterThan(dependencyInstall);
  });
});
