import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectAppliedSplitReceipt,
  projectBlockedSplitReceipt,
  projectRolledBackSplitReceipt,
} from './run-fcr-access-public-worker-split.mjs';

const ENV = {
  EXPECTED_HEAD_SHA: '399265d476184ceef12ed39f53829256e6455810',
  GITHUB_RUN_ID: '34724416011',
  GITHUB_RUN_ATTEMPT: '1',
};

const performed = {
  scope: 'fcr-access-public-worker-split',
  splitApplied: true,
  mutationOutcome: 'performed',
  mutationPerformed: true,
  rollbackPerformed: false,
};

test('projects a performed split into the existing sanitized front-door receipt schema', () => {
  const receipt = projectAppliedSplitReceipt(performed, ENV);
  assert.equal(receipt.schemaVersion, 2);
  assert.equal(receipt.scope, 'fcr-access-front-door-recovery');
  assert.equal(receipt.expectedHeadSha, ENV.EXPECTED_HEAD_SHA);
  assert.equal(receipt.workflowRunId, ENV.GITHUB_RUN_ID);
  assert.equal(receipt.state, 'mutated-needs-browser-proof');
  assert.equal(receipt.action, 'created-public-bypass');
  assert.equal(receipt.credentialSource, 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN');
  assert.equal(receipt.mutationPerformed, true);
  assert.equal(receipt.rollbackPerformed, false);
  assert.equal(receipt.classification, null);
});

test('projects completed rollback without claiming the public front door is repaired', () => {
  const receipt = projectRolledBackSplitReceipt({
    ...performed,
    splitApplied: false,
    rollbackPerformed: true,
  }, ENV);
  assert.equal(receipt.state, 'attention');
  assert.equal(receipt.action, 'rolled-back-public-bypass');
  assert.equal(receipt.mutationPerformed, true);
  assert.equal(receipt.rollbackPerformed, true);
  assert.equal(receipt.alreadyExempt, false);
});

test('unknown split outcome is conservatively projected as possibly mutated and blocked', () => {
  const error = new Error('provider result unknown');
  error.mutationOutcome = 'unknown';
  error.classification = 'split-source-update-reconcile-required';
  const receipt = projectBlockedSplitReceipt(error, ENV);
  assert.equal(receipt.state, 'blocked');
  assert.equal(receipt.mutationPerformed, true);
  assert.equal(receipt.action, 'none');
  assert.equal(receipt.classification, 'provider-apply-failed');
});

test('known credential failures retain bounded public classifications', () => {
  const missing = new Error('missing');
  missing.classification = 'dedicated-admin-credential-required';
  missing.mutationOutcome = 'none';
  const missingReceipt = projectBlockedSplitReceipt(missing, ENV);
  assert.equal(missingReceipt.mutationPerformed, false);
  assert.equal(missingReceipt.classification, 'dedicated-admin-credential-required');

  const malformed = new Error('malformed');
  malformed.classification = 'provider-credential-invalid';
  malformed.mutationOutcome = 'none';
  const malformedReceipt = projectBlockedSplitReceipt(malformed, ENV, { rollback: true });
  assert.equal(malformedReceipt.classification, 'provider-credential-invalid');
});
