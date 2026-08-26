import { describe, expect, it } from 'vitest';
import {
  ATTACK20_DEFINITIONS,
  ATTACK20_DEPENDENCIES,
  ATTACK20_IDS,
  aggregateSecurityStates,
  aggregateWorkerAttack20Status,
  evaluateReceiptFreshness,
  fingerprintNormalized,
  generateAttack20ApplicabilityPlan,
  validateCookieLineage,
  validateProofBinding,
  type Attack20Id,
  type Attack20ReceiptV3,
  type FingerprintClass,
  type ProofBinding,
  type ProofCookieContract,
  type WorkerApplicabilityInput,
} from './attack20V3.js';

const NOW = new Date('2026-08-26T12:00:00.000Z');
const FINGERPRINT_CLASSES: FingerprintClass[] = [
  'sourceSha', 'runtime', 'ingress', 'routes', 'access', 'waf', 'rateLimit', 'schema',
  'bindings', 'rls', 'authority', 'provider', 'fixture', 'evidenceBundle',
];

function cookie(overrides: Partial<ProofCookieContract> = {}): ProofCookieContract {
  return {
    cookieId: 'pc_verification_000001',
    contextType: 'verification-run',
    owner: 'principal:fcr-verifier',
    createdAt: '2026-08-26T11:00:00.000Z',
    expiresAt: '2026-08-27T11:00:00.000Z',
    parentCookieId: null,
    revokedAt: null,
    ...overrides,
  };
}

function fingerprints(seed = 'current'): Record<FingerprintClass, string> {
  return Object.fromEntries(
    FINGERPRINT_CLASSES.map((key) => [key, fingerprintNormalized({ key, seed })]),
  ) as Record<FingerprintClass, string>;
}

function binding(overrides: Partial<ProofBinding> = {}): ProofBinding {
  return {
    fingerprints: fingerprints(),
    cookieContract: cookie(),
    ...overrides,
  };
}

function allCapabilities(): WorkerApplicabilityInput {
  return {
    project: 'fcr',
    worker: 'founder-control-room',
    environment: 'production',
    capabilities: {
      publicHttp: true,
      authenticatedUser: true,
      serviceOnlyBoundaries: true,
      providerWebhook: true,
      tenantOwnedData: true,
      mutableProtectedFields: true,
      businessStateMachine: true,
      supabaseData: true,
      consequentialActions: true,
      providerMutation: true,
      runtimeOutcomeClaims: true,
      schemaGoverned: true,
    },
    capabilityAbsenceEvidence: {},
  };
}

function receipt(attackId: Attack20Id, verdict: 'PASS' | 'FAILED' | 'UNVERIFIED' = 'PASS'): Attack20ReceiptV3 {
  return {
    receiptId: `receipt-${attackId}`,
    runId: 'run-attack20-0001',
    attackId,
    suiteVersion: 'attack-20-v3',
    target: {
      project: 'fcr',
      worker: 'founder-control-room',
      environment: 'production',
      hostname: 'api.foundercontrolroom.org',
      route: '/synthetic/security-proof',
      ingressSurface: 'custom-domain',
    },
    test: {
      fixtureId: `fixture-${attackId}`,
      requestFingerprint: fingerprintNormalized({ attackId, fixture: 'synthetic' }),
      expectedOutcome: 'PASS',
      observedOutcome: verdict === 'PASS' ? 'PASS' : verdict === 'FAILED' ? 'FAILED' : 'UNKNOWN',
      statusCode: verdict === 'PASS' ? 200 : null,
      sideEffectObserved: false,
      applicationReached: false,
      executedAt: '2026-08-26T11:30:00.000Z',
    },
    evidence: {
      cloudflareRayId: 'ray-synthetic',
      edgeRuleIds: [],
      accessPolicyIds: [],
      applicationEventIds: ['app-event-synthetic'],
      authorityReceiptIds: [],
      providerActionIds: [],
      runtimeReadbackIds: ['runtime-readback-synthetic'],
    },
    dependsOn: ATTACK20_DEPENDENCIES[attackId],
    proofBinding: binding(),
    verdict,
    reason: verdict === 'FAILED' ? 'synthetic defensive failure' : null,
    expiresAt: '2026-08-27T11:00:00.000Z',
  };
}

