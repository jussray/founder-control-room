import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const playwrightWorkflow = readFileSync(
  new URL('../../../.github/workflows/playwright.yml', import.meta.url),
  'utf8',
);
const manualWitnessWorkflow = readFileSync(
  new URL('../../../.github/workflows/exact-sha-production-witness.yml', import.meta.url),
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
    expect(playwrightWorkflow).toContain('ref: ${{ github.sha }}');
    expect(playwrightWorkflow).not.toContain(
      'ref: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(playwrightWorkflow).toContain(
      'npx playwright test e2e/production-release-sha.spec.ts --reporter=list',
    );
  });

  it('keeps normal PR and push E2E separate from the post-deploy witness', () => {
    expect(playwrightWorkflow).toContain("if: github.event_name != 'workflow_run'");
  });

  it('uses the canonical public API origin instead of a duplicate secret', () => {
    expect(playwrightWorkflow).toContain('DEPLOY_URL: https://api.foundercontrolroom.org');
    expect(playwrightWorkflow).not.toContain('DEPLOY_URL: ${{ secrets.DEPLOY_URL }}');
  });

  it('proves one exact release before and after the browser journey', () => {
    const beforeDirect = witness.indexOf("readDirectIdentity('before-browser')");
    const beforePublic = witness.indexOf("readPublicIdentity('before-browser')");
    const browserJourney = witness.indexOf("page.goto(`${publicUrl}/`,");
    const afterDirect = witness.indexOf("readDirectIdentity('after-browser')");
    const afterPublic = witness.indexOf("readPublicIdentity('after-browser')");
    const receipt = witness.indexOf("testInfo.attach('production-release-witness.json'");

    expect(beforeDirect).toBeGreaterThan(-1);
    expect(beforePublic).toBeGreaterThan(beforeDirect);
    expect(browserJourney).toBeGreaterThan(beforePublic);
    expect(afterDirect).toBeGreaterThan(browserJourney);
    expect(afterPublic).toBeGreaterThan(afterDirect);
    expect(receipt).toBeGreaterThan(afterPublic);
    expect(witness).toContain('expect(body.gitSha).toBe(expectedReleaseSha)');
    expect(witness).toContain('directWorkerGitShaBefore');
    expect(witness).toContain('publicProxyGitShaBefore');
    expect(witness).toContain('directWorkerGitShaAfter');
    expect(witness).toContain('publicProxyGitShaAfter');
    expect(witness).toContain('production-release-witness.png');
  });

  it('offers a manual current-main witness without deploy or publication authority', () => {
    expect(manualWitnessWorkflow).toContain('workflow_dispatch:');
    expect(manualWitnessWorkflow).toContain('contents: read');
    expect(manualWitnessWorkflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(manualWitnessWorkflow).toContain('ref: ${{ github.sha }}');
    expect(manualWitnessWorkflow).toContain(
      'EXPECTED_RELEASE_SHA: ${{ inputs.expected_sha }}',
    );
    expect(manualWitnessWorkflow).toContain('test "$EXPECTED_RELEASE_SHA" = "$GITHUB_SHA"');
    expect(manualWitnessWorkflow).toContain(
      'npx playwright test e2e/production-release-sha.spec.ts --reporter=list',
    );
    expect(manualWitnessWorkflow).not.toContain('PUBLISH_ALLOWED');
    expect(manualWitnessWorkflow).not.toContain('secrets.');
    expect(manualWitnessWorkflow).not.toContain('wrangler deploy');
    expect(manualWitnessWorkflow).not.toContain('cloudflare/pages-action');
    expect(manualWitnessWorkflow).not.toContain('ZAPIER');
    expect(manualWitnessWorkflow).not.toContain('POSTIZ');
  });
});
