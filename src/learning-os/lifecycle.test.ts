import { describe, expect, it } from 'vitest';
import { assertLearningTransition, assertCrossMissionApplication, canClaimLearningImproved, lessonUsableAt, projectLearningStudyPhase, compareStudyToLedger, expectedLedgerStateFromProofChain, LEARNING_STUDY_PHASES, type LearningReceiptChain } from './lifecycle.js';

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

describe('Study kernel to SQL ledger is truth-preserving, not an authority bridge', () => {
  it('maps both interpreted and learned-candidate to INTERPRETED, never demonstrated learning', () => {
    expect(projectLearningStudyPhase('observed')).toMatchObject({status:'supported',ledgerState:'OUTCOME_RECORDED',demonstratedByPhase:false});
    expect(projectLearningStudyPhase('interpreted')).toMatchObject({ledgerState:'INTERPRETED'});
    expect(projectLearningStudyPhase('learned')).toMatchObject({ledgerState:'INTERPRETED',demonstratedByPhase:false});
    const aligned = compareStudyToLedger('learned','INTERPRETED');
    expect(aligned).toMatchObject({aligned:true,learningDemonstrated:false,improved:false,authorizesExecution:false});
  });
  it('keeps application distinct from improvement and review distinct from hypothesis revision', () => {
    expect(compareStudyToLedger('applied','APPLIED')).toMatchObject({aligned:true,improved:false});
    expect(projectLearningStudyPhase('improved')).toMatchObject({ledgerState:'REVISED',demonstratedByPhase:false});
    expect(compareStudyToLedger('improved','REVISED')).toMatchObject({aligned:true,improved:false});
    expect(compareStudyToLedger('revised','REVISED')).toMatchObject({
      aligned:false,status:'unrepresented_phase',authorizesExecution:false,
    });
    expect(compareStudyToLedger('challenged','INTERPRETED')).toMatchObject({
      aligned:false,status:'unrepresented_phase',
    });
  });
  it('denies state mismatch or unknown study phase, never assumes green', () => {
    expect(compareStudyToLedger('retained','APPLIED')).toMatchObject({
      aligned:false,status:'different_state',learningDemonstrated:false,
    });
    expect(() => projectLearningStudyPhase('RETIRED' as never)).toThrow('LEARNING_UNKNOWN_STUDY_PHASE');
  });
});

describe('Study phase + receipt-chain property: deterministic and fail-closed', () => {
  const full: LearningReceiptChain = {
    originOutcomeVerified: true, originExecutionVerified: true,
    signalVerified: true, interpretationVerified: true,
    retentionVerified: true, downstreamExecutionVerified: true,
    downstreamOutcomeVerified: true, distinctMissionVerified: true,
    sameDomain: true, crossDomainFounderPermissionVerified: true,
    reviewVerified: true, baselineMeasurementVerified: true,
    currentMeasurementVerified: true, directionalImprovementVerified: true,
  };

  it('maps every known study phase only when its independent receipt chain is complete', () => {
    expect(LEARNING_STUDY_PHASES).toHaveLength(8);
    const expected = [
      'OUTCOME_RECORDED', 'INTERPRETED', 'INTERPRETED', 'RETAINED',
      'APPLIED', 'REVISED', null, null,
    ];
    for (const [index, phase] of LEARNING_STUDY_PHASES.entries()) {
      const state = expectedLedgerStateFromProofChain(phase, full);
      expect(state.state).toBe(expected[index]);
      expect(state.authorizesExecution).toBe(false);
      expect(state.learningDemonstrated).toBe(false);
      expect(state.improved).toBe(false);
      expect(expectedLedgerStateFromProofChain(phase, structuredClone(full))).toEqual(state);
    }
  });

  it('is deterministic for all phases across a cross-product of evidence combinations', () => {
    const toggles = [
      'originOutcomeVerified','originExecutionVerified',
      'signalVerified','interpretationVerified','retentionVerified',
      'downstreamOutcomeVerified','crossDomainFounderPermissionVerified',
    ] as const;
    for (let mask=0; mask < (1 << toggles.length); mask++) {
      const chain = {...full, sameDomain: false};
      for (const [bit,key] of toggles.entries()) chain[key] = Boolean(mask & (1 << bit));
      for (const phase of LEARNING_STUDY_PHASES) {
        const actual = expectedLedgerStateFromProofChain(phase, chain);
        const again = expectedLedgerStateFromProofChain(phase, {...chain});
        expect(actual).toEqual(again);
        expect(actual.authorizesExecution).toBe(false);
        if (actual.missing.length > 0) expect(actual.state).toBeNull();
        if (phase === 'challenged' || phase === 'revised') {
          expect(actual.state).toBeNull();
          expect(actual.eligibleForReconciliation).toBe(false);
        }
      }
    }
  });

  it('requires distinct later outcome, founder cross-domain permission and measured baseline before promotion', () => {
    const applyWithoutOutcome = expectedLedgerStateFromProofChain('applied', {
      ...full, downstreamOutcomeVerified: false,
    });
    expect(applyWithoutOutcome).toMatchObject({state:null,eligibleForReconciliation:false});
    expect(applyWithoutOutcome.missing).toContain('downstreamOutcomeVerified');

    const cross = expectedLedgerStateFromProofChain('applied', {
      ...full,sameDomain:false,crossDomainFounderPermissionVerified:false,
    });
    expect(cross.state).toBeNull();
    expect(cross.missing).toContain('crossDomainFounderPermissionVerified');

    const improvement = expectedLedgerStateFromProofChain('improved', {
      ...full,baselineMeasurementVerified:false,
    });
    expect(improvement.state).toBeNull();
    expect(improvement.missing).toContain('baselineMeasurementVerified');
    expect(expectedLedgerStateFromProofChain('improved', {...full}).state).toBe('REVISED');
  });
});
