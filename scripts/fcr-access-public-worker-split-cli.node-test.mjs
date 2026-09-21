import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
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

async function cleanupPaths(p) {
  await Promise.all(Object.values(p).map((path) => rm(path, { force: true })));
}

function performedReceipt() {
  return {
    schemaVersion: 2,
    scope: 'fcr-access-public-worker-split',
    state: 'mutated-needs-browser-proof',
    phase: 'split-applied',
    mutationOutcome: 'performed',
    mutationPerformed: true,
    rollbackPerformed: false,
    splitApplied: true,
    publicCreateAttempted: true,
    zone: 'foundercontrolroom.org',
    sourceApplicationId: 'source-1',
    managedApplicationId: 'public-1',
    originalDestinations: [{ type: 'public' }, { type: 'worker' }],
    workerDestination: { type: 'worker' },
  };
}

function unknownCheckpoint() {
  return {
    schemaVersion: 2,
    scope: 'fcr-access-public-worker-split',
    state: 'source-update-pending',
    phase: 'source-update-pending',
    mutationOutcome: 'unknown',
    mutationPerformed: false,
    rollbackPerformed: false,
    splitApplied: false,
    publicCreateAttempted: false,
    zone: 'foundercontrolroom.org',
    sourceApplicationId: 'source-1',
    managedApplicationId: null,
    originalDestinations: [{ type: 'public' }, { type: 'worker' }],
    workerDestination: { type: 'worker' },
  };
}

