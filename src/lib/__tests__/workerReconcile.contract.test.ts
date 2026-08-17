import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/worker-reconcile.yml', import.meta.url),
  'utf8',
);
const credentialContract = readFileSync(
  new URL('../../../scripts/provider-credential-contract.mjs', import.meta.url),
  'utf8',
);

describe('canonical Worker reconcile credential preflight contract', () => {
  it('binds the production reconcile to the canonical Cloudflare deploy token', () => {
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(workflow).toContain('wrangler secret put FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON');
    expect(workflow).toContain('--config wrangler.worker.toml');
    expect(workflow).toContain('apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
  });

  it('fails closed through the shared raw credential contract before Wrangler mutation without printing the token', () => {
    const preflightIndex = workflow.indexOf('Preflight canonical Worker token with shared contract');
    const secretMutationIndex = workflow.indexOf('Force publication grant disabled on canonical Worker');
    const deployIndex = workflow.indexOf('Deploy only the canonical Worker configuration');

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(secretMutationIndex).toBeGreaterThan(preflightIndex);
    expect(deployIndex).toBeGreaterThan(secretMutationIndex);
    expect(workflow).toContain('node scripts/provider-credential-contract.mjs');
    expect(workflow).toContain('--env CLOUDFLARE_API_TOKEN');
    expect(workflow).toContain('--purpose canonical-worker-deploy');
    expect(workflow).toContain('test-results/provider-credentials/worker-reconcile.json');

    expect(credentialContract).toContain("classification = 'non-ascii'");
    expect(credentialContract).toContain("classification = 'whitespace'");
    expect(credentialContract).toContain("classification = 'bearer-prefix'");
    expect(credentialContract).toContain("classification = 'assignment-wrapper'");
    expect(credentialContract).toContain("classification = 'wrapping-quotes'");
    expect(credentialContract).toContain("classification = 'account-id-substitution'");
    expect(credentialContract).not.toContain('console.log(token)');
    expect(workflow).not.toContain('echo "$CLOUDFLARE_API_TOKEN"');
  });

  it('preserves exact-head authority and the existing runtime proof boundary', () => {
    expect(workflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
    expect(workflow).toContain('needs: authority-gate');
    expect(workflow).toContain('needs: worker-deploy');
    expect(workflow).toContain('api.foundercontrolroom.org did not prove canonical service identity and exact deployed SHA');
    expect(workflow).toContain('.founderSignalAutomationGrant.configured == true');
    expect(workflow).toContain('.founderSignalAutomationGrant.enabled == false');
    expect(workflow).toContain('exactHeadVerified: ($live_sha == $expected_sha)');
  });
});