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
});
