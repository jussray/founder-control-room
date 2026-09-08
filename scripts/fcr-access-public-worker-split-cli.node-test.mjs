import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import test from 'node:test';
import { runFcrAccessSplitCli } from './fcr-access-public-worker-split-cli.mjs';

const SHA = 'a'.repeat(40);
const env = {
  EXPECTED_HEAD_SHA: SHA,
  GITHUB_RUN_ID: '12345',
  GITHUB_RUN_ATTEMPT: '2',
  APPROVAL_REFERENCE: 'must-never-enter-cli-receipt',
};

function paths(label) {
  return {
    receiptPath: `test-results/fcr-access-split-cli-${label}.json`,
    rollbackErrorPath: `test-results/fcr-access-split-cli-${label}-rollback-error.json`,
  };
}

async function cleanup(...items) {
  await Promise.all(items.map((path) => rm(path, { force: true })));
}

test('apply persists exact-head performed receipt without carrying raw approval material', async () => {
  const p = paths('apply-success');
  await cleanup(p.receiptPath, p.rollbackErrorPath);
  const receipt = await runFcrAccessSplitCli({
    command: 'apply',
    env,
    ...p,
    execute: async () => ({
      schemaVersion: 1,
      scope: 'fcr-access-public-worker-split',
      state: 'mutated-needs-browser-proof',
      mutationOutcome: 'performed',
      mutationPerformed: true,
      rollbackPerformed: false,
      splitApplied: true,
      sourceApplicationId: 'source-1',
      managedApplicationId: 'public-1',
      originalDestinations: [{ type: 'public' }, { type: 'worker' }],
    }),
  });

  assert.equal(receipt.expectedHeadSha, SHA);
  assert.equal(receipt.workflowRunId, '12345');
  assert.equal(receipt.workflowRunAttempt, '2');
  assert.equal(receipt.mutationOutcome, 'performed');
  const raw = await readFile(p.receiptPath, 'utf8');
  assert.doesNotMatch(raw, /must-never-enter-cli-receipt/);
  await cleanup(p.receiptPath, p.rollbackErrorPath);
});

test('ambiguous apply persists RECONCILE and never attempts rollback', async () => {
  const p = paths('apply-unknown');
  await cleanup(p.receiptPath, p.rollbackErrorPath);
  let rollbackCalls = 0;
  const error = new Error('synthetic ambiguous provider write');
  error.classification = 'split-source-update-reconcile-required';
  error.mutationOutcome = 'unknown';
  error.sourceApplicationId = 'source-1';

  await assert.rejects(
    runFcrAccessSplitCli({
      command: 'apply',
      env,
      ...p,
      execute: async () => { throw error; },
      rollback: async () => { rollbackCalls += 1; },
    }),
    (caught) => caught === error,
  );

  assert.equal(rollbackCalls, 0);
  const receipt = JSON.parse(await readFile(p.receiptPath, 'utf8'));
  assert.equal(receipt.state, 'reconcile-required');
  assert.equal(receipt.mutationOutcome, 'unknown');
  assert.equal(receipt.mutationPerformed, false);
  assert.equal(receipt.rollbackPerformed, false);
  assert.equal(receipt.classification, 'split-source-update-reconcile-required');
  await cleanup(p.receiptPath, p.rollbackErrorPath);
});

test('rollback refuses a stale or non-performed receipt before calling provider rollback', async () => {
  const p = paths('rollback-stale');
  await cleanup(p.receiptPath, p.rollbackErrorPath);
  await runFcrAccessSplitCli({
    command: 'apply',
    env,
    ...p,
    execute: async () => ({
      schemaVersion: 1,
      scope: 'fcr-access-public-worker-split',
      state: 'mutated-needs-browser-proof',
      mutationOutcome: 'performed',
      mutationPerformed: true,
      rollbackPerformed: false,
      splitApplied: true,
      sourceApplicationId: 'source-1',
      managedApplicationId: 'public-1',
      originalDestinations: [{ type: 'public' }, { type: 'worker' }],
    }),
  });

  const staleEnv = { ...env, EXPECTED_HEAD_SHA: 'b'.repeat(40) };
  let rollbackCalls = 0;
  await assert.rejects(
    runFcrAccessSplitCli({
      command: 'rollback',
      env: staleEnv,
      ...p,
      rollback: async () => { rollbackCalls += 1; },
    }),
    (error) => error?.classification === 'split-rollback-receipt-head-mismatch',
  );
  assert.equal(rollbackCalls, 0);
  await cleanup(p.receiptPath, p.rollbackErrorPath);
});

test('successful rollback rewrites the same receipt as rolled back', async () => {
  const p = paths('rollback-success');
  await cleanup(p.receiptPath, p.rollbackErrorPath);
  await runFcrAccessSplitCli({
    command: 'apply',
    env,
    ...p,
    execute: async () => ({
      schemaVersion: 1,
      scope: 'fcr-access-public-worker-split',
      state: 'mutated-needs-browser-proof',
      mutationOutcome: 'performed',
      mutationPerformed: true,
      rollbackPerformed: false,
      splitApplied: true,
      sourceApplicationId: 'source-1',
      managedApplicationId: 'public-1',
      originalDestinations: [{ type: 'public' }, { type: 'worker' }],
    }),
  });

  await runFcrAccessSplitCli({
    command: 'rollback',
    env,
    ...p,
    rollback: async ({ receipt }) => ({
      ...receipt,
      state: 'rolled-back',
      rollbackPerformed: true,
      splitApplied: false,
    }),
  });

  const receipt = JSON.parse(await readFile(p.receiptPath, 'utf8'));
  assert.equal(receipt.state, 'rolled-back');
  assert.equal(receipt.rollbackPerformed, true);
  assert.equal(receipt.splitApplied, false);
  await cleanup(p.receiptPath, p.rollbackErrorPath);
});

test('rollback failure preserves original performed receipt and writes a separate error receipt', async () => {
  const p = paths('rollback-failure');
  await cleanup(p.receiptPath, p.rollbackErrorPath);
  await runFcrAccessSplitCli({
    command: 'apply',
    env,
    ...p,
    execute: async () => ({
      schemaVersion: 1,
      scope: 'fcr-access-public-worker-split',
      state: 'mutated-needs-browser-proof',
      mutationOutcome: 'performed',
      mutationPerformed: true,
      rollbackPerformed: false,
      splitApplied: true,
      sourceApplicationId: 'source-1',
      managedApplicationId: 'public-1',
      originalDestinations: [{ type: 'public' }, { type: 'worker' }],
    }),
  });
  const original = await readFile(p.receiptPath, 'utf8');
  const rollbackError = new Error('synthetic rollback ambiguity');
  rollbackError.classification = 'split-rollback-reconcile-required';
  rollbackError.mutationOutcome = 'unknown';

  await assert.rejects(
    runFcrAccessSplitCli({
      command: 'rollback',
      env,
      ...p,
      rollback: async () => { throw rollbackError; },
    }),
    (caught) => caught === rollbackError,
  );

  assert.equal(await readFile(p.receiptPath, 'utf8'), original);
  const failure = JSON.parse(await readFile(p.rollbackErrorPath, 'utf8'));
  assert.equal(failure.state, 'reconcile-required');
  assert.equal(failure.classification, 'split-rollback-reconcile-required');
  assert.equal(failure.mutationOutcome, 'unknown');
  await cleanup(p.receiptPath, p.rollbackErrorPath);
});
