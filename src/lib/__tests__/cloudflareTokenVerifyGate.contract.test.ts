import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const script = read('scripts/verify-cloudflare-token.sh');
const GATE = '- name: Verify Cloudflare accepts the deploy credential (fail closed)';

describe('fail-closed Cloudflare credential verification gate', () => {
  it.each([
    ['.github/workflows/worker-reconcile.yml', 'Verify provider-held Worker secret names before reconciliation'],
    ['.github/workflows/deploy.yml', 'Verify provider-held Worker secret names before mutation'],
  ])('%s verifies the token before the first Cloudflare API call', (path, firstCloudflareStep) => {
    const wf = read(path);
    const gate = wf.indexOf(GATE);
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(wf.indexOf(firstCloudflareStep));
    expect(wf).toContain('bash scripts/verify-cloudflare-token.sh "$ACCOUNT_ID"');
  });

  it('requires success=true and an active status, not HTTP success alone', () => {
    expect(script).toContain('d.get("success") is True');
    expect(script).toContain('.get("status") == "active"');
    expect(script).toContain('/user/tokens/verify');
    expect(script).toContain('/accounts/$ACCOUNT_ID/tokens/verify');
    expect(script).toContain('set -euo pipefail');
    expect(script).toMatch(/\nexit 1\n?$/);
  });

  it('never places the token in argv or output and names secret precedence on failure', () => {
    expect(script).toContain('curl -sS --max-time 20 -K -');
    expect(script).not.toMatch(/echo[^\n]*\$CLOUDFLARE_API_TOKEN/);
    expect(script).not.toMatch(/-H\s+"Authorization/);
    expect(script).toContain('production environment secret named CLOUDFLARE_API_TOKEN overrides the repository secret');
  });
});
