import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRuntimeStateReceipt, trackedConfigFingerprint, writeRuntimeStateReceipt } from '../scripts/control-room-runtime-state.mjs';
import { buildTestLedger } from '../scripts/control-room-test-ledger.mjs';

const SHA = 'a'.repeat(40);
const EPOCH = `sha256:${'b'.repeat(64)}`;
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-runtime-state-'));
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'name: CI\\n', 'utf8');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}\\n', 'utf8');
  return root;
}
function env(overrides = {}) { return { GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ATTEMPT: '1', GITHUB_REPOSITORY: 'jussray/example', EXPECTED_HEAD_SHA: SHA, CONTROL_ROOM_RUNTIME_STATE_PATH: 'artifacts/control-room-runtime-state.json', ...overrides }; }

function writeReadback(root, overrides = {}) {
  const readbackPath = path.join(root, 'provider-readback.json');
  const readback = {
    schema: 'fcr/cloudflare-worker-readback@v1',
    repository: 'jussray/example',
    worker: 'founder-control-room',
    accountId: '9b59861bd1747cf7525571b4c51d2aa0',
    scope: 'worker-bindings-and-crons-only',
    status: 'aligned',
    observedAt: new Date().toISOString(),
    observedStateDigest: EPOCH,
    secretValuesRecorded: false,
    canAuthorizeProviderMutation: false,
    ...overrides,
  };
  fs.writeFileSync(readbackPath, JSON.stringify(readback), 'utf8');
  return { path: readbackPath, readback };
}


test('tracked configuration movement changes the receipt fingerprint', () => {
  const root = fixture(); const before = trackedConfigFingerprint(root);
  fs.appendFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'on: push\\n', 'utf8');
  const after = trackedConfigFingerprint(root);
  assert.notEqual(before.sha256, after.sha256);
  assert.deepEqual(before.files, ['.github/workflows/ci.yml', 'package.json']);
});

