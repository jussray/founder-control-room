import { describe, it, expect } from 'vitest';
import { LEARNING_OS_CONTRACT, beginLearningStudy, advanceLearningStudy, readLearningStudy, type LearningStudy, type LearningStep } from './learningOs.js';
import { V10_OUTCOME_OBSERVATION_CONTRACT, type V10OutcomeObservation } from '../founder-os-lab/outcomeObservation.js';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const RECEIPT_A = 'fcr-conveyor-receipt-v3:' + 'a'.repeat(64);
const RECEIPT_B = 'fcr-conveyor-receipt-v3:' + 'b'.repeat(64);
const permitted = () => true;

function receipt(goalSucceeded: boolean): V10OutcomeObservation {
  return {
    contract: V10_OUTCOME_OBSERVATION_CONTRACT,
    capabilityPlanHash: 'f'.repeat(64),
    executionReceiptId: RECEIPT_A,
    observedAt: '2026-11-06T12:00:00Z',
    verified: true,
    goalSucceeded,
    founderOverride: false,
    rollbackUsed: false,
    retries: 0,
    evidenceCompleteness: 100,
    outcomeSignals: ['independent runtime evidence'],
    evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
    metrics: [],
  };
}

function create(goalSucceeded = true): LearningStudy {
  return beginLearningStudy({
    project: 'founder-control-room',
    headSha: SHA_A,
    outcome: receipt(goalSucceeded),
    statement: 'Verified runtime result, not an assumed success',
    verifiedBy: 'independent-check',
    verifyOutcome: permitted,
  });
}

function progress(study: LearningStudy, phase: LearningStep['phase'], at: string, extra: Partial<LearningStep> = {}): LearningStudy {
  return advanceLearningStudy(study, {
    phase, recordedAt: at, statement: phase + ' observation',
    evidenceRefs: ['receipt:' + phase],
    ...extra,
  }, permitted);
}

describe('Learning OS independent outcome-to-knowledge boundary', () => {
  it('observes verified successes and failures without awarding authority or unearned learning', () => {
    const success = create();
    const failure = create(false);
    expect(success.contract).toBe(LEARNING_OS_CONTRACT);
    expect(failure.source.result).toBe('failed');
    expect(readLearningStudy(success)).toMatchObject({
      phase: 'observed', learningDemonstrated: false,
      improvementObserved: false, authorityGranted: false,
    });
    expect(() => beginLearningStudy({
      project: 'founder-control-room', headSha: SHA_A,
      outcome: { ...receipt(true), verified: false, goalSucceeded: null },
      statement: 'unverified', verifiedBy: 'independent-check',
      verifyOutcome: permitted,
    })).toThrow(/verified success or failure/);
    expect(() => beginLearningStudy({
      project: 'founder-control-room', headSha: SHA_A,
      outcome: receipt(true), statement: 'unverified',
      verifiedBy: 'model-only', verifyOutcome: () => false,
    })).toThrow(/independent earned-outcome/);
  });

  it('retention is not application, and verified reuse is not improvement', () => {
    let s = create();
    s = progress(s, 'interpreted', '2026-11-06T12:01:00Z', { falsifier: 'Check regressions on another project' });
    s = progress(s, 'learned', '2026-11-06T12:02:00Z');
    s = progress(s, 'retained', '2026-11-06T12:03:00Z', { retentionRef: 'canon:fcr/reuse-lesson' });
    expect(readLearningStudy(s).learningDemonstrated).toBe(false);
    expect(() => progress(s, 'applied', '2026-11-06T12:04:00Z', {
      application: { project: 'chief-ai-machine', headSha: SHA_B, outcomeReceiptId: RECEIPT_A },
    })).toThrow(/same execution/);
    s = progress(s, 'applied', '2026-11-06T12:04:00Z', {
      application: { project: 'chief-ai-machine', headSha: SHA_B, outcomeReceiptId: RECEIPT_B },
    });
    expect(readLearningStudy(s)).toMatchObject({ phase: 'applied', learningDemonstrated: true, improvementObserved: false });
    expect(() => progress(s, 'improved', '2026-11-06T12:05:00Z', {
      improvement: { name: 'error rate', before: 10, after: 15, betterWhen: 'lower', unit: 'per-hour' },
    })).toThrow(/directional improvement/);
    s = progress(s, 'improved', '2026-11-06T12:05:00Z', {
      improvement: { name: 'error rate', before: 10, after: 2, betterWhen: 'lower', unit: 'per-hour' },
    });
    expect(readLearningStudy(s).improvementObserved).toBe(true);
    expect(readLearningStudy(s).authorityGranted).toBe(false);
  });

  it('rejects out-of-order states, evidence tampering, and challenges prior learning', () => {
    let s = create();
    expect(() => progress(s, 'applied', '2026-11-06T12:01:00Z')).toThrow(/illegal transition/);
    const forged: LearningStudy = structuredClone(s);
    forged.source.result = 'failed';
    expect(() => readLearningStudy(forged)).toThrow(/source evidence tampering/);
    s = progress(s, 'interpreted', '2026-11-06T12:01:00Z', { falsifier: 'Try independent reproduction' });
    s = progress(s, 'challenged', '2026-11-06T12:02:00Z');
    expect(readLearningStudy(s)).toMatchObject({ phase: 'challenged', learningDemonstrated: false });
    const tampered = structuredClone(s);
    tampered.events[1].statement = 'rewritten history';
    expect(() => readLearningStudy(tampered)).toThrow(/tampering/);
  });
});
