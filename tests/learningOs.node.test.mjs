import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARNING_OS_CONTRACT, beginLearningStudy, readLearningStudy, advanceLearningStudy,
} from '../src/learning-os/learningOs.ts';

const RECEIPT_A = 'fcr-conveyor-receipt-v3:' + 'a'.repeat(64);
const RECEIPT_B = 'fcr-conveyor-receipt-v3:' + 'b'.repeat(64);
const HEAD_A = 'c'.repeat(40);
const HEAD_B = 'd'.repeat(40);
const VERIFIED_BY_PROVIDER = () => true;
const outcome = (overrides = {}) => ({
  contract: 'juss-v10/outcome-observation@v1',
  capabilityPlanHash: 'f'.repeat(64),
  executionReceiptId: RECEIPT_A,
  observedAt: '2026-11-06T12:00:00Z',
  verified: true,
  goalSucceeded: true,
  founderOverride: false,
  rollbackUsed: false,
  retries: 0,
  evidenceCompleteness: 100,
  outcomeSignals: ['real-path evidence'],
  evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
  metrics: [],
  ...overrides,
});
function start(overrides = {}) {
  return beginLearningStudy({
    project: 'founder-control-room', headSha: HEAD_A,
    outcome: outcome(), statement: 'Production result observed',
    verifiedBy: 'independent-gate', verifyOutcome: VERIFIED_BY_PROVIDER,
    ...overrides,
  });
}
const steps = [
  { phase: 'interpreted', recordedAt: '2026-11-06T12:01:00Z', statement: 'Likely bottleneck removed', falsifier: 'Check later production errors', evidenceRefs: ['receipt:source'] },
  { phase: 'learned', recordedAt: '2026-11-06T12:02:00Z', statement: 'Candidate reusable approach', evidenceRefs: ['receipt:source'] },
  { phase: 'retained', recordedAt: '2026-11-06T12:03:00Z', statement: 'Stored as scoped candidate', retentionRef: 'canon:fcr/bottleneck', evidenceRefs: ['receipt:retention'] },
  { phase: 'applied', recordedAt: '2026-11-06T12:04:00Z', statement: 'Applied to another head', application: { project: 'chief-ai-machine', headSha: HEAD_B, outcomeReceiptId: RECEIPT_B }, evidenceRefs: ['receipt:independent-application'] },
  { phase: 'improved', recordedAt: '2026-11-06T12:05:00Z', statement: 'Observed fewer production errors', improvement: { name: 'errors', before: 10, after: 2, unit: 'per-hour', betterWhen: 'lower' }, evidenceRefs: ['receipt:metric-observation'] },
];
function move(study, step, verified = VERIFIED_BY_PROVIDER) {
  return advanceLearningStudy(study, step, verified);
}
function through(count) {
  return steps.slice(0, count).reduce((s, step) => move(s, step), start());
}

test('creates an independent source-bound observational study; grants no authority', () => {
  const s = start();
  assert.equal(s.contract, LEARNING_OS_CONTRACT);
  assert.equal(readLearningStudy(s).phase, 'observed');
  assert.equal(readLearningStudy(s).authorityGranted, false);
  assert.equal(readLearningStudy(s).learningDemonstrated, false);
  assert.equal(readLearningStudy(s).improvementObserved, false);
});

test('submitted, unverified or absent independent outcome cannot become learned', () => {
  assert.throws(() => start({ outcome: outcome({ verified: false, goalSucceeded: null }) }), /verified success or failure/);
  assert.throws(() => start({ verifyOutcome: () => false }), /independent earned-outcome/);
  assert.throws(() => start({ verifyOutcome: null }), /independent earned-outcome/);
  assert.throws(() => start({ outcome: outcome({ evidenceUrls: [] }) }), /verified success or failure/);
});

test('independently verified failures may be studied without claiming success', () => {
  const s = start({ outcome: outcome({ goalSucceeded: false }) });
  assert.equal(s.source.result, 'failed');
  assert.equal(readLearningStudy(s).phase, 'observed');
});

test('interpretation, learned candidate and retention do not prove application', () => {
  const s = through(3);
  assert.equal(readLearningStudy(s).phase, 'retained');
  assert.equal(readLearningStudy(s).learningDemonstrated, false);
  assert.equal(readLearningStudy(s).improvementObserved, false);
});

test('independent application proves reuse but not measured improvement', () => {
  const s = through(4);
  assert.equal(readLearningStudy(s).phase, 'applied');
  assert.equal(readLearningStudy(s).learningDemonstrated, true);
  assert.equal(readLearningStudy(s).improvementObserved, false);
});

test('directional metric and separate phase witness support observed improvement', () => {
  const s = through(5);
  assert.equal(readLearningStudy(s).improvementObserved, true);
  assert.equal(s.events.length, 6);
  assert.equal(s.events[5].previousHash, s.events[4].eventHash);
});

test('out-of-order, missing verifier, timestamp regression and false step are denied', () => {
  const s = start();
  assert.throws(() => move(s, steps[3]), /illegal transition/);
  assert.throws(() => move(s, steps[0], () => false), /independent phase verification/);
  assert.throws(() => move(s, steps[0], null), /independent phase verification/);
  assert.throws(() => move(s, { ...steps[0], recordedAt: '2026-11-06T11:00:00Z' }), /stale step/);
  assert.throws(() => move(s, { ...steps[0], falsifier: '' }), /falsifier/);
});

test('a lesson cannot reuse its own execution receipt as independent application', () => {
  const s = through(3);
  assert.throws(() => move(s, { ...steps[3], application: { ...steps[3].application, outcomeReceiptId: RECEIPT_A } }), /same execution/);
});

test('improved requires a metric actually better in the declared direction', () => {
  const s = through(4);
  assert.throws(() => move(s, { ...steps[4], improvement: { ...steps[4].improvement, after: 12 } }), /directional improvement/);
});

test('hash tampering, forged predecessor and malformed events fail closed', () => {
  const s = through(2);
  const forged = structuredClone(s);
  forged.events[0].statement = 'forged';
  assert.throws(() => readLearningStudy(forged), /tampering/);
  const missing = structuredClone(s);
  missing.events.shift();
  assert.throws(() => readLearningStudy(missing), /tampering/);
  const extra = structuredClone(s);
  extra.events[0].unknownAuthority = true;
  assert.throws(() => readLearningStudy(extra), /unexpected event fields/);
});

test('challenge and revision revoke demonstrated status until fresh application', () => {
  let s = through(4);
  s = move(s, { phase: 'challenged', recordedAt: '2026-11-06T12:05:00Z', statement: 'Contradictory new evidence', evidenceRefs: ['receipt:contradiction'] });
  assert.equal(readLearningStudy(s).learningDemonstrated, false);
  s = move(s, { phase: 'revised', recordedAt: '2026-11-06T12:06:00Z', statement: 'Reduced applicability', falsifier: 'Test revised scope', evidenceRefs: ['receipt:revision'] });
  assert.equal(readLearningStudy(s).next[0], 'retained');
});
