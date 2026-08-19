import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

const ci = read('.github/workflows/ci.yml');
const providerJobMarker = '  cloudflare-bridge-authority:';
const requiredGateMarker = '  required-gate:';

describe('load-bearing Cloudflare provider authority', () => {
  it('runs the secret-free Cloudflare authority contract on every CI execution', () => {
    expect(ci).toContain(providerJobMarker);
    expect(ci).toContain('name: Cloudflare bridge authority contract');
    expect(ci).toContain('node --test scripts/provider-credential-contract.node-test.mjs');
    expect(ci).toContain('node --test scripts/reconcile-cloudflare-access-public-zone.node-test.mjs');
    expect(ci).toContain('node --test scripts/fcr-cloudflare-bridge-contract.node-test.mjs');
  });

  it('makes Cloudflare provider authority a Required Gate dependency', () => {
    const requiredGateOffset = ci.indexOf(requiredGateMarker);
    expect(requiredGateOffset).toBeGreaterThan(-1);

    const requiredGate = ci.slice(requiredGateOffset);
    expect(requiredGate).toContain('      - cloudflare-bridge-authority');
    expect(requiredGate).toContain(
      'CLOUDFLARE_AUTHORITY_RESULT: ${{ needs.cloudflare-bridge-authority.result }}',
    );
    expect(requiredGate).toContain('"$CLOUDFLARE_AUTHORITY_RESULT"');
  });
});
