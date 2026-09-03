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
const workerConfig = readFileSync(
  new URL('../../../wrangler.worker.toml', import.meta.url),
  'utf8',
);
const authorityPolicy = JSON.parse(
  readFileSync(
    new URL('../../../config/cloudflare-worker-git-authority-policy.json', import.meta.url),
    'utf8',
  ),
);

describe('Cloudflare Worker Git authority contract', () => {
  it('keeps the provider audit manual and exact-current-main bound', () => {
    expect(authorityWorkflow).toMatch(/^on:\n  workflow_dispatch:/m);
    expect(authorityWorkflow).not.toMatch(/^  push:/m);
    expect(authorityWorkflow).toContain(
      'CF_WORKER_GIT_AUTHORITY_POLICY: config/cloudflare-worker-git-authority-policy.json',
    );
    expect(authorityWorkflow).not.toContain('CF_EXPECT_WORKER_GIT_MODE');
    expect(authorityWorkflow).toContain('FCR_CLOUDFLARE_BUILDS_USER_TOKEN');
    expect(authorityWorkflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
  });

  it('binds desired Worker identity to canonical Worker config instead of provider observation', () => {
    const canonicalWorkerName = workerConfig.match(/^name\s*=\s*"([^"]+)"/m)?.[1];

    expect(canonicalWorkerName).toBe('founder-control-room');
    expect(authorityPolicy.policyRole).toBe('desired-state-only');
    expect(authorityPolicy.workerName).toBe(canonicalWorkerName);
    expect(authorityWorkflow).toContain(`CF_WORKER_NAME: ${canonicalWorkerName}`);
    expect(authorityWorkflow).not.toContain('CF_WORKER_NAME: founder-control-room2');
  });

  it('keeps read-only Workers Builds inspection credentials separate from deploy credentials', () => {
    expect(deployWorkflow).toContain('apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(deployWorkflow).toContain('accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
    expect(deployWorkflow).not.toContain('FCR_CLOUDFLARE_BUILDS_USER_TOKEN');
    expect(authorityWorkflow).not.toContain('secrets.CLOUDFLARE_API_TOKEN');
  });

  it('separates the safety invariant from the current desired topology', () => {
    expect(authorityPolicy.kind).toBe('fcr/cloudflare-worker-git-authority-policy@v1');
    expect(authorityPolicy.allowedSafeStates).toEqual([
      'disconnected',
      'non-promoting',
    ]);
    expect(authorityPolicy.currentDesiredState).toBe('non-promoting');
    expect(authorityPolicy.currentDesiredDeployCommand).toBe(
      'npx wrangler versions upload --config wrangler.worker.toml',
    );
    expect(authorityPolicy.canonicalProductionAuthority).toBe(
      'github-manual-deploy-workflow',
    );
  });

  it('keeps current founder preference durable but non-executing', () => {
    expect(authorityPolicy.policyRole).toBe('desired-state-only');
    expect(authorityPolicy.canAuthorizeProviderMutation).toBe(false);
    expect(authorityPolicy.currentFounderIntent).toMatchObject({
      source: 'current_authenticated_founder',
      status: 'current',
      persistsUntilSuperseded: true,
      freshApprovalRequiredForConsequentialMutation: true,
      historicalDecisionsCanAuthorize: false,
    });

    expect(authorityPolicy.historicalDecisions).toContainEqual({
      decision: 'disconnect',
      status: 'superseded-safe-fallback',
      maySatisfySafetyInvariant: true,
      isCurrentPreference: false,
      canAuthorizeProviderMutation: false,
    });
  });

  it('reports disconnected as safe-but-not-current instead of silently calling it desired', () => {
    expect(authorityScript).toContain('/builds/workers/${worker.tag}/triggers');
    expect(authorityScript).toContain('wrangler\\s+versions\\s+upload');
    expect(authorityScript).toContain('WORKER_GIT_CURRENT_TOPOLOGY_DRIFT');
    expect(authorityScript).toContain('safe-but-not-current');
    expect(authorityScript).toContain('Historical safe fallbacks do not override current founder intent.');
    expect(authorityScript).toContain('receipt.workerGitAuthority.state = "disconnected"');
    expect(authorityScript).toContain('receipt.workerGitAuthority.state = "non-promoting"');
  });

  it('fails promoting Worker Git and keeps GitHub manual deploy as production authority', () => {
    expect(authorityScript).toContain('WORKER_GIT_AUTO_DEPLOY_AUTHORITY_CONFLICT');
    expect(authorityScript).toContain(
      'canonicalProductionAuthority:\n    authorityPolicy?.canonicalProductionAuthority || "github-manual-deploy-workflow"',
    );
    expect(authorityScript).not.toContain('No Cloudflare build matched exact head');
    expect(authorityScript).not.toContain('PUBLIC_ORIGIN_TRANSPORT_FAILURE');
  });

  it('keeps analytics observational and exposes separate truth lanes', () => {
    expect(authorityScript).toContain('truthLanes: {');
    expect(authorityScript).toContain('observationOnly: true');
    expect(authorityScript).toContain('canAuthorizeProviderMutation: false');
    expect(authorityScript).toContain('source: "cloudflare-provider-readback"');
    expect(authorityScript).toContain('source: "current-founder-intent-policy"');
  });
});
