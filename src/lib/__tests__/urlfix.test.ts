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

const HASH_BEFORE = 'a'.repeat(64);
const HASH_AFTER = 'b'.repeat(64);

const spec: UrlFixWitnessSpec = {
  route: '/cart',
  viewport: { width: 390, height: 844 },
  preconditions: ['cart contains one restored item'],
  actions: ['open /cart', 'click Checkout'],
  expectedObservableResult: 'checkout-ready',
};

const EMPTY_TRUST: UrlFixTrustContext = {
  verifiedUrlBindings: [],
  verifiedRepairAuthorities: [],
  verifiedArtifacts: new Map(),
  verifiedRuntimeEvidence: [],
};

const FULL_TRUST: UrlFixTrustContext = {
  verifiedUrlBindings: [{
    origin: 'https://app.sekretbip.net',
    projectSlug: 'sekret-bip',
    repository: 'jussray/Sekret-Bip',
    evidenceRef: 'fcr:ownership:sekret-bip:app',
  }],
  verifiedRepairAuthorities: [{
    receiptRef: 'fcr:repair:urlfix:sekret-bip:001',
    projectSlug: 'sekret-bip',
    repository: 'jussray/Sekret-Bip',
  }],
  verifiedArtifacts: new Map([
    ['trace-before', HASH_BEFORE],
    ['trace-after', HASH_AFTER],
  ]),
  verifiedRuntimeEvidence: [
    { ref: 'runtime:before:receipt', runtimeIdentity: 'runtime-old', origin: 'https://app.sekretbip.net' },
    { ref: 'runtime:after:receipt', runtimeIdentity: 'runtime-new', origin: 'https://app.sekretbip.net' },
  ],
};

