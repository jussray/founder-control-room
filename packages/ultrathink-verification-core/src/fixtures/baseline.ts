import type { SourceAuthorityV0 } from '../source-authority.v0.js';
import type { WitnessPolicyV0, Sha256 } from '../witness-policy.v0.js';
import type { WitnessResultV0 } from '../witness-result.v0.js';

export const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
export const SHA_C = 'cccccccccccccccccccccccccccccccccccccccc';
export const POLICY_HASH = ('sha256:' + '1'.repeat(64)) as Sha256;
export const CODE_SCENARIO = ('sha256:' + '2'.repeat(64)) as Sha256;
export const PRODUCT_SCENARIO = ('sha256:' + '3'.repeat(64)) as Sha256;
export const NOW = '2026-08-23T22:00:00.000Z';
export const CORRELATION_ID = 'fixture-correlation-001';

export function sourceAuthority(sha = SHA_A): SourceAuthorityV0 {
  return {
    kind: 'source-authority.v0',
    repo: 'jussray/example',
    branch: 'main',
    authoritativeSha: sha,
    observedAt: '2026-08-23T21:55:00.000Z',
    source: 'github',
    correlationId: CORRELATION_ID,
  };
}

export const policy: WitnessPolicyV0 = {
  kind: 'witness-policy.v0',
  policyVersion: '1.0.0',
  policyHash: POLICY_HASH,
  repo: 'jussray/example',
  requiredWitnesses: [
    { id: 'code.required-ci', class: 'code', exactShaRequired: true, freshnessWindowSeconds: 3600, scenarioFingerprint: CODE_SCENARIO },
    { id: 'product.critical-journey', class: 'product', exactShaRequired: true, freshnessWindowSeconds: 3600, scenarioFingerprint: PRODUCT_SCENARIO },
  ],
};

function evidenceHash(seed: string): Sha256 {
  const safe = seed.charCodeAt(0).toString(16).padStart(2, '0');
  return (`sha256:${safe.repeat(32)}`) as Sha256;
}

export function passingWitness(witnessId: string, sha = SHA_A): WitnessResultV0 {
  const scenarioFingerprint = witnessId === 'code.required-ci' ? CODE_SCENARIO : PRODUCT_SCENARIO;
  return {
    kind: 'witness-result.v0',
    version: 0,
    repo: 'jussray/example',
    branch: 'main',
    witnessId,
    state: 'PASS',
    evaluatedSha: sha,
    policyHash: POLICY_HASH,
    scenarioFingerprint,
    evidenceRef: `fixture://${witnessId}/${sha}`,
    evidenceHash: evidenceHash(witnessId),
    observedAt: '2026-08-23T21:58:00.000Z',
    expiresAt: '2026-08-23T23:00:00.000Z',
    correlationId: CORRELATION_ID,
    observer: { adapter: 'fixture-adapter', version: '0.1.0', provider: 'other' },
  };
}

export function qualifyingWitnesses(sha = SHA_A): WitnessResultV0[] {
  return [passingWitness('code.required-ci', sha), passingWitness('product.critical-journey', sha)];
}
