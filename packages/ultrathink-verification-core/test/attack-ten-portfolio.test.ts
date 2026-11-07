import { describe, expect, it } from 'vitest';
import { canonicalSerialize } from '../src/canonical-serialize.js';
import { evaluateMainEvidenceV0 } from '../src/evaluator.js';
import type { MainEvidenceDecisionV0 } from '../src/main-evidence-decision.v0.js';
import type { WitnessResultV0 } from '../src/witness-result.v0.js';
import {
  CODE_SCENARIO,
  CORRELATION_ID,
  NOW,
  POLICY_HASH,
  PRODUCT_SCENARIO,
  SHA_A,
  SHA_B,
  SHA_C,
  passingWitness,
  policy,
  qualifyingWitnesses,
  sourceAuthority,
} from '../src/fixtures/baseline.js';

function previousVerified(sha = SHA_A): MainEvidenceDecisionV0 {
  return {
    kind: 'main-evidence-decision.v0',
    repo: policy.repo,
    branch: 'main',
    authoritativeSha: sha,
    lastVerifiedSha: sha,
    state: 'VERIFIED',
    reason: 'RECOVERY_COMPLETE',
    policyHash: POLICY_HASH,
    missingWitnessIds: [],
    evaluatedAt: '2026-08-23T21:00:00.000Z',
    correlationId: 'previous',
  };
}

function evaluate(witnesses: readonly WitnessResultV0[], sha = SHA_A, previousDecision?: MainEvidenceDecisionV0) {
  return evaluateMainEvidenceV0({
    sourceAuthority: sourceAuthority(sha),
    policy,
    witnesses,
    now: NOW,
    correlationId: CORRELATION_ID,
    previousDecision,
  }).decision;
}

