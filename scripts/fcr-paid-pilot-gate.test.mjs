import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPilotExecution } from './fcr-paid-pilot-gate.mjs';

const executionId = 'pilot_execution_001';
const digest = 'a'.repeat(64);
const valid = () => ({
  mode: 'sandbox',
  authorized: true,
  executionId,
  delivery: { executionId, status: 'completed', artifactDigest: digest }
});

test('accepts a non-chargeable sandbox evidence candidate without claiming verification', () => {
  const result = assessPilotExecution(valid());
  assert.equal(result.allowed, true);
  assert.equal(result.receipt.executionId, executionId);
  assert.equal(result.receipt.paymentStatus, 'not_charged');
  assert.equal(result.receipt.productionAuthorized, false);
  assert.equal(result.receipt.independentlyVerified, false);
  assert.equal(result.receipt.evidenceOrigin, 'caller_supplied_unverified');
  assert.equal(result.receipt.deliveryVerified, false);
});
test('rejects missing authorization', () => {
  assert.deepEqual(assessPilotExecution({ ...valid(), authorized: false }), { allowed: false, reason: 'AUTHORIZATION_REQUIRED' });
});
test('rejects production mode', () => {
  assert.deepEqual(assessPilotExecution({ ...valid(), mode: 'production' }), { allowed: false, reason: 'SANDBOX_ONLY' });
});
test('rejects payment attempts and payment credentials', () => {
  for (const patch of [{ chargeRequested: true }, { paymentIntentId: 'pi_123' }, { customerPaymentMethod: 'pm_123' }]) {
    assert.equal(assessPilotExecution({ ...valid(), ...patch }).reason, 'CHARGE_NOT_ALLOWED');
  }
});
test('rejects incomplete or cross-execution delivery', () => {
  for (const delivery of [
    { executionId, status: 'pending', artifactDigest: digest },
    { executionId: 'other_execution', status: 'completed', artifactDigest: digest },
    { executionId, status: 'completed', artifactDigest: 'not-a-digest' }
  ]) {
    assert.equal(assessPilotExecution({ ...valid(), delivery }).reason, 'DELIVERY_NOT_PROVEN');
  }
});
test('rejects missing or malformed execution IDs', () => {
  assert.equal(assessPilotExecution({ ...valid(), executionId: '' }).reason, 'INVALID_EXECUTION_ID');
  assert.throws(() => assessPilotExecution(null), TypeError);
});