const artifact = (id: string, sha256: string) => ({ id, sha256 });

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
      runtimeEvidenceRef: 'runtime:before:receipt',
      evidenceMode: 'REAL',
      observedResult: 'checkout-error',
      trace: artifact('trace-before', HASH_BEFORE),
      screenshot: null,
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
      trace: artifact('trace-after', HASH_AFTER),
      screenshot: null,
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

  it('requires tuple-bound artifacts and before/after runtime evidence for live proof', () => {
    const result = evaluateUrlFixVerificationReceipt(receipt(), FULL_TRUST);
    expect(result).toEqual({ validSameWitness: true, proofState: 'LIVE_BROWSER_PROVEN', errors: [] });
  });

  it('fails closed when artifact ids are known but hashes do not match trusted evidence', () => {
    const base = receipt();
    const result = evaluateUrlFixVerificationReceipt({
      ...base,
      after: { ...base.after, trace: artifact('trace-after', 'c'.repeat(64)) },
    }, FULL_TRUST);
    expect(result.proofState).toBe('PATCHED');
    expect(result.errors.join(' ')).toContain('id/hash');
  });

  it('fails closed when artifact references have no independent trust record', () => {
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

  it('rejects a runtime evidence ref reused for a different runtime identity', () => {
    const base = receipt();
    const result = evaluateUrlFixVerificationReceipt({
      ...base,
      after: { ...base.after, runtimeIdentity: 'runtime-not-in-receipt' },
    }, FULL_TRUST);
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
    expect(result.errors.join(' ')).toContain('repaired runtime identity');
  });

  it('rejects live proof when the failing baseline runtime has no bound receipt', () => {
    const base = receipt();
    const result = evaluateUrlFixVerificationReceipt({
      ...base,
      before: { ...base.before, runtimeEvidenceRef: 'stale-or-missing-receipt' },
    }, FULL_TRUST);
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
    expect(result.errors.join(' ')).toContain('baseline runtime identity');
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
      verifiedArtifacts: new Map([
        ['trace-before', HASH_BEFORE],
        ['trace-after', HASH_AFTER],
      ]),
      verifiedRuntimeEvidence: [],
    };
    const result = evaluateUrlFixVerificationReceipt({
      ...base,
      before: {
        ...base.before,
        target: 'LOCAL',
        targetUrl: 'http://127.0.0.1:4173/cart',
        evidenceMode: 'FIXTURE',
        runtimeIdentity: 'fixture-before',
        runtimeEvidenceRef: null,
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
  const binding = {
    originalUrl: 'https://app.sekretbip.net/cart',
    finalUrl: 'https://app.sekretbip.net/cart',
    projectSlug: 'sekret-bip',
    repository: 'jussray/Sekret-Bip',
    ownership: 'OWNED_CONFIRMED' as const,
    ownershipEvidenceRefs: ['fcr:ownership:sekret-bip:app'],
    repairAuthorityReceiptRef: 'fcr:repair:urlfix:sekret-bip:001',
    runtimeIdentity: null,
    deploymentProvider: 'cloudflare',
    deploymentProject: 'sekret-bip',
  };

  it('allows bounded source repair only with tuple-bound FCR ownership and repair authority', () => {
    const result = evaluateUrlFixUrlBinding(binding, FULL_TRUST);
    expect(result.sourceMutationAllowed).toBe(true);
    expect(result.runtimeIdentityKnown).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('rejects forged ownership or repair-authority strings', () => {
    const result = evaluateUrlFixUrlBinding({
      ...binding,
      ownershipEvidenceRefs: ['made-up-proof'],
      repairAuthorityReceiptRef: 'made-up-authority',
    }, EMPTY_TRUST);

    expect(result.sourceMutationAllowed).toBe(false);
    expect(result.errors.join(' ')).toContain('tuple-bound');
  });

  it('rejects recombining a true origin fact with ownership evidence from another project', () => {
    const mixedTrust: UrlFixTrustContext = {
      ...FULL_TRUST,
      verifiedUrlBindings: [{
        origin: 'https://app.sekretbip.net',
        projectSlug: 'juss-beautiful-hair',
        repository: 'jussray/jussbeautifulhair-site',
        evidenceRef: 'fcr:ownership:sekret-bip:app',
      }],
    };
    const result = evaluateUrlFixUrlBinding(binding, mixedTrust);
    expect(result.sourceMutationAllowed).toBe(false);
    expect(result.errors.join(' ')).toContain('original URL origin');
  });

  it('rejects a repair receipt that belongs to a different project', () => {
    const mixedTrust: UrlFixTrustContext = {
      ...FULL_TRUST,
      verifiedRepairAuthorities: [{
        receiptRef: 'fcr:repair:urlfix:sekret-bip:001',
        projectSlug: 'juss-beautiful-hair',
        repository: 'jussray/jussbeautifulhair-site',
      }],
    };
    const result = evaluateUrlFixUrlBinding(binding, mixedTrust);
    expect(result.sourceMutationAllowed).toBe(false);
    expect(result.errors.join(' ')).toContain('repair authority');
  });

  it('downgrades an owned input that redirects outside the tuple-bound origin set', () => {
    const result = evaluateUrlFixUrlBinding({
      ...binding,
      finalUrl: 'https://example.net/cart',
    }, FULL_TRUST);

    expect(result.sourceMutationAllowed).toBe(false);
    expect(result.errors.join(' ')).toContain('final URL origin');
  });

  it('does not turn an external project into source mutation authority', () => {
    const trust: UrlFixTrustContext = {
      ...FULL_TRUST,
      verifiedUrlBindings: [{
        origin: 'https://truth.example.com',
        projectSlug: 'truth-weaver',
        repository: 'jussray/truth-weaver',
        evidenceRef: 'fcr:ownership:truth-weaver',
      }],
      verifiedRepairAuthorities: [{
        receiptRef: 'fcr:repair:urlfix:truth-weaver:001',
        projectSlug: 'truth-weaver',
        repository: 'jussray/truth-weaver',
      }],
    };
    const result = evaluateUrlFixUrlBinding({
      originalUrl: 'https://truth.example.com',
      finalUrl: 'https://truth.example.com',
      projectSlug: 'truth-weaver',
      repository: 'jussray/truth-weaver',
      ownership: 'OWNED_CONFIRMED',
      ownershipEvidenceRefs: ['fcr:ownership:truth-weaver'],
      repairAuthorityReceiptRef: 'fcr:repair:urlfix:truth-weaver:001',
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
