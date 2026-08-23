import { describe, expect, it } from 'vitest';
import { evaluateMainEvidenceV0 } from '../src/evaluator.js';
import { CORRELATION_ID, NOW, SHA_A, SHA_B, policy, qualifyingWitnesses, sourceAuthority } from '../src/fixtures/baseline.js';

describe('continuity transition', () => {
  it('records exact source movement without inventing authority', () => {
    const prior = evaluateMainEvidenceV0({
      sourceAuthority: sourceAuthority(SHA_A),
      policy,
      witnesses: qualifyingWitnesses(SHA_A),
      now: NOW,
      correlationId: 'prior',
    }).decision;

    expect(prior.state).toBe('VERIFIED');

    const current = evaluateMainEvidenceV0({
      sourceAuthority: sourceAuthority(SHA_B),
      policy,
      witnesses: qualifyingWitnesses(SHA_A),
      now: NOW,
      correlationId: CORRELATION_ID,
      previousDecision: prior,
    });

    expect(current.transition.fromState).toBe('VERIFIED');
    expect(current.transition.toState).toBe('STALE');
    expect(current.transition.fromAuthoritativeSha).toBe(SHA_A);
    expect(current.transition.toAuthoritativeSha).toBe(SHA_B);
    expect(current.transition.reason).toBe('MAIN_SHA_CHANGED');
    expect(current.transition.correlationId).toBe(CORRELATION_ID);
  });
});
