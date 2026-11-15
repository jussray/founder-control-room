import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARNING_OS_CONTRACT, assertCrossMissionApplication,
  assertLearningTransition, canClaimLearningImproved, lessonUsableAt,
} from '../src/learning-os/lifecycle.ts';

test('learning is a separate contract and cannot skip learning stages', () => {
  assert.equal(LEARNING_OS_CONTRACT, 'juss/learning-os@v1');
  for (const [from, to] of [
    ['OUTCOME_RECORDED', 'SIGNAL_EXTRACTED'],
    ['SIGNAL_EXTRACTED', 'INTERPRETED'],
    ['INTERPRETED', 'RETAINED'],
    ['RETAINED', 'APPLIED'],
    ['APPLIED', 'REVISED'],
    ['APPLIED', 'RETIRED'],
  ]) assert.doesNotThrow(() => assertLearningTransition(from, to));
  for (const [from, to] of [
    ['OUTCOME_RECORDED', 'APPLIED'],
    ['INTERPRETED', 'APPLIED'],
    ['RETAINED', 'REVISED'],
    ['RETIRED', 'RETAINED'],
    ['APPLIED', 'APPLIED'],
  ]) assert.throws(() => assertLearningTransition(from, to), /LEARNING_ILLEGAL_TRANSITION/);
});
test('self citation is prohibited and cross domain requires explanation', () => {
  const base = { originMissionId: 'A', targetMissionId: 'B', originDomain: 'ci', targetDomain: 'ci' };
  assert.doesNotThrow(() => assertCrossMissionApplication(base));
  assert.throws(() => assertCrossMissionApplication({...base, targetMissionId: 'A'}), /SELF_CITATION/);
  assert.throws(() => assertCrossMissionApplication({...base, targetDomain: 'auth'}), /CROSS_DOMAIN_REASON/);
  assert.doesNotThrow(() => assertCrossMissionApplication({
    ...base, targetDomain: 'auth', crossDomainReason: 'Same proof expiry race affects the login gate.',
  }));
});
test('applied and retained do not constitute measured improvement', () => {
  const base = {
    state: 'APPLIED', observedApplicationOutcome: 'held',
    demonstratedImprovement: true, distinctEvidenceRefs: ['receipt-1'],
  };
  assert.equal(canClaimLearningImproved(base), false);
  assert.equal(canClaimLearningImproved({...base, state:'REVISED', distinctEvidenceRefs: []}), false);
  assert.equal(canClaimLearningImproved({...base, state:'REVISED', observedApplicationOutcome: 'partial'}), false);
  assert.equal(canClaimLearningImproved({...base, state:'REVISED'}), true);
});
test('expiry prevents use but does not discard verified historical records', () => {
  assert.equal(lessonUsableAt('2026-11-05T00:00:00Z','2026-11-06T00:00:00Z'),false);
  assert.equal(lessonUsableAt('2026-11-07T00:00:00Z','2026-11-06T00:00:00Z'),true);
  assert.equal(lessonUsableAt('bogus','2026-11-06T00:00:00Z'),false);
});
