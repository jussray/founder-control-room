'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const {
  validateBufferPublishInput,
  validateBufferProviderActionContract,
  BUFFER_PROVIDER_ACTION,
  BUFFER_PROVIDER_METHOD,
  BUFFER_API_SHARING_MODE,
  BUFFER_API_SAVE_TO_DRAFT,
  BUFFER_REVIEW_WINDOW_MINUTES,
  BUFFER_SCHEDULE_POLICY_ID,
  BUFFER_AUTHORIZATION_MODE,
  BUFFER_NOTIFICATION_MODE,
} = require('./buffer-content-firewall.cjs');

const ROOT = resolve(__dirname, '../..');
const contract = JSON.parse(readFileSync(join(ROOT, 'config', 'buffer-provider-contract.json'), 'utf8'));

assert.equal(contract.version, 3);
assert.equal(contract.status, 'draft-only-source-enforced-awaiting-live-drafts-proof');
assert.equal(contract.provider, 'buffer');
assert.equal(contract.zapier.action, BUFFER_PROVIDER_ACTION);
assert.equal(contract.zapier.requiredMethod, BUFFER_PROVIDER_METHOD);
assert.equal(contract.zapier.requiredMethod, 'draft');
assert.deepEqual(contract.zapier.allowedMethods, ['draft']);
assert.equal(contract.zapier.mappingComment, 'method: draft # required; never rely on Buffer default');
assert.equal(contract.api.mutation, 'createPost');
assert.equal(contract.api.required.sharingMode, BUFFER_API_SHARING_MODE);
assert.equal(contract.api.required.sharingMode, 'addToQueue');
assert.equal(contract.api.required.dueAtSource, null);
assert.equal(contract.api.required.saveToDraft, BUFFER_API_SAVE_TO_DRAFT);
assert.equal(contract.api.required.saveToDraft, true);
assert.equal(contract.reviewWindow.minutes, BUFFER_REVIEW_WINDOW_MINUTES);
assert.equal(contract.reviewWindow.minutes, 0);
assert.equal(contract.reviewWindow.fireTimeOwnedByFirewall, false);
assert.equal(contract.reviewWindow.noReplyBehavior, 'remain_draft_until_explicit_founder_action');
assert.equal(contract.reviewWindow.shareNowAllowed, false);
assert.equal(contract.notification.required, false);
assert.equal(contract.notification.failurePolicy, 'retain_draft');
assert.equal(contract.authority.publishAllowed, false);
assert.equal(contract.authority.schedulePolicyId, BUFFER_SCHEDULE_POLICY_ID);
assert.equal(contract.authority.liveProviderMutationIncluded, false);

assert.deepEqual(
  validateBufferProviderActionContract({
    action: 'buffer_add_to_queue',
    method: 'draft',
  }),
  {
    buffer_action: 'buffer_add_to_queue',
    buffer_method: 'draft',
  },
);

for (const method of [undefined, '', 'queue', 'schedule', 'share_next', 'share_now', 'schedule_draft', 'publish', 'future_unknown']) {
  assert.throws(
    () => validateBufferProviderActionContract({
      action: 'buffer_add_to_queue',
      method,
    }),
    /method must be draft/,
    `${String(method)} must fail closed for buffer_add_to_queue`,
  );
}

assert.throws(
  () => validateBufferProviderActionContract({ method: 'draft' }),
  /action must be buffer_add_to_queue/,
  'missing action must fail closed',
);

const baseInput = {
  post_text: [
    'The repository now forces Buffer handoffs into a draft that cannot publish on its own.',
    'A human must explicitly move the draft forward after review.',
    'Proof: https://github.com/jussray/founder-control-room/pull/570',
  ].join('\n\n'),
  content_field: 'linkedin_draft',
  channel: 'juss_rayy_linkedin',
  destination_mode: 'draft',
  publish_allowed: false,
  proof_url: 'https://github.com/jussray/founder-control-room/pull/570',
  source_commit_sha: '38d8e5bd40594915407126915177f98c6ef983d9',
  generated_at: '2026-08-27T06:00:00.000Z',
  invocation_id: '3f10e0f9-b0b4-4e64-b9ff-c5f10f848067',
  steering_grant_id: 'founder-draft-review-v1',
  founder_approval_id: 'standing-policy:founder-draft-review-v1:3f10e0f9-b0b4-4e64-b9ff-c5f10f848067',
  authorization_mode: BUFFER_AUTHORIZATION_MODE,
  batch_id: '66cf315f-e1a0-4aad-9c76-355f1df30b54',
  batch_size: 1,
  batch_index: 1,
  schedule_policy_id: BUFFER_SCHEDULE_POLICY_ID,
  notification_mode: BUFFER_NOTIFICATION_MODE,
  linkedin_rising_floor_ready: true,
  linkedin_baseline_ref: 'linkedin-export:2026-08-20..2026-08-26',
  linkedin_growth_hypothesis: 'Preserve proof-first resonance while testing stronger founder clarity.',
  linkedin_24h_gate: 'Compare reach, engagement quality, and warm conversation conversion to the prior floor.',
  linkedin_48h_gate: 'Compare impressions, engagement quality, profile movement, and useful replies.',
  linkedin_next_mutation: 'Carry the strongest hook and proof mechanic into the next reviewed draft.',
};

const nowMs = Date.parse('2026-08-27T06:00:30.000Z');
const prepared = validateBufferPublishInput(baseInput, { nowMs });
assert.equal(prepared.buffer_action, contract.zapier.action);
assert.equal(prepared.buffer_method, 'draft');
assert.equal(prepared.buffer_save_to_draft, true);
assert.equal(prepared.buffer_api_sharing_mode, 'addToQueue');
assert.equal(prepared.buffer_api_due_at, null);
assert.equal(prepared.destination_mode, 'draft');
assert.equal(prepared.publish_allowed, false);
assert.equal(prepared.scheduled_at, null);
assert.equal(prepared.review_deadline, null);
assert.equal(prepared.review_state, 'draft_pending_founder_review');
assert.equal(prepared.notification_required, false);
assert.equal(prepared.share_now_allowed, false);

for (const destinationMode of ['queue', 'schedule', 'share_next', 'share_now', 'schedule_draft', 'publish', 'future_unknown', '']) {
  assert.throws(
    () => validateBufferPublishInput({ ...baseInput, destination_mode: destinationMode }, { nowMs }),
    /destination_mode must be draft/,
    `${destinationMode || '<missing>'} destination must fail closed`,
  );
}

for (const publishAllowed of [true, 'true', undefined, null, '']) {
  assert.throws(
    () => validateBufferPublishInput({ ...baseInput, publish_allowed: publishAllowed }, { nowMs }),
    /publish_allowed must be explicitly false/,
  );
}

const callerOverride = validateBufferPublishInput({
  ...baseInput,
  method: 'share_now',
  buffer_method: 'share_now',
  saveToDraft: false,
  buffer_save_to_draft: false,
  buffer_api_sharing_mode: 'shareNow',
  buffer_api_due_at: '2026-08-27T06:01:00.000Z',
  scheduled_at: '2026-08-27T06:01:00.000Z',
}, { nowMs });
assert.equal(callerOverride.buffer_method, 'draft');
assert.equal(callerOverride.buffer_save_to_draft, true);
assert.equal(callerOverride.buffer_api_sharing_mode, 'addToQueue');
assert.equal(callerOverride.buffer_api_due_at, null);
assert.equal(callerOverride.scheduled_at, null);

console.log('Buffer provider contract verified: buffer_add_to_queue is fail-closed to explicit method=draft, API saveToDraft=true, publish authority=false, and no scheduled fire time.');
