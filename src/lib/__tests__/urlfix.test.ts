import { describe, expect, it } from 'vitest';

import {
  URLFIX_FAILURE_PLANES,
  createUrlFixWitnessFingerprint,
  evaluateUrlFixUrlBinding,
  evaluateUrlFixVerificationReceipt,
  isUrlFixFailurePlane,
  type UrlFixTrustContext,
  type UrlFixVerificationReceipt,
  type UrlFixWitnessSpec,
} from '../urlfix.js';

const spec: UrlFixWitnessSpec = {
  route: '/cart',
  viewport: { width: 390, height: 844 },
  preconditions: ['cart contains one restored item'],
  actions: ['open /cart', 'click Checkout'],
  expectedObservableResult: 'checkout-ready',
};

const EMPTY_TRUST: UrlFixTrustContext = {
  ownedOrigins: new Set(),
  verifiedOwnershipEvidenceRefs: new Set(),
  verifiedRepairAuthorityReceiptRefs: new Set(),
  verifiedArtifactIds: new Set(),
  verifiedRuntimeEvidenceRefs: new Set(),
};

const FULL_TRUST: UrlFixTrustContext = {
  ownedOrigins: new Set(['https://app.sekretbip.net']),
  verifiedOwnershipEvidenceRefs: new Set(['fcr:ownership:sekret-bip:app']),
  verifiedRepairAuthorityReceiptRefs: new Set(['fcr:repair:urlfix:sekret-bip:001']),
  verifiedArtifactIds: new Set(['trace-before', 'trace-after']),
  verifiedRuntimeEvidenceRefs: new Set(['runtime:after:receipt']),
};

const artifact = (id: string) => ({ id, sha256: 'a'.repeat(64) });

function receipt(overrides: Partial<UrlFixVerificationReceipt> = {}): UrlFixVerificationReceipt {
  const fingerprint = createUrlFixWitnessFingerprint(spec);
  return {
    issueId: 'URLFIX-001',
    witnessSpec: spec,
    before: {
      runId: 'before-1',
      witnessFingerprint: fingerprint,
      target: 'LIVE',
      targetUrl: 'https://app.sekretbip.net/cart',
      runtimeIdentity: 'runtime-old',
      runtimeEvidenceRef: null,
      evidenceMode: 'REAL',
      observedResult: 'checkout-error',
      trace: artifact('trace-before'),
      screenshot: artifact('shot-before'),
    },
    after: {
      runId: 'after-1',
      witnessFingerprint: fingerprint,
      target: 'LIVE',
      targetUrl: 'https://app.sekretbip.net/cart',
      runtimeIdentity: 'runtime-new',
      runtimeEvidenceRef: 'runtime:after:receipt',
      evidenceMode: 'REAL',
      observedResult: 'checkout-ready',
      trace: artifact('trace-after'),
      screenshot: artifact('shot-after'),
    },
    ...overrides,
  };
}

describe('urlfix same-witness proof', () => {
  it('fingerprints behavior without pinning environment mode', () => {
    const first = createUrlFixWitnessFingerprint(spec);
    const second = createUrlFixWitnessFingerprint({ ...spec, actions: [...spec.actions] });
    expect(first).toBe(second);
  });

  it('requires independently verified artifacts and repaired runtime evidence for live proof', () => {
    const result = evaluateUrlFixVerificationReceipt(receipt(), FULL_TRUST);
    expect(result).toEqual({ validSameWitness: true, proofState: 'LIVE_BROWSER_PROVEN', errors: [] });
  });

  it('fails closed when artifact references are merely strings', () => {
    const result = evaluateUrlFixVerificationReceipt(receipt(), EMPTY_TRUST);
    expect(result.proofState).toBe('PATCHED');
    expect(result.errors.join(' ')).toContain('independently verified');
  });

  it('rejects run-id reuse', () => {
    const base = receipt();
    const result = evaluateUrlFixVerificationReceipt({
      ...base,
      after: { ...base.after, runId: base.before.runId },
    }, FULL_TRUST);
    expect(result.validSameWitness).toBe(false);
    expect(result.proofState).toBe('PATCHED');
  });

  it('does not let a local baseline plus a live after-run become live proof', () => {
    const base = receipt();
    const result = evaluateUrlFixVerificationReceipt({
      ...base,
      before: { ...base.before, target: 'LOCAL', targetUrl: 'http://127.0.0.1:4173/cart' },
    }, FULL_TRUST);
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
    expect(result.errors.join(' ')).toContain('live baseline');
  });

  it('does not let a different live origin satisfy the same behavioral witness', () => {
    const base = receipt();
    const result = evaluateUrlFixVerificationReceipt({
      ...base,
      after: { ...base.after, targetUrl: 'https://example.net/cart' },
    }, FULL_TRUST);
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
    expect(result.errors.join(' ')).toContain('same origin');
  });

  it('never lets mocked live dependencies establish live proof', () => {
    const base = receipt();
    const result = evaluateUrlFixVerificationReceipt({
      ...base,
      after: { ...base.after, evidenceMode: 'MOCKED' },
    }, FULL_TRUST);
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
  });

  it('allows a fixture to prove only the local browser layer', () => {
    const base = receipt();
    const localTrust: UrlFixTrustContext = {
      ...FULL_TRUST,
      verifiedArtifactIds: new Set(['trace-before', 'trace-after']),
    };
    const result = evaluateUrlFixVerificationReceipt({
      ...base,
      before: {
        ...base.before,
        target: 'LOCAL',
        targetUrl: 'http://127.0.0.1:4173/cart',
        evidenceMode: 'FIXTURE',
        runtimeIdentity: 'fixture-before',
      },
      after: {
        ...base.after,
        target: 'LOCAL',
        targetUrl: 'http://127.0.0.1:4173/cart',
        evidenceMode: 'FIXTURE',
        runtimeIdentity: 'fixture-after',
        runtimeEvidenceRef: null,
      },
    }, localTrust);
    expect(result.proofState).toBe('LOCAL_BROWSER_PROVEN');
  });
});

