import { describe, expect, it } from 'vitest';

import {
  URLFIX_FAILURE_PLANES,
  createUrlFixWitnessFingerprint,
  evaluateUrlFixUrlBinding,
  evaluateUrlFixVerificationReceipt,
  isUrlFixFailurePlane,
  type UrlFixTrustContext,
  type UrlFixVerificationReceipt,
  type UrlFixVerificationTrustContext,
  type UrlFixWitnessSpec,
} from '../urlfix.js';

const HASH_BEFORE = 'a'.repeat(64);
const HASH_AFTER = 'b'.repeat(64);
const EXPECTATION_REF = 'product-contract:checkout-ready';

const spec: UrlFixWitnessSpec = {
  route: '/cart',
  browser: 'chromium',
  viewport: { width: 390, height: 844 },
  preconditions: ['cart contains one restored item'],
  actions: ['open /cart', 'click Checkout'],
  expectedObservableResult: 'checkout-ready',
  expectationEvidenceRef: EXPECTATION_REF,
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

function verificationTrust(subject = receipt()): UrlFixVerificationTrustContext {
  return {
    verifiedArtifacts: new Map([
      [subject.before.trace!.id, subject.before.trace!.sha256],
      [subject.after.trace!.id, subject.after.trace!.sha256],
    ]),
    verifiedRuntimeEvidence: [
      { ref: 'runtime:before:receipt', runtimeIdentity: 'runtime-old', origin: 'https://app.sekretbip.net' },
      { ref: 'runtime:after:receipt', runtimeIdentity: 'runtime-new', origin: 'https://app.sekretbip.net' },
      { ref: 'runtime:preview:receipt', runtimeIdentity: 'preview-runtime', origin: 'https://preview.sekretbip.net' },
    ],
    verifiedWitnessRuns: [subject.before, subject.after],
    verifiedExpectations: [{
      ref: EXPECTATION_REF,
      route: subject.witnessSpec.route,
      browser: subject.witnessSpec.browser,
      expectedObservableResult: subject.witnessSpec.expectedObservableResult,
    }],
  };
}

const FULL_TRUST: UrlFixTrustContext = {
  ...verificationTrust(),
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
};

const EMPTY_TRUST: UrlFixTrustContext = {
  verifiedUrlBindings: [],
  verifiedRepairAuthorities: [],
  verifiedArtifacts: new Map(),
  verifiedRuntimeEvidence: [],
  verifiedWitnessRuns: [],
  verifiedExpectations: [],
};

describe('urlfix same-witness proof', () => {
  it('fingerprints behavior without pinning environment mode', () => {
    const first = createUrlFixWitnessFingerprint(spec);
    const second = createUrlFixWitnessFingerprint({ ...spec, actions: [...spec.actions] });
    expect(first).toBe(second);
  });

  it('requires tuple-bound artifacts, run receipts, expectation evidence, and runtime receipts for live proof', () => {
    const subject = receipt();
    const result = evaluateUrlFixVerificationReceipt(subject, verificationTrust(subject));
    expect(result).toEqual({ validSameWitness: true, proofState: 'LIVE_BROWSER_PROVEN', errors: [] });
  });

  it('fails closed when the caller changes observedResult without a matching trusted run receipt', () => {
    const trusted = receipt();
    const forged = {
      ...trusted,
      after: { ...trusted.after, observedResult: 'checkout-ready-but-not-observed' },
    };
    const result = evaluateUrlFixVerificationReceipt(forged, verificationTrust(trusted));
    expect(result.proofState).toBe('PATCHED');
    expect(result.errors.join(' ')).toContain('after witness run receipt');
  });

  it('fails closed when the caller changes the expected result without trusted expectation evidence', () => {
    const trusted = receipt();
    const forgedSpec = {
      ...trusted.witnessSpec,
      expectedObservableResult: 'whatever-the-page-already-does',
    };
    const forged = {
      ...trusted,
      witnessSpec: forgedSpec,
      before: { ...trusted.before, witnessFingerprint: createUrlFixWitnessFingerprint(forgedSpec) },
      after: { ...trusted.after, witnessFingerprint: createUrlFixWitnessFingerprint(forgedSpec), observedResult: 'whatever-the-page-already-does' },
    };
    const result = evaluateUrlFixVerificationReceipt(forged, verificationTrust(trusted));
    expect(result.proofState).toBe('PATCHED');
    expect(result.errors.join(' ')).toContain('expected observable result');
  });

  it('fails closed when expectationEvidenceRef is swapped without a matching trusted expectation', () => {
    const trusted = receipt();
    const forgedSpec = { ...trusted.witnessSpec, expectationEvidenceRef: 'made-up-expectation' };
    const forged = {
      ...trusted,
      witnessSpec: forgedSpec,
      before: { ...trusted.before, witnessFingerprint: createUrlFixWitnessFingerprint(forgedSpec) },
      after: { ...trusted.after, witnessFingerprint: createUrlFixWitnessFingerprint(forgedSpec) },
    };
    const result = evaluateUrlFixVerificationReceipt(forged, verificationTrust(trusted));
    expect(result.proofState).toBe('PATCHED');
    expect(result.errors.join(' ')).toContain('expected observable result');
  });

  it('fails closed when artifact ids are known but hashes do not match trusted evidence', () => {
    const trusted = receipt();
    const forged = {
      ...trusted,
      after: { ...trusted.after, trace: artifact('trace-after', 'c'.repeat(64)) },
    };
    const result = evaluateUrlFixVerificationReceipt(forged, verificationTrust(trusted));
    expect(result.proofState).toBe('PATCHED');
    expect(result.errors.join(' ')).toContain('id/hash');
  });

  it('requires distinct trace artifacts for before and after executions', () => {
    const trusted = receipt();
    const duplicateTrace = {
      ...trusted,
      after: { ...trusted.after, trace: trusted.before.trace },
    };
    const trust = verificationTrust(duplicateTrace);
    const result = evaluateUrlFixVerificationReceipt(duplicateTrace, trust);
    expect(result.proofState).toBe('PATCHED');
    expect(result.errors.join(' ')).toContain('distinct trace artifacts');
  });

  it('fails closed when artifact references have no independent trust record', () => {
    const result = evaluateUrlFixVerificationReceipt(receipt(), EMPTY_TRUST);
    expect(result.proofState).toBe('PATCHED');
    expect(result.errors.join(' ')).toContain('independently verified');
  });

  it('rejects run-id reuse', () => {
    const trusted = receipt();
    const forged = { ...trusted, after: { ...trusted.after, runId: trusted.before.runId } };
    const result = evaluateUrlFixVerificationReceipt(forged, verificationTrust(trusted));
    expect(result.validSameWitness).toBe(false);
    expect(result.proofState).toBe('PATCHED');
  });

  it('does not let a local baseline plus a live after-run become live proof', () => {
    const subject = receipt();
    const local = {
      ...subject,
      before: { ...subject.before, target: 'LOCAL' as const, targetUrl: 'http://127.0.0.1:4173/cart' },
    };
    const result = evaluateUrlFixVerificationReceipt(local, verificationTrust(local));
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
    expect(result.errors.join(' ')).toContain('live baseline');
  });

  it('does not let a different live origin satisfy the same behavioral witness', () => {
    const subject = receipt();
    const crossOrigin = { ...subject, after: { ...subject.after, targetUrl: 'https://example.net/cart' } };
    const trust = verificationTrust(crossOrigin);
    trust.verifiedRuntimeEvidence = [
      ...trust.verifiedRuntimeEvidence.filter((evidence) => evidence.ref !== 'runtime:after:receipt'),
      { ref: 'runtime:after:receipt', runtimeIdentity: 'runtime-new', origin: 'https://example.net' },
    ];
    const result = evaluateUrlFixVerificationReceipt(crossOrigin, trust);
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
    expect(result.errors.join(' ')).toContain('same origin');
  });

  it('does not launder a different query state through the same pathname', () => {
    const querySpec: UrlFixWitnessSpec = { ...spec, route: '/cart?mode=restored' };
    const fingerprint = createUrlFixWitnessFingerprint(querySpec);
    const subject = receipt({
      witnessSpec: querySpec,
      before: {
        ...receipt().before,
        witnessFingerprint: fingerprint,
        targetUrl: 'https://app.sekretbip.net/cart?mode=restored',
      },
      after: {
        ...receipt().after,
        witnessFingerprint: fingerprint,
        targetUrl: 'https://app.sekretbip.net/cart?mode=fresh',
      },
    });
    const result = evaluateUrlFixVerificationReceipt(subject, verificationTrust(subject));
    expect(result.proofState).toBe('PATCHED');
    expect(result.validSameWitness).toBe(false);
    expect(result.errors.join(' ')).toContain('full witness route');
  });

  it('requires real preview dependencies and a verified preview runtime receipt', () => {
    const subject = receipt();
    const preview = {
      ...subject,
      after: {
        ...subject.after,
        target: 'PREVIEW' as const,
        targetUrl: 'https://preview.sekretbip.net/cart',
        runtimeIdentity: 'preview-runtime',
        runtimeEvidenceRef: 'runtime:preview:receipt',
      },
    };
    const result = evaluateUrlFixVerificationReceipt(preview, verificationTrust(preview));
    expect(result).toEqual({ validSameWitness: true, proofState: 'PREVIEW_BROWSER_PROVEN', errors: [] });
  });

  it('does not prove preview from a real-looking URL without bound runtime evidence', () => {
    const subject = receipt();
    const preview = {
      ...subject,
      after: {
        ...subject.after,
        target: 'PREVIEW' as const,
        targetUrl: 'https://preview.sekretbip.net/cart',
        runtimeIdentity: 'preview-runtime',
        runtimeEvidenceRef: 'untrusted-preview-runtime',
      },
    };
    const trust = verificationTrust(preview);
    trust.verifiedRuntimeEvidence = trust.verifiedRuntimeEvidence.filter((evidence) => evidence.ref !== 'untrusted-preview-runtime');
    const result = evaluateUrlFixVerificationReceipt(preview, trust);
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
    expect(result.errors.join(' ')).toContain('preview runtime identity');
  });

  it('rejects a runtime evidence ref reused for a different runtime identity', () => {
    const subject = receipt();
    const forged = { ...subject, after: { ...subject.after, runtimeIdentity: 'runtime-not-in-receipt' } };
    const result = evaluateUrlFixVerificationReceipt(forged, verificationTrust(forged));
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
    expect(result.errors.join(' ')).toContain('repaired runtime identity');
  });

  it('rejects live proof when the failing baseline runtime has no bound receipt', () => {
    const subject = receipt();
    const forged = { ...subject, before: { ...subject.before, runtimeEvidenceRef: 'stale-or-missing-receipt' } };
    const trust = verificationTrust(forged);
    trust.verifiedRuntimeEvidence = trust.verifiedRuntimeEvidence.filter((evidence) => evidence.ref !== 'stale-or-missing-receipt');
    const result = evaluateUrlFixVerificationReceipt(forged, trust);
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
    expect(result.errors.join(' ')).toContain('baseline runtime identity');
  });

  it('never lets mocked live dependencies establish live proof', () => {
    const subject = receipt();
    const mocked = { ...subject, after: { ...subject.after, evidenceMode: 'MOCKED' as const } };
    const result = evaluateUrlFixVerificationReceipt(mocked, verificationTrust(mocked));
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
  });

  it('allows a fixture to prove only the local browser layer', () => {
    const subject = receipt();
    const local = {
      ...subject,
      before: {
        ...subject.before,
        target: 'LOCAL' as const,
        targetUrl: 'http://127.0.0.1:4173/cart',
        evidenceMode: 'FIXTURE' as const,
        runtimeIdentity: 'fixture-before',
        runtimeEvidenceRef: null,
      },
      after: {
        ...subject.after,
        target: 'LOCAL' as const,
        targetUrl: 'http://127.0.0.1:4173/cart',
        evidenceMode: 'FIXTURE' as const,
        runtimeIdentity: 'fixture-after',
        runtimeEvidenceRef: null,
      },
    };
    const trust = verificationTrust(local);
    trust.verifiedRuntimeEvidence = [];
    const result = evaluateUrlFixVerificationReceipt(local, trust);
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
    const result = evaluateUrlFixUrlBinding({ ...binding, finalUrl: 'https://example.net/cart' }, FULL_TRUST);
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
