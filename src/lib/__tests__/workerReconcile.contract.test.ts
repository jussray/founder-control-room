import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/worker-reconcile.yml', import.meta.url),
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

  it('fails closed on malformed token shape before Wrangler mutation without printing the token', () => {
    expect(workflow).toContain("token = os.environ.get('CLOUDFLARE_API_TOKEN', '')");
    expect(workflow).toContain("token.encode('ascii')");
    expect(workflow).toContain('contains non-ASCII characters and cannot be used as an HTTP Authorization value');
    expect(workflow).toContain('contains whitespace or non-printable characters');
    expect(workflow).toContain('without a Bearer prefix');
    expect(workflow).toContain('without a NAME=value wrapper');
    expect(workflow).toContain('without wrapping quotes');
    expect(workflow).toContain('The token value was not printed.');
    expect(workflow).not.toContain('echo "$CLOUDFLARE_API_TOKEN"');
    expect(workflow).not.toContain('print(token)');
  });

  it('fails closed on absent provider-held secrets before any Worker mutation', () => {
    const reconcileGate = workflow.indexOf('  authority-gate:');
    const preflight = workflow.indexOf('- name: Verify provider-held Worker secret names before reconciliation');
    const authorityReceipt = workflow.indexOf('- name: Record bounded authority receipt');
    const deployJob = workflow.indexOf('  worker-deploy:');
    const firstMutation = workflow.indexOf('- name: Force publication grant disabled on canonical Worker');
    expect(reconcileGate).toBeGreaterThanOrEqual(0);
    expect(preflight).toBeGreaterThan(reconcileGate);
    expect(authorityReceipt).toBeGreaterThan(preflight);
    expect(deployJob).toBeGreaterThan(authorityReceipt);
    expect(firstMutation).toBeGreaterThan(deployJob);

    const preflightStep = workflow.slice(preflight, authorityReceipt);
    expect(preflightStep).toContain('npx --yes wrangler@4.110.0 secret list');
    expect(preflightStep).toContain('--config wrangler.worker.toml');
    expect(preflightStep).toContain('--format json');
    expect(preflightStep).toContain("config.get('secrets', {}).get('required', [])");
    expect(preflightStep).toContain("workflow_written = {'FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON'}");
    expect(preflightStep).toContain('missing = sorted(required - workflow_written - present)');
    expect(preflightStep).toContain('sys.exit(1)');
    expect(preflightStep).not.toContain('wrangler secret get');
    expect(preflightStep).not.toContain('wrangler secret put');
  });

  it('preserves exact-head authority and the existing runtime proof boundary', () => {
    expect(workflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
    expect(workflow).toContain('needs: authority-gate');
    expect(workflow).toContain('needs: worker-deploy');
    expect(workflow).toContain('api.foundercontrolroom.org did not prove canonical service identity and exact deployed SHA');
    expect(workflow).toContain('.founderSignalAutomationGrant.configured == true');
    expect(workflow).toContain('.founderSignalAutomationGrant.enabled == false');
  });
});
