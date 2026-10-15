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

  it('preserves exact-head authority and the existing runtime proof boundary', () => {
    expect(workflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
    expect(workflow).toContain('needs: authority-gate');
    expect(workflow).toContain('needs: worker-deploy');
    expect(workflow).toContain('api.foundercontrolroom.org did not prove canonical service identity and exact deployed SHA');
    expect(workflow).toContain('.founderSignalAutomationGrant.configured == true');
    expect(workflow).toContain('.founderSignalAutomationGrant.enabled == false');
  });

  it('fails closed on missing provider-held Worker secret bindings before any mutation', () => {
    const authority = workflow.slice(workflow.indexOf('  authority-gate:'), workflow.indexOf('  worker-deploy:'));
    const secretPreflight = authority.indexOf('- name: Verify required Worker secret names before reconcile');
    const statusReceipt = authority.indexOf('- name: Upload redacted Worker secret-name preflight receipt');
    const reconcileMutation = workflow.indexOf('  worker-deploy:');

    expect(secretPreflight).toBeGreaterThanOrEqual(0);
    expect(statusReceipt).toBeGreaterThan(secretPreflight);
    expect(reconcileMutation).toBeGreaterThan(workflow.indexOf('  authority-gate:'));
    expect(authority).toContain('npx --yes wrangler@4.110.0 secret list');
    expect(authority).toContain('--config wrangler.worker.toml');
    expect(authority).toContain('--format json');
    expect(authority).toContain("workflow_written = {'FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON'}");
    expect(authority).toContain('provider_required = required - workflow_written');
    expect(authority).toContain('provider_required - present');
    expect(authority).toContain('reconciliation blocked before mutation');
    expect(authority).toContain('if: always()');
    expect(authority).toContain('fcr-reconcile-secret-preflight.json');
    expect(authority).toContain('retention-days: 30');
    expect(authority).not.toContain('wrangler secret get');
    expect(authority).not.toContain("entry.get('value')");
    expect(authority).not.toContain('print(missing)');
  });
});
