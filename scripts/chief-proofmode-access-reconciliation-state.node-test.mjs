import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateChiefAccessReconciliation } from './chief-proofmode-access-reconciliation-state.mjs';

const TARGET = 'https://624e00c7-chief-ai.mcgill-raylene.workers.dev';
const HEAD = 'a'.repeat(40);
const A = `sha256:${'1'.repeat(64)}`;
const B = `sha256:${'2'.repeat(64)}`;

function comment(id, marker, login = 'github-actions[bot]') {
  return {
    id,
    user: { login },
    body: marker,
  };
}

function v2(disposition, subject, run) {
  return `<!-- chief-proofmode-access-reconciliation:v2 target=${TARGET} disposition=${disposition} subject=${subject} head=${HEAD} run=${run} -->`;
}

function v1(disposition, run) {
  return `<!-- chief-proofmode-access-reconciliation:v1 target=${TARGET} disposition=${disposition} head=${HEAD} run=${run} -->`;
}

test('subject-matched CLEAR resolves the exact unresolved provider subject', () => {
  const state = evaluateChiefAccessReconciliation([
    comment(1, v2('RECONCILE_REQUIRED', A, '10')),
    comment(2, v2('CLEAR', A, '11')),
  ], TARGET);
  assert.equal(state.clear, true);
});

test('same target with a different app/token subject cannot falsely clear unresolved mutation', () => {
  const state = evaluateChiefAccessReconciliation([
    comment(1, v2('RECONCILE_REQUIRED', A, '10')),
    comment(2, v2('CLEAR', B, '11')),
  ], TARGET);
  assert.equal(state.clear, false);
  assert.deepEqual(state.blockedSubjects, [A]);
});

test('repair-in-progress remains blocked until its own run publishes a terminal marker', () => {
  const state = evaluateChiefAccessReconciliation([
    comment(1, v2('REPAIR_IN_PROGRESS', 'pending', '10')),
    comment(2, v2('CLEAR', B, '11')),
  ], TARGET);
  assert.equal(state.clear, false);
  assert.deepEqual(state.inProgressRuns, ['10']);

  const cleared = evaluateChiefAccessReconciliation([
    comment(1, v2('REPAIR_IN_PROGRESS', 'pending', '10')),
    comment(2, v2('CLEAR', 'pending', '10')),
  ], TARGET);
  assert.equal(cleared.clear, true);
});

test('pending reconciliation cannot be cleared by an unrelated read-only run', () => {
  const state = evaluateChiefAccessReconciliation([
    comment(1, v2('RECONCILE_REQUIRED', 'pending', '10')),
    comment(2, v2('CLEAR', A, '11')),
  ], TARGET);
  assert.equal(state.clear, false);
});

test('untrusted comments cannot affect reconciliation authority', () => {
  const state = evaluateChiefAccessReconciliation([
    comment(1, v2('RECONCILE_REQUIRED', A, '10')),
    comment(2, v2('CLEAR', A, '11'), 'jussray'),
  ], TARGET);
  assert.equal(state.clear, false);
});

test('legacy v1 state remains supported until v2 markers exist', () => {
  assert.equal(evaluateChiefAccessReconciliation([
    comment(1, v1('CLEAR', '1')),
  ], TARGET).clear, true);

  assert.equal(evaluateChiefAccessReconciliation([
    comment(1, v1('RECONCILE_REQUIRED', '1')),
  ], TARGET).clear, false);
});

test('markers for another target never clear this target', () => {
  const other = 'https://12345678-chief-ai.mcgill-raylene.workers.dev';
  const state = evaluateChiefAccessReconciliation([
    comment(1, v2('RECONCILE_REQUIRED', A, '10')),
    comment(2, `<!-- chief-proofmode-access-reconciliation:v2 target=${other} disposition=CLEAR subject=${A} head=${HEAD} run=11 -->`),
  ], TARGET);
  assert.equal(state.clear, false);
});