describe('urlfix FCR URL binding', () => {
  it('allows bounded source repair only with FCR-verified ownership and repair authority', () => {
    const result = evaluateUrlFixUrlBinding({
      originalUrl: 'https://app.sekretbip.net/cart',
      finalUrl: 'https://app.sekretbip.net/cart',
      projectSlug: 'sekret-bip',
      repository: 'jussray/Sekret-Bip',
      ownership: 'OWNED_CONFIRMED',
      ownershipEvidenceRefs: ['fcr:ownership:sekret-bip:app'],
      repairAuthorityReceiptRef: 'fcr:repair:urlfix:sekret-bip:001',
      runtimeIdentity: null,
      deploymentProvider: 'cloudflare',
      deploymentProject: 'sekret-bip',
    }, FULL_TRUST);

    expect(result.sourceMutationAllowed).toBe(true);
    expect(result.runtimeIdentityKnown).toBe(false);
  });

  it('rejects forged ownership or repair-authority strings', () => {
    const result = evaluateUrlFixUrlBinding({
      originalUrl: 'https://app.sekretbip.net/cart',
      finalUrl: 'https://app.sekretbip.net/cart',
      projectSlug: 'sekret-bip',
      repository: 'jussray/Sekret-Bip',
      ownership: 'OWNED_CONFIRMED',
      ownershipEvidenceRefs: ['made-up-proof'],
      repairAuthorityReceiptRef: 'made-up-authority',
      runtimeIdentity: null,
    }, EMPTY_TRUST);

    expect(result.sourceMutationAllowed).toBe(false);
    expect(result.errors.join(' ')).toContain('not verified by FCR');
  });

  it('downgrades an owned input that redirects outside the trusted origin set', () => {
    const result = evaluateUrlFixUrlBinding({
      originalUrl: 'https://app.sekretbip.net/cart',
      finalUrl: 'https://example.net/cart',
      projectSlug: 'sekret-bip',
      repository: 'jussray/Sekret-Bip',
      ownership: 'OWNED_CONFIRMED',
      ownershipEvidenceRefs: ['fcr:ownership:sekret-bip:app'],
      repairAuthorityReceiptRef: 'fcr:repair:urlfix:sekret-bip:001',
      runtimeIdentity: null,
    }, FULL_TRUST);

    expect(result.sourceMutationAllowed).toBe(false);
    expect(result.errors.join(' ')).toContain('final URL origin');
  });

  it('does not turn an external project into source mutation authority', () => {
    const trust: UrlFixTrustContext = {
      ...FULL_TRUST,
      ownedOrigins: new Set(['https://truth.example.com']),
    };
    const result = evaluateUrlFixUrlBinding({
      originalUrl: 'https://truth.example.com',
      finalUrl: 'https://truth.example.com',
      projectSlug: 'truth-weaver',
      repository: 'jussray/truth-weaver',
      ownership: 'OWNED_CONFIRMED',
      ownershipEvidenceRefs: ['fcr:ownership:sekret-bip:app'],
      repairAuthorityReceiptRef: 'fcr:repair:urlfix:sekret-bip:001',
      runtimeIdentity: 'runtime-1',
    }, trust);

    expect(result.sourceMutationAllowed).toBe(false);
    expect(result.errors.join(' ')).toContain('not authority-bearing');
  });
});

describe('urlfix failure planes', () => {
  it('uses the bounded failure-plane vocabulary', () => {
    expect(URLFIX_FAILURE_PLANES).toContain('CDN_EDGE');
    expect(isUrlFixFailurePlane('AUTH')).toBe(true);
    expect(isUrlFixFailurePlane('RANDOM_GUESS')).toBe(false);
  });
});