test('apply persists checkpoints before returning and never carries raw approval material', async () => {
  const p = paths('apply-success');
  await cleanupPaths(p);
  const receipt = await runFcrAccessSplitCli({
    command: 'apply',
    env,
    ...p,
    execute: async ({ persistReceipt }) => {
      await persistReceipt(unknownCheckpoint());
      const checkpointRaw = await readFile(p.receiptPath, 'utf8');
      assert.match(checkpointRaw, /source-update-pending/);
      return performedReceipt();
    },
  });

  assert.equal(receipt.expectedHeadSha, SHA);
  assert.equal(receipt.workflowRunId, '12345');
  assert.equal(receipt.workflowRunAttempt, '2');
  assert.match(receipt.idempotencyKey, /^fcr-access-split-v2:[0-9a-f]{64}$/);
  const raw = await readFile(p.receiptPath, 'utf8');
  assert.doesNotMatch(raw, /must-never-enter-cli-receipt/);

  const compatRaw = await readFile(p.compatibilityReceiptPath, 'utf8');
  const compat = JSON.parse(compatRaw);
  assert.equal(compat.schemaVersion, 2);
  assert.equal(compat.scope, 'fcr-access-front-door-recovery');
  assert.equal(compat.state, 'mutated-needs-browser-proof');
  assert.equal(compat.action, 'created-public-bypass');
  assert.equal(compat.credentialSource, 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN');
  assert.equal('sourceApplicationId' in compat, false);
  assert.equal('managedApplicationId' in compat, false);
  assert.doesNotMatch(compatRaw, /must-never-enter-cli-receipt|source-1|public-1/);
  await cleanupPaths(p);
});

test('same exact apply action derives stable mutation identity across workflow runs', async () => {
  const leftPaths = paths('stable-left');
  const rightPaths = paths('stable-right');
  await cleanupPaths(leftPaths);
  await cleanupPaths(rightPaths);
  const left = await runFcrAccessSplitCli({ command: 'apply', env, ...leftPaths, execute: async () => performedReceipt() });
  const right = await runFcrAccessSplitCli({
    command: 'apply',
    env: { ...env, GITHUB_RUN_ID: '999', GITHUB_RUN_ATTEMPT: '1' },
    ...rightPaths,
    execute: async () => performedReceipt(),
  });
  assert.equal(left.idempotencyKey, right.idempotencyKey);
  await cleanupPaths(leftPaths);
  await cleanupPaths(rightPaths);
});

test('ambiguous apply preserves the latest durable recovery seed instead of replacing it with a thin error', async () => {
  const p = paths('apply-unknown');
  await cleanupPaths(p);
  const error = new Error('synthetic ambiguous provider write');
  error.classification = 'split-source-update-reconcile-required';
  error.mutationOutcome = 'unknown';

  await assert.rejects(
    runFcrAccessSplitCli({
      command: 'apply',
      env,
      ...p,
      execute: async ({ persistReceipt }) => {
        await persistReceipt(unknownCheckpoint());
        throw error;
      },
    }),
    (caught) => caught === error,
  );

  const receipt = JSON.parse(await readFile(p.receiptPath, 'utf8'));
  assert.equal(receipt.state, 'reconcile-required');
  assert.equal(receipt.mutationOutcome, 'unknown');
  assert.equal(receipt.sourceApplicationId, 'source-1');
  assert.deepEqual(receipt.originalDestinations, [{ type: 'public' }, { type: 'worker' }]);
  assert.equal(receipt.publicCreateAttempted, false);
  const compat = JSON.parse(await readFile(p.compatibilityReceiptPath, 'utf8'));
  assert.equal(compat.state, 'blocked');
  assert.equal(compat.mutationPerformed, false);
  assert.equal(compat.classification, 'provider-apply-failed');
  await cleanupPaths(p);
});

test('rollback accepts an exact durable UNKNOWN receipt because crash-safe reconciliation may still be required', async () => {
  const p = paths('rollback-unknown');
  await cleanupPaths(p);
  await assert.rejects(
    runFcrAccessSplitCli({
      command: 'apply',
      env,
      ...p,
      execute: async ({ persistReceipt }) => {
        await persistReceipt(unknownCheckpoint());
        const error = new Error('synthetic crash window');
        error.classification = 'split-source-update-reconcile-required';
        error.mutationOutcome = 'unknown';
        throw error;
      },
    }),
  );

  let rollbackCalled = false;
  const rolledBack = await runFcrAccessSplitCli({
    command: 'rollback',
    env,
    ...p,
    rollback: async ({ receipt, persistReceipt }) => {
      rollbackCalled = true;
      assert.equal(receipt.mutationOutcome, 'unknown');
      const done = { ...receipt, state: 'rolled-back', phase: 'rolled-back', mutationOutcome: 'performed', rollbackPerformed: true, splitApplied: false };
      await persistReceipt(done);
      return done;
    },
  });
  assert.equal(rollbackCalled, true);
  assert.equal(rolledBack.rollbackPerformed, true);
  const current = JSON.parse(await readFile(p.receiptPath, 'utf8'));
  assert.equal(current.state, 'rolled-back');
  assert.equal(current.currentTruthState, 'fresh');
  await cleanupPaths(p);
});

test('rollback refuses stale head or tampered apply identity before provider rollback', async () => {
  const p = paths('rollback-stale');
  await cleanupPaths(p);
  const applied = await runFcrAccessSplitCli({ command: 'apply', env, ...p, execute: async () => performedReceipt() });
  await writeFile(p.receiptPath, `${JSON.stringify({ ...applied, idempotencyKey: 'tampered' }, null, 2)}\n`, 'utf8');
  let calls = 0;
  await assert.rejects(
    runFcrAccessSplitCli({
      command: 'rollback',
      env,
      ...p,
      rollback: async () => { calls += 1; },
    }),
    (error) => error?.classification === 'split-rollback-receipt-head-mismatch',
  );
  assert.equal(calls, 0);
  await cleanupPaths(p);
});

test('rollback checkpoints overwrite the primary durable receipt so crash recovery resumes from latest truth', async () => {
  const p = paths('rollback-checkpoints');
  await cleanupPaths(p);
  const applied = await runFcrAccessSplitCli({ command: 'apply', env, ...p, execute: async () => performedReceipt() });

  const rolledBack = await runFcrAccessSplitCli({
    command: 'rollback',
    env,
    ...p,
    rollback: async ({ receipt, persistReceipt }) => {
      const pending = { ...receipt, state: 'rollback-public-delete-pending', phase: 'rollback-public-delete-pending', rollbackPublicDeleteAttempted: true };
      await persistReceipt(pending);
      const pendingOnDisk = JSON.parse(await readFile(p.receiptPath, 'utf8'));
      assert.equal(pendingOnDisk.phase, 'rollback-public-delete-pending');
      const done = { ...pending, state: 'rolled-back', phase: 'rolled-back', mutationOutcome: 'performed', rollbackPerformed: true, splitApplied: false };
      await persistReceipt(done);
      return done;
    },
  });

  assert.equal(rolledBack.rollbackPerformed, true);
  assert.equal(rolledBack.idempotencyKey, applied.idempotencyKey);
  assert.match(rolledBack.rollbackIdempotencyKey, /^fcr-access-split-v2:[0-9a-f]{64}$/);
  assert.notEqual(rolledBack.rollbackIdempotencyKey, applied.idempotencyKey);
  const current = JSON.parse(await readFile(p.receiptPath, 'utf8'));
  const separate = JSON.parse(await readFile(p.rollbackReceiptPath, 'utf8'));
  assert.equal(current.state, 'rolled-back');
  assert.equal(separate.state, 'rolled-back');
  const compat = JSON.parse(await readFile(p.compatibilityReceiptPath, 'utf8'));
  assert.equal(compat.action, 'rolled-back-public-bypass');
  assert.equal(compat.rollbackPerformed, true);
  await cleanupPaths(p);
});

test('rollback failure keeps latest checkpoint and emits a separate bounded error receipt', async () => {
  const p = paths('rollback-failure');
  await cleanupPaths(p);
  await runFcrAccessSplitCli({ command: 'apply', env, ...p, execute: async () => performedReceipt() });
  const rollbackError = new Error('synthetic rollback ambiguity');
  rollbackError.classification = 'split-rollback-reconcile-required';
  rollbackError.mutationOutcome = 'unknown';

  await assert.rejects(
    runFcrAccessSplitCli({
      command: 'rollback',
      env,
      ...p,
      rollback: async ({ receipt, persistReceipt }) => {
        await persistReceipt({ ...receipt, state: 'rollback-public-delete-pending', phase: 'rollback-public-delete-pending', rollbackPublicDeleteAttempted: true });
        throw rollbackError;
      },
    }),
    (caught) => caught === rollbackError,
  );

  const current = JSON.parse(await readFile(p.receiptPath, 'utf8'));
  const failure = JSON.parse(await readFile(p.rollbackErrorPath, 'utf8'));
  assert.equal(current.state, 'reconcile-required');
  assert.equal(current.rollbackPublicDeleteAttempted, true);
  assert.equal(failure.classification, 'split-rollback-reconcile-required');
  assert.equal(failure.mutationOutcome, 'unknown');
  const compat = JSON.parse(await readFile(p.compatibilityReceiptPath, 'utf8'));
  assert.equal(compat.state, 'blocked');
  assert.equal(compat.classification, 'provider-recovery-failed');
  await cleanupPaths(p);
});
