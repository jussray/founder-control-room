import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isRecordedPrDebt,
  markBlockedObservation,
} from '../scripts/pr-continuity-rollover-observation.mjs';

const strictSource = readFileSync(new URL('../scripts/pr-continuity.mjs', import.meta.url), 'utf8');

test('recorded PR debt is distinguished from operational failure', () => {
  assert.equal(isRecordedPrDebt(new Error('ROLLOVER_BLOCKED: #1:BLOCKED_MERGE_CONFLICT')), true);
  assert.equal(isRecordedPrDebt(new Error('GITHUB_API_500: unavailable')), false);
  assert.equal(isRecordedPrDebt(new Error('ROLLOVER_DEBT_RECEIPT_INVALID')), false);
});

test('blocked rollover receipt stays blocked while observation becomes recorded', () => {
  const failureReceipts = [{ pullRequest: 1, code: 'MERGE_CONFLICT' }];
  const next = markBlockedObservation({
    schema: 'juss/pr-continuity@v1',
    mode: 'rollover',
    blockedCount: 1,
    blockedByState: { BLOCKED_MERGE_CONFLICT: 1 },
    failureReceiptCount: 1,
    failureReceipts,
    mergeApprovalRequired: true,
    mergeApproved: false,
    authorizesMerge: false,
    authorizesDeploy: false,
  });

  assert.equal(next.rolloverState, 'BLOCKED_PR_DEBT');
  assert.equal(next.observationStatus, 'RECORDED');
  assert.equal(next.blockingScope, 'open-pr-graph');
  assert.equal(next.prMergeContinuityClear, false);
  assert.equal(next.blockedCount, 1);
  assert.deepEqual(next.failureReceipts, failureReceipts);
  assert.equal(next.mergeApprovalRequired, true);
  assert.equal(next.mergeApproved, false);
  assert.equal(next.authorizesMerge, false);
  assert.equal(next.authorizesDeploy, false);
});

test('missing or clear receipts cannot masquerade as recorded blocked debt', () => {
  assert.throws(() => markBlockedObservation(null), /ROLLOVER_DEBT_RECEIPT_INVALID/);
  assert.throws(() => markBlockedObservation({ schema: 'juss/pr-continuity@v1', mode: 'rollover', blockedCount: 0 }), /ROLLOVER_DEBT_RECEIPT_INVALID/);
});

test('strict rollover CLI still fails closed on blocked PR debt', () => {
  assert.match(strictSource, /throw new Error\(`ROLLOVER_BLOCKED:/);
});
