import { describe, expect, it } from 'vitest';
import { evaluateEvidenceDecision } from '../evidenceDecisionLoop.js';

const fingerprint = 'f7ed2e6122c44b137cdf6686e692515c324ff925';
const proof = (plane: 'source' | 'execution' | 'outcome') => ({
  plane,
  state: 'VERIFIED' as const,
  ref: 'https://example.com/proof',
});

describe('Evidence Decision Loop v1', () => {
  it('treats founder/execution confirmation as progress, not outcome proof', () => {
    const result = evaluateEvidenceDecision({
      subjectFingerprint: fingerprint,
      evidence: [proof('execution')],
      signals: { secondary: 'improved' },
    });

    expect(result.claimState).toBe('OBSERVED');
    expect(result.outcomeVerified).toBe(false);
    expect(result.winnerAllowed).toBe(false);
    expect(result.recommendation).toBe('MEASURE');
  });

  it('cannot crown a winner from a secondary signal', () => {
    const result = evaluateEvidenceDecision({
      subjectFingerprint: fingerprint,
      evidence: [proof('execution')],
      signals: { primary: 'unknown', secondary: 'improved' },
    });

    expect(result.winnerAllowed).toBe(false);
  });

  it('invalidates predecessor proof after fingerprint movement', () => {
    const result = evaluateEvidenceDecision({
      subjectFingerprint: 'new-head',
      expectedFingerprint: 'old-head',
      evidence: [proof('outcome')],
      signals: { primary: 'improved' },
    });

    expect(result.claimState).toBe('UNKNOWN');
    expect(result.recommendation).toBe('REOBSERVE');
  });

  it('only proposes keep after verified primary outcome and never self-authorizes', () => {
    const result = evaluateEvidenceDecision({
      subjectFingerprint: fingerprint,
      evidence: [proof('execution'), proof('outcome')],
      signals: { primary: 'improved', secondary: 'improved' },
      consequentialAction: true,
    });

    expect(result.winnerAllowed).toBe(true);
    expect(result.recommendation).toBe('PROPOSE_KEEP');
    expect(result.selfAuthorize).toBe(false);
    expect(result.founderReviewRequired).toBe(true);
  });
});
