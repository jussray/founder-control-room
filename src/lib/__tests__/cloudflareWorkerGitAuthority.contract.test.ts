import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const authorityWorkflow = readFileSync(
  new URL('../../../.github/workflows/cloudflare-build-diagnostic.yml', import.meta.url),
  'utf8',
);
const deployWorkflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);
const authorityScript = readFileSync(
  new URL('../../../scripts/inspect-cloudflare-build.mjs', import.meta.url),
  'utf8',
);

describe('Cloudflare Worker Git authority contract', () => {
  it('keeps the provider audit manual and exact-current-main bound', () => {
    expect(authorityWorkflow).toMatch(/^on:\n  workflow_dispatch:/m);
    expect(authorityWorkflow).not.toMatch(/^  push:/m);
    expect(authorityWorkflow).toContain('CF_EXPECT_WORKER_GIT_MODE: disconnected-or-non-promoting');
    expect(authorityWorkflow).toContain('FCR_CLOUDFLARE_BUILDS_USER_TOKEN');
    expect(authorityWorkflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
  });

  it('keeps read-only Workers Builds inspection credentials separate from deploy credentials', () => {
    expect(deployWorkflow).toContain('apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(deployWorkflow).toContain('accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
    expect(deployWorkflow).not.toContain('FCR_CLOUDFLARE_BUILDS_USER_TOKEN');
    expect(authorityWorkflow).not.toContain('secrets.CLOUDFLARE_API_TOKEN');
  });

  it('treats disconnected or non-promoting Worker Git as healthy authority state', () => {
    expect(authorityScript).toContain('/builds/workers/${worker.tag}/triggers');
    expect(authorityScript).toContain('wrangler\\s+versions\\s+upload');
    expect(authorityScript).toContain('WORKER_GIT_AUTO_DEPLOY_AUTHORITY_CONFLICT');
    expect(authorityScript).toContain('canonicalProductionAuthority: "github-manual-deploy-workflow"');
    expect(authorityScript).toContain('receipt.workerGitAuthority.state = "disconnected"');
    expect(authorityScript).toContain('receipt.workerGitAuthority.state = "non-promoting"');
    expect(authorityScript).not.toContain('No Cloudflare build matched exact head');
    expect(authorityScript).not.toContain('PUBLIC_ORIGIN_TRANSPORT_FAILURE');
  });
});
