import { describe, expect, it } from 'vitest';
import { assertLearningTransition, assertCrossMissionApplication, canClaimLearningImproved, lessonUsableAt } from './lifecycle.js';

describe('Learning OS SQL-facing lifecycle invariants', () => {
  it('denies state-skipping and any transition out of retirement', () => {
    expect(() => assertLearningTransition('OUTCOME_RECORDED', 'APPLIED')).toThrow('LEARNING_ILLEGAL_TRANSITION');
    expect(() => assertLearningTransition('INTERPRETED', 'APPLIED')).toThrow('LEARNING_ILLEGAL_TRANSITION');
    expect(() => assertLearningTransition('RETAINED', 'APPLIED')).not.toThrow();
    expect(() => assertLearningTransition('RETIRED', 'APPLIED')).toThrow('LEARNING_ILLEGAL_TRANSITION');
  });
  it('denies self-citation and unjustified cross-domain reuse', () => {
    const input = { originMissionId: 'first', targetMissionId: 'second', originDomain:'ci', targetDomain:'auth' };
    expect(() => assertCrossMissionApplication({...input,targetMissionId:'first'})).toThrow('SELF_CITATION');
    expect(() => assertCrossMissionApplication(input)).toThrow('CROSS_DOMAIN_REASON_REQUIRED');
    expect(() => assertCrossMissionApplication({...input,crossDomainReason:'Same verification-freshness flaw crosses subsystem boundaries.'})).not.toThrow();
  });
  it('does not claim improvement from mere retention or application', () => {
    const evidence = {observedApplicationOutcome:'held' as const,demonstratedImprovement:true,distinctEvidenceRefs:['outcome:verified']};
    expect(canClaimLearningImproved({...evidence,state:'RETAINED'})).toBe(false);
    expect(canClaimLearningImproved({...evidence,state:'APPLIED'})).toBe(false);
    expect(canClaimLearningImproved({...evidence,state:'REVISED',distinctEvidenceRefs:[]})).toBe(false);
    expect(canClaimLearningImproved({...evidence,state:'REVISED'})).toBe(true);
  });
  it('expires applicability without erasing historical learning', () => {
    expect(lessonUsableAt('2026-11-01T00:00:00Z','2026-11-06T00:00:00Z')).toBe(false);
    expect(lessonUsableAt('2026-12-01T00:00:00Z','2026-11-06T00:00:00Z')).toBe(true);
  });
});
