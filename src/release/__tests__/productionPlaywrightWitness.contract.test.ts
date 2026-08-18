import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const playwrightWorkflow = readFileSync(
  new URL('../../../.github/workflows/playwright.yml', import.meta.url),
  'utf8',
);
const witness = readFileSync(
  new URL('../../../e2e/production-release-sha.spec.ts', import.meta.url),
  'utf8',
);

describe('production Playwright exact-SHA witness contract', () => {
  it('runs after a successful Deploy workflow and uses that run head as release identity', () => {
    expect(playwrightWorkflow).toContain('workflows: [Deploy]');
    expect(playwrightWorkflow).toContain('types: [completed]');
    expect(playwrightWorkflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(playwrightWorkflow).toContain("PRODUCTION_RELEASE_WITNESS_REQUIRED: 'true'");
    expect(playwrightWorkflow).toContain(
      'EXPECTED_RELEASE_SHA: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(playwrightWorkflow).toContain(
      'ref: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(playwrightWorkflow).toContain(
      'npx playwright test e2e/production-release-sha.spec.ts --reporter=list',
    );
  });

  it('keeps normal PR and push E2E separate from the post-deploy witness', () => {
    expect(playwrightWorkflow).toContain("if: github.event_name != 'workflow_run'");
  });

  it('proves runtime identity before accepting the browser journey', () => {
    const directIdentity = witness.indexOf('expect(directVersion.gitSha).toBe(expectedReleaseSha)');
    const publicIdentity = witness.indexOf('expect(publicVersion.gitSha).toBe(expectedReleaseSha)');
    const browserJourney = witness.indexOf("page.goto(`${publicUrl}/`,");

    expect(directIdentity).toBeGreaterThan(-1);
    expect(publicIdentity).toBeGreaterThan(directIdentity);
    expect(browserJourney).toBeGreaterThan(publicIdentity);
    expect(witness).toContain('production-release-witness.json');
    expect(witness).toContain('production-release-witness.png');
  });
});
