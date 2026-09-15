import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRolloverAttempt,
  validateRolloverReceipt,
} from '../scripts/verify-pr-continuity-rollover-outcome.mjs';

const sha = 'a'.repeat(40);

function receipt(overrides = {}) {
  return {
    schema: 'juss/pr-continuity@v1',
    mode: 'rollover',
    rootBaseSha: sha,
    results: [],
    blockedCount: 0,
    blockedByState: {},
    failureReceiptCount: 0,
    failureReceipts: [],
    mergeApproved: false,
    authorizesMerge: false,
    authorizesDeploy: false,
    ...overrides,
  };
}

test('clear rollover is control-plane healthy', () => {
  assert.deepEqual(evaluateRolloverAttempt({attemptOutcome: 'success', receipt: receipt(), expectedRootSha: sha}), {
    graphReady: true,
    disposition: 'COMPLETED_CLEAR',
    blockedCount: 0,
    failureReceiptCount: 0,
    attemptOutcome: 'success',
    controlPlaneHealthy: true,
  });
});

test('repository-rule blocker may make the graph unready without failing the control plane', () => {
  const blocked = receipt({
    results: [{number: 815, state: 'BLOCKED_REPOSITORY_RULES'}],
    blockedCount: 1,
    blockedByState: {BLOCKED_REPOSITORY_RULES: 1},
    failureReceiptCount: 2,
    failureReceipts: [
      {pullRequest: 815, receiptId: 'pr-815:CHANGES_REQUIRE_PULL_REQUEST', code: 'CHANGES_REQUIRE_PULL_REQUEST'},
      {pullRequest: 815, receiptId: 'pr-815:CODE_SCANNING_PENDING_OR_UNCONFIGURED', code: 'CODE_SCANNING_PENDING_OR_UNCONFIGURED'},
    ],
  });
  const result = evaluateRolloverAttempt({attemptOutcome: 'failure', receipt: blocked, expectedRootSha: sha});
  assert.equal(result.controlPlaneHealthy, true);
  assert.equal(result.graphReady, false);
  assert.equal(result.disposition, 'COMPLETED_WITH_BLOCKERS');
  assert.equal(result.blockedCount, 1);
  assert.equal(result.failureReceiptCount, 2);
});

test('merge conflict remains independently receipted', () => {
  const blocked = receipt({
    results: [{number: 807, state: 'BLOCKED_MERGE_CONFLICT'}],
    blockedCount: 1,
    blockedByState: {BLOCKED_MERGE_CONFLICT: 1},
    failureReceiptCount: 1,
    failureReceipts: [{pullRequest: 807, receiptId: 'pr-807:MERGE_CONFLICT', code: 'MERGE_CONFLICT'}],
  });
  assert.equal(validateRolloverReceipt(blocked, sha).disposition, 'COMPLETED_WITH_BLOCKERS');
});

test('failed attempt without a blocked receipt is a real control-plane failure', () => {
  assert.throws(
    () => evaluateRolloverAttempt({attemptOutcome: 'failure', receipt: receipt(), expectedRootSha: sha}),
    /ROLLOVER_FAILED_WITHOUT_BLOCKED_RECEIPT/,
  );
});

test('root SHA drift is rejected', () => {
  assert.throws(() => validateRolloverReceipt(receipt(), 'b'.repeat(40)), /ROLLOVER_ROOT_SHA_MISMATCH/);
});

test('blocked count cannot hide or invent blockers', () => {
  assert.throws(
    () => validateRolloverReceipt(receipt({blockedCount: 1}), sha),
    /ROLLOVER_BLOCKED_COUNT_MISMATCH/,
  );
});

test('every blocker requires its own pull-level failure receipt', () => {
  assert.throws(
    () => validateRolloverReceipt(receipt({results: [{number: 42, state: 'BLOCKED_MERGE_CONFLICT'}], blockedCount: 1}), sha),
    /ROLLOVER_BLOCKER_WITHOUT_RECEIPT/,
  );
});

test('duplicate failure receipt ids are rejected', () => {
  assert.throws(
    () => validateRolloverReceipt(receipt({
      results: [{number: 42, state: 'BLOCKED_REPOSITORY_RULES'}],
      blockedCount: 1,
      failureReceiptCount: 2,
      failureReceipts: [
        {pullRequest: 42, receiptId: 'same', code: 'ONE'},
        {pullRequest: 42, receiptId: 'same', code: 'TWO'},
      ],
    }), sha),
    /ROLLOVER_DUPLICATE_FAILURE_RECEIPT/,
  );
});

test('rollover receipt can never authorize merge or deploy', () => {
  assert.throws(() => validateRolloverReceipt(receipt({authorizesMerge: true}), sha), /ROLLOVER_MUST_NOT_AUTHORIZE_MUTATION/);
  assert.throws(() => validateRolloverReceipt(receipt({authorizesDeploy: true}), sha), /ROLLOVER_MUST_NOT_AUTHORIZE_MUTATION/);
});
