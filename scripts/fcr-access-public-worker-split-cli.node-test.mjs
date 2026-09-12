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
    rollbackReceiptPath: `test-results/fcr-access-split-cli-${label}-rollback.json`,
    rollbackErrorPath: `test-results/fcr-access-split-cli-${label}-rollback-error.json`,
    compatibilityReceiptPath: `test-results/fcr-access-split-cli-${label}-compat.json`,
  };
}

async function cleanup(...items) {
  await Promise.all(items.map((path) => rm(path, { force: true })));
}

async function cleanupPaths(p) {
  await cleanup(
    p.receiptPath,
    p.rollbackReceiptPath,
    p.rollbackErrorPath,
    p.compatibilityReceiptPath,
  );
}

function performedReceipt() {
  return {
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
  };
}

test('apply persists exact-head mutation identity without carrying raw approval material', async () => {
  const p = paths('apply-success');
  await cleanupPaths(p);
  const receipt = await runFcrAccessSplitCli({
    command: 'apply',
    env,
    ...p,
    execute: async () => performedReceipt(),
  });

  assert.equal(receipt.expectedHeadSha, SHA);
  assert.equal(receipt.workflowRunId, '12345');
  assert.equal(receipt.workflowRunAttempt, '2');
  assert.equal(receipt.mutationOutcome, 'performed');
  assert.equal(receipt.currentTruthState, 'unknown');
  assert.match(receipt.idempotencyKey, /^fcr-access-split-v1:[0-9a-f]{64}$/);
  const raw = await readFile(p.receiptPath, 'utf8');
  assert.doesNotMatch(raw, /must-never-enter-cli-receipt/);

  const compatRaw = await readFile(p.compatibilityReceiptPath, 'utf8');
  const compat = JSON.parse(compatRaw);
  assert.equal(compat.schemaVersion, 2);
  assert.equal(compat.scope, 'fcr-access-front-door-recovery');
  assert.equal(compat.expectedHeadSha, SHA);
  assert.equal(compat.state, 'mutated-needs-browser-proof');
  assert.equal(compat.action, 'created-public-bypass');
  assert.equal(compat.credentialSource, 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN');
  assert.equal(compat.mutationPerformed, true);
  assert.equal(compat.rollbackPerformed, false);
  assert.equal(compat.classification, null);
  assert.equal('sourceApplicationId' in compat, false);
  assert.equal('managedApplicationId' in compat, false);
  assert.doesNotMatch(compatRaw, /must-never-enter-cli-receipt|source-1|public-1/);
  await cleanupPaths(p);
});

test('same exact apply action derives the same durable mutation identity', async () => {
  const first = paths('apply-idempotency-first');
  const second = paths('apply-idempotency-second');
  await cleanupPaths(first);
  await cleanupPaths(second);

  const left = await runFcrAccessSplitCli({
    command: 'apply',
    env,
    ...first,
    execute: async () => performedReceipt(),
  });
  const right = await runFcrAccessSplitCli({
    command: 'apply',
    env: { ...env, GITHUB_RUN_ID: 'different-run', GITHUB_RUN_ATTEMPT: '1' },
    ...second,
    execute: async () => performedReceipt(),
  });

  assert.equal(left.idempotencyKey, right.idempotencyKey);
  await cleanupPaths(first);
  await cleanupPaths(second);
});

test('ambiguous apply persists RECONCILE and never attempts rollback', async () => {
  const p = paths('apply-unknown');
  await cleanupPaths(p);
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
  assert.equal(receipt.currentTruthState, 'unknown');
  assert.match(receipt.idempotencyKey, /^fcr-access-split-v1:[0-9a-f]{64}$/);
  assert.equal(receipt.classification, 'split-source-update-reconcile-required');

  const compat = JSON.parse(await readFile(p.compatibilityReceiptPath, 'utf8'));
  assert.equal(compat.state, 'blocked');
  assert.equal(compat.mutationPerformed, true);
  assert.equal(compat.rollbackPerformed, false);
  assert.equal(compat.classification, 'provider-apply-failed');
  await cleanupPaths(p);
});

test('rollback refuses a stale or non-performed receipt before calling provider rollback', async () => {
  const p = paths('rollback-stale');
  await cleanupPaths(p);
  await runFcrAccessSplitCli({
    command: 'apply',
    env,
    ...p,
    execute: async () => performedReceipt(),
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
  const compat = JSON.parse(await readFile(p.compatibilityReceiptPath, 'utf8'));
  assert.equal(compat.state, 'blocked');
  assert.equal(compat.classification, 'provider-recovery-failed');
  assert.equal(compat.mutationPerformed, true);
  await cleanupPaths(p);
});

test('rollback refuses a performed receipt whose mutation identity was tampered', async () => {
  const p = paths('rollback-idempotency-tamper');
  await cleanupPaths(p);
  const applied = await runFcrAccessSplitCli({
    command: 'apply',
    env,
    ...p,
    execute: async () => performedReceipt(),
  });
  await import('node:fs/promises').then(({ writeFile }) => writeFile(
    p.receiptPath,
    `${JSON.stringify({ ...applied, idempotencyKey: 'fcr-access-split-v1:tampered' }, null, 2)}\n`,
    'utf8',
  ));

  let rollbackCalls = 0;
  await assert.rejects(
    runFcrAccessSplitCli({
      command: 'rollback',
      env,
      ...p,
      rollback: async () => { rollbackCalls += 1; },
    }),
    (error) => error?.classification === 'split-rollback-receipt-head-mismatch',
  );
  assert.equal(rollbackCalls, 0);
  const compat = JSON.parse(await readFile(p.compatibilityReceiptPath, 'utf8'));
  assert.equal(compat.state, 'blocked');
  assert.equal(compat.classification, 'provider-recovery-failed');
  await cleanupPaths(p);
});

test('successful rollback preserves historical apply receipt and writes separate current-truth receipt', async () => {
  const p = paths('rollback-success');
  await cleanupPaths(p);
  const applied = await runFcrAccessSplitCli({
    command: 'apply',
    env,
    ...p,
    execute: async () => performedReceipt(),
  });
  const original = await readFile(p.receiptPath, 'utf8');

  const rolledBack = await runFcrAccessSplitCli({
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

  assert.equal(await readFile(p.receiptPath, 'utf8'), original);
  assert.equal(rolledBack.state, 'rolled-back');
  assert.equal(rolledBack.rollbackPerformed, true);
  assert.equal(rolledBack.splitApplied, false);
  assert.equal(rolledBack.currentTruthState, 'fresh');
  assert.equal(rolledBack.appliedIdempotencyKey, applied.idempotencyKey);
  assert.notEqual(rolledBack.idempotencyKey, applied.idempotencyKey);
  assert.match(rolledBack.idempotencyKey, /^fcr-access-split-v1:[0-9a-f]{64}$/);

  const rollbackReceipt = JSON.parse(await readFile(p.rollbackReceiptPath, 'utf8'));
  assert.equal(rollbackReceipt.currentTruthState, 'fresh');
  assert.equal(rollbackReceipt.appliedIdempotencyKey, applied.idempotencyKey);
  const compat = JSON.parse(await readFile(p.compatibilityReceiptPath, 'utf8'));
  assert.equal(compat.state, 'attention');
  assert.equal(compat.action, 'rolled-back-public-bypass');
  assert.equal(compat.mutationPerformed, true);
  assert.equal(compat.rollbackPerformed, true);
  await cleanupPaths(p);
});

test('rollback failure preserves original performed receipt and writes a separate error receipt', async () => {
  const p = paths('rollback-failure');
  await cleanupPaths(p);
  const applied = await runFcrAccessSplitCli({
    command: 'apply',
    env,
    ...p,
    execute: async () => performedReceipt(),
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
  assert.equal(failure.currentTruthState, 'unknown');
  assert.equal(failure.appliedIdempotencyKey, applied.idempotencyKey);
  assert.notEqual(failure.idempotencyKey, applied.idempotencyKey);
  const compat = JSON.parse(await readFile(p.compatibilityReceiptPath, 'utf8'));
  assert.equal(compat.state, 'blocked');
  assert.equal(compat.classification, 'provider-recovery-failed');
  assert.equal(compat.mutationPerformed, true);
  await cleanupPaths(p);
});