describe('Attack Ten portfolio refusal suite', () => {
  it('1: stale evidence for an earlier SHA cannot verify new main', () => {
    const decision = evaluate(qualifyingWitnesses(SHA_A), SHA_B, previousVerified(SHA_A));
    expect(decision.state).toBe('STALE');
    expect(decision.reason).toBe('MAIN_SHA_CHANGED');
    expect(decision.lastVerifiedSha).toBe(SHA_A);
  });

  it('2: A -> B -> C with B proof cannot verify C', () => {
    const decision = evaluate(qualifyingWitnesses(SHA_B), SHA_C, previousVerified(SHA_A));
    expect(decision.state).toBe('STALE');
    expect(decision.authoritativeSha).toBe(SHA_C);
    expect(decision.lastVerifiedSha).toBe(SHA_A);
  });

  it('3: missing required witness is UNKNOWN', () => {
    const decision = evaluate([passingWitness('code.required-ci')]);
    expect(decision.state).toBe('UNKNOWN');
    expect(decision.reason).toBe('REQUIRED_WITNESS_MISSING');
    expect(decision.missingWitnessIds).toEqual(['product.critical-journey']);
  });

  it('4: failed required witness is BLOCKED', () => {
    const failed = { ...passingWitness('product.critical-journey'), state: 'FAIL' as const };
    const decision = evaluate([passingWitness('code.required-ci'), failed]);
    expect(decision.state).toBe('BLOCKED');
    expect(decision.reason).toBe('WITNESS_FAILED');
  });

  it('5: unresolvable required witness is BLOCKED', () => {
    const unavailable = { ...passingWitness('product.critical-journey'), state: 'UNRESOLVABLE' as const };
    const decision = evaluate([passingWitness('code.required-ci'), unavailable]);
    expect(decision.state).toBe('BLOCKED');
    expect(decision.reason).toBe('WITNESS_UNRESOLVABLE');
  });

  it('6a: PASS without evidenceRef is UNKNOWN', () => {
    const weak = { ...passingWitness('product.critical-journey'), evidenceRef: undefined };
    const decision = evaluate([passingWitness('code.required-ci'), weak]);
    expect(decision.state).toBe('UNKNOWN');
    expect(decision.reason).toBe('INVALID_WITNESS_EVIDENCE');
  });

  it('6b: PASS without evidenceHash is UNKNOWN', () => {
    const weak = { ...passingWitness('product.critical-journey'), evidenceHash: undefined };
    const decision = evaluate([passingWitness('code.required-ci'), weak]);
    expect(decision.state).toBe('UNKNOWN');
    expect(decision.reason).toBe('INVALID_WITNESS_EVIDENCE');
  });

  it('7: policy drift is STALE', () => {
    const drifted = { ...passingWitness('product.critical-journey'), policyHash: ('sha256:' + '9'.repeat(64)) as typeof POLICY_HASH };
    const decision = evaluate([passingWitness('code.required-ci'), drifted]);
    expect(decision.state).toBe('STALE');
    expect(decision.reason).toBe('POLICY_CHANGED');
  });

  it('8: scenario drift is STALE', () => {
    const drifted = { ...passingWitness('product.critical-journey'), scenarioFingerprint: CODE_SCENARIO };
    const decision = evaluate([passingWitness('code.required-ci'), drifted]);
    expect(PRODUCT_SCENARIO).not.toBe(CODE_SCENARIO);
    expect(decision.state).toBe('STALE');
    expect(decision.reason).toBe('SCENARIO_MISMATCH');
  });

  it('9: expired evidence is STALE', () => {
    const expired = { ...passingWitness('product.critical-journey'), expiresAt: '2026-08-23T21:59:59.000Z' };
    const decision = evaluate([passingWitness('code.required-ci'), expired]);
    expect(decision.state).toBe('STALE');
    expect(decision.reason).toBe('EVIDENCE_EXPIRED');
  });

  it('10: identity reconciliation cannot replace a missing product witness', () => {
    const identityOnly = passingWitness('code.required-ci');
    const decision = evaluate([identityOnly]);
    expect(decision.state).toBe('UNKNOWN');
    expect(decision.state).not.toBe('VERIFIED');
  });

  it('rejects a PASS witness issued for another repository', () => {
    const foreign = { ...passingWitness('product.critical-journey'), repo: 'jussray/foreign-project' };
    const decision = evaluate([passingWitness('code.required-ci'), foreign]);
    expect(decision.state).toBe('UNKNOWN');
    expect(decision.reason).toBe('INVALID_WITNESS_EVIDENCE');
  });

  it('rejects a PASS witness with invalid branch provenance', () => {
    const wrongBranch = { ...passingWitness('product.critical-journey'), branch: 'feature' as unknown as 'main' };
    const decision = evaluate([passingWitness('code.required-ci'), wrongBranch]);
    expect(decision.state).toBe('UNKNOWN');
    expect(decision.reason).toBe('INVALID_WITNESS_EVIDENCE');
  });

  it('duplicate witness results fail closed independent of transport order', () => {
    const pass = passingWitness('product.critical-journey');
    const fail = { ...pass, state: 'FAIL' as const, correlationId: 'duplicate-fail' };
    const code = passingWitness('code.required-ci');

    const forward = evaluateMainEvidenceV0({
      sourceAuthority: sourceAuthority(),
      policy,
      witnesses: [code, pass, fail],
      now: NOW,
      correlationId: CORRELATION_ID,
    });
    const reversed = evaluateMainEvidenceV0({
      sourceAuthority: sourceAuthority(),
      policy,
      witnesses: [fail, pass, code],
      now: NOW,
      correlationId: CORRELATION_ID,
    });

    expect(forward.decision.state).toBe('UNKNOWN');
    expect(forward.decision.reason).toBe('INVALID_WITNESS_EVIDENCE');
    expect(canonicalSerialize(forward)).toBe(canonicalSerialize(reversed));
  });

  it('duplicate required witness IDs fail closed as invalid policy', () => {
    const duplicatePolicy = {
      ...policy,
      requiredWitnesses: [policy.requiredWitnesses[0], policy.requiredWitnesses[0]],
    };
    const result = evaluateMainEvidenceV0({
      sourceAuthority: sourceAuthority(),
      policy: duplicatePolicy,
      witnesses: qualifyingWitnesses(),
      now: NOW,
      correlationId: CORRELATION_ID,
    });
    expect(result.decision.state).toBe('BLOCKED');
    expect(result.decision.reason).toBe('INVALID_WITNESS_POLICY');
  });

  it('source authority unavailable is BLOCKED', () => {
    const decision = evaluateMainEvidenceV0({
      sourceAuthority: null,
      policy,
      witnesses: qualifyingWitnesses(),
      now: NOW,
      correlationId: CORRELATION_ID,
    }).decision;
    expect(decision.state).toBe('BLOCKED');
    expect(decision.reason).toBe('SOURCE_AUTHORITY_UNRESOLVED');
  });
});
