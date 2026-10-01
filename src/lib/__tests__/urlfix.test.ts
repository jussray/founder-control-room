import { describe, expect, it } from 'vitest';

import {
  URLFIX_FAILURE_PLANES,
  createUrlFixWitnessFingerprint,
  evaluateUrlFixUrlBinding,
  evaluateUrlFixVerificationReceipt,
  isUrlFixFailurePlane,
  type UrlFixVerificationReceipt,
  type UrlFixWitnessSpec,
} from '../urlfix.js';

const spec: UrlFixWitnessSpec = {
  route: '/cart',
  viewport: { width: 390, height: 844 },
  preconditions: ['cart contains one restored item'],
  actions: ['open /cart', 'click Checkout'],
  expectedObservableResult: 'checkout-ready',
  dependencyMode: 'REAL',
};

function receipt(overrides: Partial<UrlFixVerificationReceipt> = {}): UrlFixVerificationReceipt {
  const fingerprint = createUrlFixWitnessFingerprint(spec);
  return {
    issueId: 'URLFIX-001',
    witnessSpec: spec,
    before: {
      runId: 'before-1',
      witnessFingerprint: fingerprint,
      target: 'LIVE',
      runtimeIdentity: 'runtime-old',
      evidenceMode: 'REAL',
      observedResult: 'checkout-error',
      traceArtifactId: 'trace-before',
      screenshotArtifactId: 'shot-before',
    },
    after: {
      runId: 'after-1',
      witnessFingerprint: fingerprint,
      target: 'LIVE',
      runtimeIdentity: 'runtime-new',
      evidenceMode: 'REAL',
      observedResult: 'checkout-ready',
      traceArtifactId: 'trace-after',
      screenshotArtifactId: 'shot-after',
    },
    ...overrides,
  };
}

describe('urlfix witness proof', () => {
  it('keeps the witness spec stable while preserving distinct execution identities', () => {
    const first = createUrlFixWitnessFingerprint(spec);
    const second = createUrlFixWitnessFingerprint({ ...spec, actions: [...spec.actions] });
    expect(first).toBe(second);

    const result = evaluateUrlFixVerificationReceipt(receipt());
    expect(result).toEqual({ validSameWitness: true, proofState: 'LIVE_BROWSER_PROVEN', errors: [] });
  });

  it('rejects run-id reuse even when the visible result improves', () => {
    const base = receipt();
    const result = evaluateUrlFixVerificationReceipt(receipt({
      after: { ...base.after, runId: base.before.runId },
    }));
    expect(result.validSameWitness).toBe(false);
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
    expect(result.errors.join(' ')).toContain('distinct run IDs');
  });

  it('never lets mocked evidence become live browser proof', () => {
    const base = receipt();
    const result = evaluateUrlFixVerificationReceipt(receipt({
      after: { ...base.after, evidenceMode: 'MOCKED' },
    }));
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
    expect(result.errors.join(' ')).toContain('requires real, non-mocked dependencies');
  });

  it('caps a live repair at patched-not-live while runtime identity is unknown', () => {
    const base = receipt();
    const result = evaluateUrlFixVerificationReceipt(receipt({
      after: { ...base.after, runtimeIdentity: null },
    }));
    expect(result.proofState).toBe('PATCHED_NOT_LIVE');
    expect(result.errors.join(' ')).toContain('runtime identity');
  });

  it('reports local same-witness proof without pretending it is live', () => {
    const base = receipt();
    const result = evaluateUrlFixVerificationReceipt(receipt({
      before: { ...base.before, target: 'LOCAL', runtimeIdentity: 'local-before' },
      after: { ...base.after, target: 'LOCAL', runtimeIdentity: 'local-after' },
    }));
    expect(result.proofState).toBe('LOCAL_BROWSER_PROVEN');
  });
});

describe('urlfix FCR URL binding', () => {
  it('allows bounded source repair for a confirmed active portfolio project even when runtime identity is unknown', () => {
    const result = evaluateUrlFixUrlBinding({
      url: 'https://app.sekretbip.net',
      projectSlug: 'sekret-bip',
      repository: 'jussray/Sekret-Bip',
      ownership: 'OWNED_CONFIRMED',
      ownershipEvidenceRefs: ['fcr:portfolio:sekret-bip'],
      repairScopeAuthorized: true,
      runtimeIdentity: null,
      deploymentProvider: 'cloudflare',
      deploymentProject: 'sekret-bip',
    });

    expect(result.sourceMutationAllowed).toBe(true);
    expect(result.runtimeIdentityKnown).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('does not turn an external or non-authority project into source mutation authority', () => {
    const result = evaluateUrlFixUrlBinding({
      url: 'https://truth.example.com',
      projectSlug: 'truth-weaver',
      repository: 'jussray/truth-weaver',
      ownership: 'OWNED_CONFIRMED',
      ownershipEvidenceRefs: ['human:founder'],
      repairScopeAuthorized: true,
      runtimeIdentity: 'runtime-1',
    });

    expect(result.sourceMutationAllowed).toBe(false);
    expect(result.errors.join(' ')).toContain('not authority-bearing');
  });

  it('rejects repository drift from the canonical project registry', () => {
    const result = evaluateUrlFixUrlBinding({
      url: 'https://app.sekretbip.net',
      projectSlug: 'sekret-bip',
      repository: 'jussray/sekret-bip-demo',
      ownership: 'OWNED_CONFIRMED',
      ownershipEvidenceRefs: ['fcr:portfolio:sekret-bip'],
      repairScopeAuthorized: true,
      runtimeIdentity: 'runtime-1',
    });

    expect(result.sourceMutationAllowed).toBe(false);
    expect(result.errors.join(' ')).toContain('canonical FCR project repository');
  });
});

describe('urlfix failure planes', () => {
  it('uses the bounded failure-plane vocabulary', () => {
    expect(URLFIX_FAILURE_PLANES).toContain('CDN_EDGE');
    expect(isUrlFixFailurePlane('AUTH')).toBe(true);
    expect(isUrlFixFailurePlane('RANDOM_GUESS')).toBe(false);
  });
});
