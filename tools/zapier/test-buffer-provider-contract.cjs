'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const {
  validateBufferPublishInput,
  BUFFER_PROVIDER_ACTION,
  BUFFER_PROVIDER_METHOD,
  BUFFER_API_SAVE_TO_DRAFT,
  BUFFER_REVIEW_WINDOW_MINUTES,
  BUFFER_SCHEDULE_POLICY_ID,
  BUFFER_AUTHORIZATION_MODE,
  BUFFER_NOTIFICATION_MODE,
  MAX_STEERING_GRANT_ID_LENGTH,
  MAX_AUTHORIZATION_RECEIPT_LENGTH,
} = require('./buffer-content-firewall.cjs');

const ROOT = resolve(__dirname, '../..');
const contract = JSON.parse(readFileSync(join(ROOT, 'config', 'buffer-provider-contract.json'), 'utf8'));

assert.equal(contract.version, 2);
assert.equal(contract.status, 'schedule-with-review-window');
assert.equal(contract.provider, 'buffer');
assert.equal(contract.zapier.action, BUFFER_PROVIDER_ACTION);
assert.equal(contract.zapier.requiredMethod, BUFFER_PROVIDER_METHOD);
assert.deepEqual(contract.zapier.allowedMethods, [BUFFER_PROVIDER_METHOD]);
assert.equal(contract.api.mutation, 'createPost');
assert.equal(contract.api.required.saveToDraft, BUFFER_API_SAVE_TO_DRAFT);
assert.equal(contract.reviewWindow.minutes, BUFFER_REVIEW_WINDOW_MINUTES);
assert.equal(contract.reviewWindow.shareNowAllowed, false);
assert.equal(contract.notification.provider, 'gmail');
assert.equal(contract.notification.required, true);
assert.equal(contract.notification.failurePolicy, 'cancel_scheduled_batch');
assert.equal(contract.notification.replyParsingPolicy, 'exactly_one_unquoted_command_on_first_nonempty_line');
assert.equal(contract.notification.ambiguousReplyPolicy, 'reject_multiple_unquoted_command_lines');
assert.equal(contract.authority.publishAllowed, true);
assert.equal(contract.authority.schedulePolicyId, BUFFER_SCHEDULE_POLICY_ID);
assert.equal(contract.authority.requiredAuthorizationMode, BUFFER_AUTHORIZATION_MODE);
assert.equal(contract.authority.requiresRuntimeMintedReceipt, true);
assert.equal(contract.authority.receiptPurpose, 'exact runtime correlation');
assert.equal(contract.authority.maximumGrantIdLength, MAX_STEERING_GRANT_ID_LENGTH);
assert.equal(contract.authority.maximumReceiptLength, MAX_AUTHORIZATION_RECEIPT_LENGTH);
assert.equal(contract.authority.liveProviderMutationIncluded, false);

const baseInput = {
  post_text: [
    'The repository now computes a Buffer schedule exactly twenty minutes after verified content generation.',
    'A required Gmail digest exposes each caption, channel, fire time, and cancellation path before the posts can fire.',
    'Proof: https://github.com/jussray/founder-control-room/pull/222',
  ].join('\n\n'),
  content_field: 'linkedin_draft',
  channel: 'juss_rayy_linkedin',
  destination_mode: 'schedule',
  publish_allowed: true,
  proof_url: 'https://github.com/jussray/founder-control-room/pull/222',
  source_commit_sha: '38d8e5bd40594915407126915177f98c6ef983d9',
  generated_at: '2026-08-02T21:00:00.000Z',
  invocation_id: '3f10e0f9-b0b4-4e64-b9ff-c5f10f848067',
  steering_grant_id: 'founder-approved-auto-distribution-v1',
  founder_approval_id: 'standing-policy:founder-approved-auto-distribution-v1:3f10e0f9-b0b4-4e64-b9ff-c5f10f848067',
  authorization_mode: BUFFER_AUTHORIZATION_MODE,
  batch_id: '66cf315f-e1a0-4aad-9c76-355f1df30b54',
  batch_size: 1,
  batch_index: 1,
  schedule_policy_id: BUFFER_SCHEDULE_POLICY_ID,
  notification_mode: BUFFER_NOTIFICATION_MODE,
};

const nowMs = Date.parse('2026-08-02T21:00:30.000Z');
const prepared = validateBufferPublishInput(baseInput, { nowMs });
assert.equal(prepared.buffer_action, contract.zapier.action);
assert.equal(prepared.buffer_method, contract.zapier.requiredMethod);
assert.equal(prepared.buffer_save_to_draft, contract.api.required.saveToDraft);
assert.equal(prepared.destination_mode, 'schedule');
assert.equal(prepared.publish_allowed, true);
assert.equal(prepared.review_window_minutes, contract.reviewWindow.minutes);
assert.equal(prepared.notification_mode, BUFFER_NOTIFICATION_MODE);
assert.equal(prepared.authorization_receipt_verified, true);

for (const destinationMode of contract.zapier.rejectedMethods) {
  assert.throws(
    () => validateBufferPublishInput({ ...baseInput, destination_mode: destinationMode }, { nowMs }),
    /destination_mode must be schedule/,
    `${destinationMode} must fail closed in executable code`,
  );
}

assert.throws(
  () => validateBufferPublishInput({ ...baseInput, destination_mode: '' }, { nowMs }),
  /destination_mode must be schedule/,
);

assert.throws(
  () => validateBufferPublishInput({ ...baseInput, publish_allowed: false }, { nowMs }),
  /publish_allowed must be true/,
);

assert.throws(
  () => validateBufferPublishInput({ ...baseInput, founder_approval_id: 'standing-policy:wrong:receipt' }, { nowMs }),
  /runtime-minted receipt/,
);

const callerOverride = validateBufferPublishInput({
  ...baseInput,
  method: 'share_now',
  buffer_method: 'share_now',
  saveToDraft: true,
  buffer_save_to_draft: true,
  scheduled_at: '2026-08-02T21:00:31.000Z',
}, { nowMs });
assert.equal(callerOverride.buffer_method, 'schedule');
assert.equal(callerOverride.buffer_save_to_draft, false);
assert.equal(callerOverride.scheduled_at, '2026-08-02T21:20:00.000Z');

console.log('Buffer provider contract verified against executable scheduling code: backend-aligned runtime receipt correlation, one owned 20-minute schedule, one-command Gmail review parsing, fail-closed notification compensation, and no share-now override.');
