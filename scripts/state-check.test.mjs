import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkState } from './state-check.mjs';

const state = {
  recordedHeadSha: 'h1',
  recordedBaseSha: 'b1',
  requiredChecks: ['Required Gate', 'Lint'],
  independentReview: { required: true, recorded: false },
  founderMergeApproval: { approved: false, headSha: null, baseSha: null },
  dependencies: [],
};
const green = {
  headSha: 'h1', baseSha: 'b1', draft: false, mergeable: true,
  checks: [{ name: 'Required Gate', conclusion: 'success' }, { name: 'Lint', conclusion: 'success' }],
};

test('blocks when no approval and no review are recorded, even if all checks pass', () => {
  const r = checkState(state, green);
  assert.equal(r.verdict, 'BLOCKED');
  assert.ok(r.blockers.some((b) => b.includes('independent review')));
  assert.ok(r.blockers.some((b) => b.includes('no founder merge approval')));
});

test('detects head movement and ignores approval for another head', () => {
  const s = { ...state, founderMergeApproval: { approved: true, headSha: 'h0', baseSha: 'b1' } };
  const r = checkState(s, { ...green, headSha: 'h2' });
  assert.ok(r.blockers.some((b) => b.startsWith('head moved')));
  assert.ok(r.blockers.some((b) => b.includes('names a different head')));
});

test('a required check that is skipped or missing is a blocker', () => {
  const r = checkState(state, { ...green, checks: [{ name: 'Required Gate', conclusion: 'skipped' }] });
  assert.ok(r.blockers.some((b) => b.includes('Lint')));
  assert.ok(r.blockers.some((b) => b.includes('Required Gate') && b.includes('skipped')));
});

test('ready only when every gate, review and exact-SHA approval is present', () => {
  const s = {
    ...state,
    independentReview: { required: true, recorded: true },
    founderMergeApproval: { approved: true, headSha: 'h1', baseSha: 'b1' },
  };
  assert.deepEqual(checkState(s, { ...green, draft: false }), { verdict: 'READY', blockers: [], notes: [] });
});

test('a draft is a note rather than a blocker once all gates pass', () => {
  const s = {
    ...state,
    independentReview: { required: true, recorded: true },
    founderMergeApproval: { approved: true, headSha: 'h1', baseSha: 'b1' },
  };
  const r = checkState(s, { ...green, draft: true });
  assert.equal(r.verdict, 'READY_WITH_NOTES');
});
