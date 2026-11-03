import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

const ci = read('.github/workflows/ci.yml');
const testLedgerWorkflow = read('.github/workflows/control-room-test-ledger.yml');
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


describe('provider-required test-ledger context', () => {
  it('binds Verify test-ledger contract to the final exact-head observer, not the preflight', () => {
    const contractJob = testLedgerWorkflow.match(
      /  ledger-contract:\n([\s\S]*?)(?=\n  publish-ledger:)/,
    )?.[1] ?? '';
    const publishJob = testLedgerWorkflow.match(
      /  publish-ledger:\n([\s\S]*)$/,
    )?.[1] ?? '';

    expect(contractJob).toContain('name: Validate test-ledger source contract');
    expect(contractJob).not.toContain('name: Verify test-ledger contract');
    expect(publishJob).toContain('name: Verify test-ledger contract');
    expect(publishJob).toContain('Observe every exact-head check lane');
  });
});
