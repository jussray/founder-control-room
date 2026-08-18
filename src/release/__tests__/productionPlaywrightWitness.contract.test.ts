import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);
const witness = readFileSync(
  new URL('../../../e2e/production-release-sha.spec.ts', import.meta.url),
  'utf8',
);

describe('production Playwright exact-SHA witness contract', () => {
  it('runs after smoke proof and binds Playwright to the exact approved release', () => {
    expect(workflow).toMatch(/\n  production-playwright:\n/);
    expect(workflow).toMatch(
      /production-playwright:[\s\S]*?needs: smoke-test[\s\S]*?EXPECTED_RELEASE_SHA: \$\{\{ inputs\.expected_head_sha \}\}/,
    );
    expect(workflow).toMatch(
      /production-playwright:[\s\S]*?PRODUCTION_RELEASE_WITNESS_REQUIRED: 'true'/,
    );
    expect(workflow).toMatch(
      /npx playwright test e2e\/production-release-sha\.spec\.ts --reporter=list/,
    );
  });

  it('blocks proof-of-ship until the production Playwright witness is green', () => {
    const proofOfShipStart = workflow.indexOf('  proof-of-ship:');
    const reconcileStart = workflow.indexOf('  # ── 5.', proofOfShipStart);
    expect(proofOfShipStart).toBeGreaterThan(-1);
    expect(reconcileStart).toBeGreaterThan(proofOfShipStart);

    const proofOfShip = workflow.slice(proofOfShipStart, reconcileStart);
    expect(proofOfShip).toMatch(/needs: production-playwright/);
    expect(proofOfShip).toMatch(/if: needs\.production-playwright\.result == 'success'/);
  });

  it('makes runtime identity agreement a prerequisite for the browser journey', () => {
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
