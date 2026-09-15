import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const deployWorkflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);
const pagesWorkflow = readFileSync(
  new URL('../../../.github/workflows/pages-production-release.yml', import.meta.url),
  'utf8',
);
const downstreamReceiptWorkflow = readFileSync(
  new URL('../../../.github/workflows/proof-of-ship-downstream-receipt.yml', import.meta.url),
  'utf8',
);
const governancePreflight = readFileSync(
  new URL('../../../scripts/audit-github-governance-preflight.mjs', import.meta.url),
  'utf8',
);

describe('portfolio authority boundary', () => {
  it('keeps the canonical public API origin out of every release-workflow secret interface', () => {
    expect(pagesWorkflow).toContain('DEPLOY_URL: https://api.foundercontrolroom.org');
    expect(downstreamReceiptWorkflow).toContain('DEPLOY_URL: https://api.foundercontrolroom.org');
    expect(pagesWorkflow).not.toContain('DEPLOY_URL: ${{ secrets.DEPLOY_URL }}');
    expect(downstreamReceiptWorkflow).not.toContain('DEPLOY_URL: ${{ secrets.DEPLOY_URL }}');
    expect(pagesWorkflow).not.toMatch(/\n\s{6}DEPLOY_URL:\n\s{8}required:\s*true/);
  });

  it('keeps the downstream MCP receipt credential secret-bearing while the API origin stays public', () => {
    expect(downstreamReceiptWorkflow).toContain(
      'FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: ${{ secrets.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN }}',
    );
    expect(downstreamReceiptWorkflow).toContain('createHmac("sha256", process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN)');
  });

  it('does not invent OIDC for the documented Cloudflare Wrangler deployment path', () => {
    expect(deployWorkflow).toContain('cloudflare/wrangler-action@v3');
    expect(deployWorkflow).toContain('apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(deployWorkflow).not.toContain('id-token: write');
    expect(pagesWorkflow).not.toContain('id-token: write');
  });

  it('does not introduce deploy-key or SSH-private-key authority into production workflows', () => {
    const productionAuthoritySource = `${deployWorkflow}\n${pagesWorkflow}\n${downstreamReceiptWorkflow}`;
    expect(productionAuthoritySource).not.toMatch(/DEPLOY_KEY|SSH_PRIVATE_KEY/);
  });

  it('models the GitHub governance bypass as one pull-request-only trusted App, never a deploy key', () => {
    expect(governancePreflight).toContain("actorType: 'Integration'");
    expect(governancePreflight).toContain("bypassMode: 'pull_request'");
    expect(governancePreflight).not.toContain("actorType: 'DeployKey'");
  });
});
