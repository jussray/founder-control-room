import { describe, expect, it } from 'vitest';
import { canonicalSerialize } from '../src/canonical-serialize.js';
import { evaluateMainEvidenceV0 } from '../src/evaluator.js';
import { CORRELATION_ID, NOW, policy, qualifyingWitnesses, sourceAuthority } from '../src/fixtures/baseline.js';

describe('evaluateMainEvidenceV0', () => {
  it('verifies only a complete qualifying witness set', () => {
    const output = evaluateMainEvidenceV0({
      sourceAuthority: sourceAuthority(),
      policy,
      witnesses: qualifyingWitnesses(),
      now: NOW,
      correlationId: CORRELATION_ID,
    });

    expect(output.decision.state).toBe('VERIFIED');
    expect(output.decision.reason).toBe('RECOVERY_COMPLETE');
    expect(output.projection.promotionBlocked).toBe(false);
  });

  it('is byte-identical for identical semantic input', () => {
    const input = {
      sourceAuthority: sourceAuthority(),
      policy,
      witnesses: qualifyingWitnesses(),
      now: NOW,
      correlationId: CORRELATION_ID,
    } as const;

    expect(canonicalSerialize(evaluateMainEvidenceV0(input)))
      .toBe(canonicalSerialize(evaluateMainEvidenceV0(input)));
  });

  it('is invariant to witness transport ordering', () => {
    const witnesses = qualifyingWitnesses();
    const forward = evaluateMainEvidenceV0({ sourceAuthority: sourceAuthority(), policy, witnesses, now: NOW, correlationId: CORRELATION_ID });
    const reversed = evaluateMainEvidenceV0({ sourceAuthority: sourceAuthority(), policy, witnesses: [...witnesses].reverse(), now: NOW, correlationId: CORRELATION_ID });

    expect(canonicalSerialize(forward)).toBe(canonicalSerialize(reversed));
  });
});