describe('ATTACK-20 V3', () => {
  it('locks the canonical A01-A20 numbering and layer anchors', () => {
    expect(ATTACK20_DEFINITIONS).toHaveLength(20);
    expect(ATTACK20_DEFINITIONS.map((item) => item.id)).toEqual(ATTACK20_IDS);
    expect(ATTACK20_DEFINITIONS.find((item) => item.id === 'A07')?.name).toBe('alternate-ingress-bypass');
    expect(ATTACK20_DEFINITIONS.find((item) => item.id === 'A10')?.name).toBe('webhook-forgery-replay');
    expect(ATTACK20_DEFINITIONS.find((item) => item.id === 'A11')?.name).toBe('bola');
    expect(ATTACK20_DEFINITIONS.find((item) => item.id === 'A12')?.name).toBe('bopla-mass-assignment');
    expect(ATTACK20_DEFINITIONS.find((item) => item.id === 'A15')?.name).toBe('self-approval-scope-escalation');
    expect(ATTACK20_DEFINITIONS.find((item) => item.id === 'A18')?.name).toBe('provider-runtime-false-success');
    expect(ATTACK20_DEFINITIONS.find((item) => item.id === 'A19')?.name).toBe('observability-failure');
    expect(ATTACK20_DEFINITIONS.find((item) => item.id === 'A20')?.name).toBe('dependency-fingerprint-freshness');
  });

  it('fingerprints normalized state deterministically instead of depending on object key order', () => {
    expect(fingerprintNormalized({ a: 1, b: { c: 2, d: 3 } })).toBe(
      fingerprintNormalized({ b: { d: 3, c: 2 }, a: 1 }),
    );
    expect(fingerprintNormalized({ a: 1 })).not.toBe(fingerprintNormalized({ a: 2 }));
  });

  it('treats proof cookies as expiring provenance and rejects broken lineage', () => {
    const parent = cookie({ cookieId: 'pc_founder_parent_001', contextType: 'founder-session', createdAt: '2026-08-26T10:00:00.000Z' });
    const child = cookie({ cookieId: 'pc_builder_child_0001', contextType: 'builder-run', parentCookieId: parent.cookieId });
    const index = new Map([[parent.cookieId, parent], [child.cookieId, child]]);

    expect(validateCookieLineage(child, index, NOW)).toEqual([]);
    expect(validateCookieLineage({ ...child, parentCookieId: 'pc_missing_parent_001' }, index, NOW)).toContain(
      'unknown parent proof cookie: pc_missing_parent_001',
    );
    expect(validateProofBinding({ fingerprints: fingerprints(), cookieContract: cookie({ expiresAt: '2026-08-26T11:59:59.000Z' }) }, ['runtime'], NOW))
      .toContain('proof cookie is expired');
  });

  it('always emits all 20 applicability rows and never turns absence-without-proof into NOT_APPLICABLE', () => {
    const input = allCapabilities();
    input.capabilities.providerWebhook = false;
    input.capabilities.tenantOwnedData = 'unknown';
    input.capabilityAbsenceEvidence = {
      A10: ['No provider webhook route exists in the declared Worker contract.'],
    };

    const plan = generateAttack20ApplicabilityPlan(input, binding());
    expect(plan).toHaveLength(20);
    expect(new Set(plan.map((item) => item.attackId)).size).toBe(20);
    expect(plan.find((item) => item.attackId === 'A10')?.decision).toBe('NOT_APPLICABLE');
    expect(plan.find((item) => item.attackId === 'A11')?.decision).toBe('BLOCKED_BY_DISCOVERY');

    input.capabilityAbsenceEvidence = {};
    expect(generateAttack20ApplicabilityPlan(input, binding()).find((item) => item.attackId === 'A10')?.decision)
      .toBe('BLOCKED_BY_DISCOVERY');
  });

  it('invalidates only receipt dependencies whose current fingerprint changed', () => {
    const current = fingerprints();
    const a11 = receipt('A11');
    current.rls = fingerprintNormalized({ changed: 'rls' });

    const decision = evaluateReceiptFreshness(a11, current, new Map([[a11.proofBinding.cookieContract.cookieId, a11.proofBinding.cookieContract]]), NOW);
    expect(decision.verdict).toBe('UNVERIFIED');
    expect(decision.invalidatedBy).toEqual(['rls']);
    expect(decision.reason).toContain('rls fingerprint changed');
  });

  it('does not preserve a stale red or stale green as current truth', () => {
    const plan = generateAttack20ApplicabilityPlan(allCapabilities(), binding());
    const receipts = ATTACK20_IDS.map((id) => receipt(id));
    const staleFailure = receipt('A11', 'FAILED');
    staleFailure.proofBinding = binding({
      fingerprints: { ...fingerprints(), rls: fingerprintNormalized({ state: 'old-rls' }) },
    });
    receipts[ATTACK20_IDS.indexOf('A11')] = staleFailure;
    const proofCookie = cookie();

    expect(aggregateWorkerAttack20Status({
      plan,
      receipts,
      currentFingerprints: fingerprints(),
      cookieIndex: new Map([[proofCookie.cookieId, proofCookie]]),
      now: NOW,
    })).toBe('UNVERIFIED');
  });

  it('fails a Worker on a fresh demonstrated bypass and never averages it away', () => {
    const plan = generateAttack20ApplicabilityPlan(allCapabilities(), binding());
    const receipts = ATTACK20_IDS.map((id) => receipt(id));
    receipts[ATTACK20_IDS.indexOf('A07')] = receipt('A07', 'FAILED');
    const proofCookie = cookie();

    const worker = aggregateWorkerAttack20Status({
      plan,
      receipts,
      currentFingerprints: fingerprints(),
      cookieIndex: new Map([[proofCookie.cookieId, proofCookie]]),
      now: NOW,
    });

    expect(worker).toBe('FAILED');
    expect(aggregateSecurityStates(['PASS', worker, 'PASS'])).toBe('FAILED');
  });

  it('passes only when every applicable attack has a fresh PASS receipt', () => {
    const plan = generateAttack20ApplicabilityPlan(allCapabilities(), binding());
    const receipts = ATTACK20_IDS.map((id) => receipt(id));
    const proofCookie = cookie();

    expect(aggregateWorkerAttack20Status({
      plan,
      receipts,
      currentFingerprints: fingerprints(),
      cookieIndex: new Map([[proofCookie.cookieId, proofCookie]]),
      now: NOW,
    })).toBe('PASS');
  });
});
