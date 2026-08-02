import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AI_COMPANY_SANDBOX_CAPABILITIES,
  inspectAuthorityBoundary,
  runCompanySandbox,
} from '../src/sandbox.mjs';

const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('runs deterministic synthetic work inside a sealed capability-free sandbox', async () => {
  const input = await fixture('authorized-event.json');
  const before = JSON.stringify(input);
  const first = runCompanySandbox(input);
  const second = runCompanySandbox(input);

  assert.equal(first.status, 'simulated');
  assert.equal(first.simulatorInvoked, true);
  assert.deepEqual(first.violations, []);
  assert.deepEqual(first.sandbox.capabilities, AI_COMPANY_SANDBOX_CAPABILITIES);
  assert.ok(Object.values(first.sandbox.capabilities).every((value) => value === false));
  assert.equal(first.sandbox.deterministic, true);
  assert.equal(first.sandbox.inputFingerprint, second.sandbox.inputFingerprint);
  assert.equal(first.sandbox.outputFingerprint, second.sandbox.outputFingerprint);
  assert.deepEqual(first.result, second.result);
  assert.equal(JSON.stringify(input), before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.sandbox));
  assert.ok(Object.isFrozen(first.result));
  assert.ok(Object.isFrozen(first.result.authority));
  assert.ok(first.result.receipts.every((receipt) => Object.isFrozen(receipt)));
  assert.throws(() => {
    first.result.authority.executionAllowed = true;
  }, TypeError);
});

test('kill switch blocks before the simulator is invoked', async () => {
  const input = await fixture('authorized-event.json');
  const run = runCompanySandbox(input, { killSwitch: true });

  assert.equal(run.status, 'blocked');
  assert.equal(run.simulatorInvoked, false);
  assert.deepEqual(run.violations, ['kill_switch_active']);
  assert.equal(run.result, null);
  assert.equal(run.sandbox.outputFingerprint, null);
});

test('input fingerprint mismatch blocks replay of altered work', async () => {
  const input = await fixture('authorized-event.json');
  const baseline = runCompanySandbox(input);
  input.summary = 'A changed synthetic event must not reuse the old fingerprint.';

  const replay = runCompanySandbox(input, {
    expectedInputFingerprint: baseline.sandbox.inputFingerprint,
  });

  assert.equal(replay.status, 'blocked');
  assert.equal(replay.simulatorInvoked, false);
  assert.deepEqual(replay.violations, ['input_fingerprint_mismatch']);
  assert.equal(replay.result, null);
});

test('caller-supplied transports and capabilities are ignored by the sandbox API', async () => {
  const input = await fixture('authorized-event.json');
  const run = runCompanySandbox(input, {
    transport: {
      dispatch() {
        throw new Error('caller transport must never execute');
      },
    },
    capabilities: {
      network: true,
      providers: true,
    },
  });

  assert.equal(run.status, 'simulated');
  assert.equal(run.simulatorInvoked, true);
  assert.ok(Object.values(run.sandbox.capabilities).every((value) => value === false));
  assert.ok(run.result.receipts.every((receipt) => receipt.provider === 'fake-buffer'));
});

test('rejects functions, custom prototypes, non-finite values, and circular inputs', async () => {
  const input = await fixture('authorized-event.json');

  assert.throws(
    () => runCompanySandbox({ ...input, callback() {} }),
    /function is not sandbox-safe/,
  );
  assert.throws(
    () => runCompanySandbox({ ...input, budget: Number.POSITIVE_INFINITY }),
    /non-finite number is not sandbox-safe/,
  );
  assert.throws(
    () => runCompanySandbox(Object.assign(Object.create({ inherited: true }), input)),
    /custom prototypes are not sandbox-safe/,
  );

  const circular = { ...input };
  circular.self = circular;
  assert.throws(() => runCompanySandbox(circular), /circular input is not sandbox-safe/);
});

test('detects forged authority and receipt claims during postflight inspection', async () => {
  const input = await fixture('authorized-event.json');
  const run = runCompanySandbox(input);
  const forged = clone(run.result);

  forged.authority.executionAllowed = true;
  forged.liveSideEffects = true;
  forged.receipts[0].provider = 'live-buffer';
  forged.receipts[0].publicUrl = 'https://public.example.test/forged';

  const violations = inspectAuthorityBoundary(forged);
  assert.ok(violations.includes('execution_authority_enabled'));
  assert.ok(violations.includes('live_side_effects_enabled'));
  assert.ok(violations.includes('receipt_provider_not_fake'));
  assert.ok(violations.includes('receipt_claims_public_url'));
});
