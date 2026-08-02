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
  BUFFER_SCHEDULE_AUTHORITY,
  BUFFER_NOTIFICATION_MODE,
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
assert.equal(contract.authority.publishAllowed, true);
assert.equal(contract.authority.standingAuthorityId, BUFFER_SCHEDULE_AUTHORITY);
assert.equal(contract.authority.liveProviderMutationIncluded, false);

const baseInput = {
  post_text: [
    'The repository now computes a Buffer schedule exactly twenty minutes after verified content generation.',
    'A required Gmail digest exposes each caption, channel, fire time, and cancellation path before the posts can fire.',
    'Proof: https://github.com/jussray/founder-control-room/pull/221',
  ].join('\n\n'),
  content_field: 'linkedin_draft',
  channel: 'juss_rayy_linkedin',
  destination_mode: 'schedule',
  publish_allowed: true,
  proof_url: 'https://github.com/jussray/founder-control-room/pull/221',
  source_commit_sha: '38d8e5bd40594915407126915177f98c6ef983d9',
  generated_at: '2026-08-02T21:00:00.000Z',
  batch_id: '66cf315f-e1a0-4aad-9c76-355f1df30b54',
  batch_size: 1,
  batch_index: 1,
  schedule_authority_id: BUFFER_SCHEDULE_AUTHORITY,
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

console.log('Buffer provider contract verified against executable scheduling code: one owned 20-minute schedule, required Gmail review digest, fail-closed notification compensation, and no share-now override.');