test('written runtime state receipt is one valid JSON document with a newline', () => {
  const root = fixture();
  try {
    const receiptPath = path.join(root, 'artifacts', 'runtime-receipt.json');
    const receipt = writeRuntimeStateReceipt(env({ CONTROL_ROOM_RUNTIME_STATE_PATH: receiptPath }), root);
    const contents = fs.readFileSync(receiptPath, 'utf8');
    assert.deepEqual(JSON.parse(contents), receipt);
    assert.equal(contents.endsWith(String.fromCharCode(10)), true);
    assert.equal(contents.endsWith(String.fromCharCode(92, 110)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ordinary source events stay source-bound and do not pretend to prove provider state', () => {
  const receipt = buildRuntimeStateReceipt(env(), fixture(), new Date('2026-10-12T22:00:00Z'));
  assert.equal(receipt.externalState.mode, 'source-bound'); assert.equal(receipt.externalState.epoch, null);
  assert.equal(receipt.proofRule.sourceShaAloneProvesExternalState, false);
});

test('external state invalidation requires a fresh queue, non-secret epoch, and source', () => {
  const root = fixture();
  const observed = writeReadback(root);
  const valid = env({ GITHUB_EVENT_NAME: 'repository_dispatch', CONTROL_ROOM_EXTERNAL_STATE_ACTION: 'runtime_state_changed', CONTROL_ROOM_EXTERNAL_STATE_EPOCH: EPOCH, CONTROL_ROOM_EXTERNAL_STATE_SOURCE: 'cloudflare:worker:founder-control-room', CONTROL_ROOM_PROVIDER_READBACK_PATH: observed.path });
  const receipt = buildRuntimeStateReceipt(valid, root);
  assert.equal(receipt.externalState.mode, 'independently-read-back'); assert.equal(receipt.externalState.epoch, EPOCH); assert.equal(receipt.event.freshQueue, true);
  assert.deepEqual(receipt.externalState.providerObservation, { digest: EPOCH, observedAt: observed.readback.observedAt, scope: 'worker-bindings-and-crons-only', status: 'aligned' });
  assert.equal(receipt.proofRule.externalEventEpochAloneProvesExternalState, false);
  assert.throws(() => buildRuntimeStateReceipt({ ...valid, GITHUB_RUN_ATTEMPT: '2' }, root), /newly queued/u);
  assert.throws(() => buildRuntimeStateReceipt({ ...valid, CONTROL_ROOM_EXTERNAL_STATE_EPOCH: '' }, root), /state epoch/u);
  assert.throws(() => buildRuntimeStateReceipt({ ...valid, CONTROL_ROOM_EXTERNAL_STATE_SOURCE: '' }, root), /SOURCE/u);
});

test('manual Cloudflare revalidation requires the same provider observer', () => {
  const root = fixture();
  const observed = writeReadback(root);
  const receipt = buildRuntimeStateReceipt(env({ GITHUB_EVENT_NAME: 'workflow_dispatch', CONTROL_ROOM_EXTERNAL_STATE_EPOCH: EPOCH, CONTROL_ROOM_EXTERNAL_STATE_SOURCE: 'cloudflare:worker:founder-control-room', CONTROL_ROOM_PROVIDER_READBACK_PATH: observed.path }), root);
  assert.equal(receipt.externalState.mode, 'independently-read-back');
});

test('dispatch cannot promote self-reported provider epoch into proof without readback', () => {
  const root = fixture();
  const request = env({ GITHUB_EVENT_NAME: 'repository_dispatch', CONTROL_ROOM_EXTERNAL_STATE_ACTION: 'runtime_state_changed', CONTROL_ROOM_EXTERNAL_STATE_EPOCH: EPOCH, CONTROL_ROOM_EXTERNAL_STATE_SOURCE: 'cloudflare:worker:founder-control-room', CONTROL_ROOM_PROVIDER_READBACK_PATH: path.join(root, 'missing.json') });
  assert.throws(() => buildRuntimeStateReceipt(request, root), /readback is missing/u);
  const observed = writeReadback(root, { status: 'drift_detected' });
  assert.throws(() => buildRuntimeStateReceipt({ ...request, CONTROL_ROOM_PROVIDER_READBACK_PATH: observed.path }, root), /stale, drifted, or untrusted/u);
});

test('wrong provider, stale time, and forged identity fail closed', () => {
  const root = fixture();
  const observed = writeReadback(root);
  const request = env({ GITHUB_EVENT_NAME: 'workflow_dispatch', CONTROL_ROOM_EXTERNAL_STATE_EPOCH: EPOCH, CONTROL_ROOM_EXTERNAL_STATE_SOURCE: 'cloudflare:worker:founder-control-room', CONTROL_ROOM_PROVIDER_READBACK_PATH: observed.path });
  assert.throws(() => buildRuntimeStateReceipt({ ...request, CONTROL_ROOM_EXTERNAL_STATE_SOURCE: 'github:environment' }, root), /implemented independent provider observer/u);
  for (const poison of [
    { repository: 'attacker/repo' },
    { accountId: 'untrusted-account' },
    { observedAt: new Date(Date.now() - 3600_000).toISOString() },
    { secretValuesRecorded: true },
    { scope: 'any-provider' },
    { observedStateDigest: 'not-a-hash' },
  ]) {
    writeReadback(root, poison);
    assert.throws(() => buildRuntimeStateReceipt(request, root), /stale, drifted, or untrusted/u);
  }
});

test('scheduled revalidation obtains its provider fingerprint without a Git change or supplied epoch', () => {
  const root = fixture();
  const observed = writeReadback(root);
  const receipt = buildRuntimeStateReceipt(env({
    GITHUB_EVENT_NAME: 'schedule',
    CONTROL_ROOM_PROVIDER_READBACK_PATH: observed.path,
  }), root);
  assert.equal(receipt.externalState.mode, 'independently-read-back');
  assert.equal(receipt.externalState.source, 'cloudflare:worker:founder-control-room');
  assert.equal(receipt.externalState.epoch, EPOCH);
  assert.equal(receipt.externalState.providerObservation.digest, EPOCH);
});

test('scheduled revalidation fails closed if provider proof is missing or drifted', () => {
  const root = fixture();
  const missing = env({ GITHUB_EVENT_NAME: 'schedule', CONTROL_ROOM_PROVIDER_READBACK_PATH: path.join(root, 'missing.json') });
  assert.throws(() => buildRuntimeStateReceipt(missing, root), /readback is missing/u);
  const observed = writeReadback(root, { status: 'drift_detected' });
  assert.throws(() => buildRuntimeStateReceipt({ ...missing, CONTROL_ROOM_PROVIDER_READBACK_PATH: observed.path }, root), /stale, drifted, or untrusted/u);
});

test('the ledger workflow exposes the external-state invalidation trigger', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'control-room-test-ledger.yml'), 'utf8');
  for (const expected of ['schedule:', "- cron: '19 */6 * * *'", 'repository_dispatch:', 'types: [runtime_state_changed]', 'external_state_epoch:', 'CONTROL_ROOM_EXTERNAL_STATE_EPOCH:', 'CONTROL_ROOM_EXTERNAL_STATE_SOURCE:', 'node --test test/control-room-runtime-state.test.mjs', 'node scripts/control-room-runtime-state.mjs', 'node scripts/observe-cloudflare-runtime-state.mjs', 'artifacts/control-room-runtime-state.json', 'artifacts/cloudflare-provider-readback.json']) assert.ok(workflow.includes(expected), `workflow missing ${expected}`);
});

test('the exact-head ledger binds the runtime-state receipt into its proof surface', () => {
  const runtimeState = {
    repository: 'jussray/example',
    sourceSha: SHA,
    trackedConfig: { sha256: EPOCH, paths: ['package.json'] },
  };
  const ledger = buildTestLedger({
    repository: 'jussray/example',
    sha: SHA,
    branch: 'main',
    runId: '1',
    checks: [],
    runtimeState,
  });
  assert.deepEqual(ledger.runtimeState, runtimeState);
});
