'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
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
  LINKEDIN_CHANNEL,
  LINKEDIN_MIN_STRATEGY_TEXT,
  MAX_STEERING_GRANT_ID_LENGTH,
  MAX_AUTHORIZATION_RECEIPT_LENGTH,
} = require('./buffer-content-firewall.cjs');

const sha = '205a239486b6b542648ce2f125178814e358b816';
const generatedAt = '2026-08-27T06:00:00.000Z';
const invocationId = '3f10e0f9-b0b4-4e64-b9ff-c5f10f848067';
const steeringGrantId = 'founder-draft-review-v1';
const founderApprovalId = `standing-policy:${steeringGrantId}:${invocationId}`;
const nowMs = Date.parse('2026-08-27T06:01:00.000Z');

assert.equal(MAX_STEERING_GRANT_ID_LENGTH, 100);
assert.equal(MAX_AUTHORIZATION_RECEIPT_LENGTH, 200);
assert.equal(BUFFER_PROVIDER_ACTION, 'buffer_add_to_queue');
assert.equal(BUFFER_PROVIDER_METHOD, 'draft');
assert.equal(BUFFER_API_SHARING_MODE, 'addToQueue');
assert.equal(BUFFER_API_SAVE_TO_DRAFT, true);
assert.equal(BUFFER_REVIEW_WINDOW_MINUTES, 0);
assert.equal(LINKEDIN_CHANNEL, 'juss_rayy_linkedin');
assert.equal(LINKEDIN_MIN_STRATEGY_TEXT, 20);

const founderLinkedInPost = `
The Founder Signal Engine now stops at Buffer Drafts.

The provider method is pinned to draft, API saveToDraft is true, and no scheduled fire time is produced by the executable firewall.

Proof: https://github.com/jussray/founder-control-room/pull/570
`.trim();

const linkedinStrategy = {
  linkedin_rising_floor_ready: true,
  linkedin_baseline_ref: 'linkedin-export:2026-08-20..2026-08-26',
  linkedin_growth_hypothesis: 'Keep the proof-first hook while increasing founder clarity and useful replies.',
  linkedin_24h_gate: 'Compare reach, engagement quality, and warm conversation conversion with the verified prior floor.',
  linkedin_48h_gate: 'Compare impressions, engagement quality, profile movement, and useful founder conversations.',
  linkedin_next_mutation: 'Carry forward the winning hook and proof mechanic into the next reviewed draft.',
};

const validInput = {
  post_text: founderLinkedInPost,
  content_field: 'linkedin_draft',
  channel: LINKEDIN_CHANNEL,
  destination_mode: 'draft',
  publish_allowed: false,
  proof_url: 'https://github.com/jussray/founder-control-room/pull/570',
  source_commit_sha: sha,
  generated_at: generatedAt,
  batch_id: '66cf315f-e1a0-4aad-9c76-355f1df30b54',
  batch_size: 3,
  batch_index: 1,
  invocation_id: invocationId,
  steering_grant_id: steeringGrantId,
  founder_approval_id: founderApprovalId,
  authorization_mode: BUFFER_AUTHORIZATION_MODE,
  schedule_policy_id: BUFFER_SCHEDULE_POLICY_ID,
  notification_mode: BUFFER_NOTIFICATION_MODE,
  ...linkedinStrategy,
};

const prepared = validateBufferPublishInput(validInput, { nowMs });
assert.equal(prepared.content_validated, true);
assert.equal(prepared.validated_post_text, founderLinkedInPost);
assert.equal(prepared.destination_mode, 'draft');
assert.equal(prepared.publish_allowed, false);
assert.equal(prepared.authorization_mode, BUFFER_AUTHORIZATION_MODE);
assert.equal(prepared.authorization_receipt_verified, true);
assert.equal(prepared.schedule_policy_id, BUFFER_SCHEDULE_POLICY_ID);
assert.equal(prepared.buffer_action, 'buffer_add_to_queue');
assert.equal(prepared.buffer_method, 'draft');
assert.equal(prepared.buffer_save_to_draft, true);
assert.equal(prepared.buffer_api_sharing_mode, 'addToQueue');
assert.equal(prepared.buffer_api_due_at, null);
assert.equal(prepared.review_window_minutes, 0);
assert.equal(prepared.scheduled_at, null);
assert.equal(prepared.review_deadline, null);
assert.equal(prepared.review_state, 'draft_pending_founder_review');
assert.equal(prepared.notification_required, false);
assert.equal(prepared.notification_failure_policy, 'retain_draft');
assert.equal(prepared.share_now_allowed, false);
assert.equal(prepared.linkedin_rising_floor_ready, true);

assert.throws(
  () => validateBufferPublishInput({ ...validInput, post_text: 'You are writing for Ray. Return this structure: {{GitHub PR title}}' }, { nowMs }),
  /FOUNDER_SIGNAL_CONTENT_REJECTED/,
);

assert.throws(
  () => validateBufferPublishInput({ ...validInput, content_field: 'prompt' }, { nowMs }),
  /instruction input, not publishable copy/,
);

for (const destinationMode of ['queue', 'schedule', 'publish', 'share_now', 'share_next', 'schedule_draft', 'future_unknown', '']) {
  assert.throws(
    () => validateBufferPublishInput({ ...validInput, destination_mode: destinationMode }, { nowMs }),
    /destination_mode must be draft/,
    `${destinationMode || '<missing>'} must fail under the draft-only contract`,
  );
}

for (const publishAllowed of [true, 'true', undefined, null, '']) {
  assert.throws(
    () => validateBufferPublishInput({ ...validInput, publish_allowed: publishAllowed }, { nowMs }),
    /publish_allowed must be explicitly false/,
  );
}

assert.throws(
  () => validateBufferPublishInput({ ...validInput, founder_approval_id: 'founder-approved:caller-text' }, { nowMs }),
  /runtime-minted receipt/,
);

const overlongGrantId = 'g'.repeat(MAX_STEERING_GRANT_ID_LENGTH + 1);
assert.throws(
  () => validateBufferPublishInput({
    ...validInput,
    steering_grant_id: overlongGrantId,
    founder_approval_id: `standing-policy:${overlongGrantId}:${invocationId}`,
  }, { nowMs }),
  /must not exceed 100 characters/,
);

assert.throws(
  () => validateBufferPublishInput({
    ...validInput,
    founder_approval_id: 'r'.repeat(MAX_AUTHORIZATION_RECEIPT_LENGTH + 1),
  }, { nowMs }),
  /must not exceed 200 characters/,
);

assert.throws(
  () => validateBufferPublishInput({ ...validInput, schedule_policy_id: 'caller-owned-policy' }, { nowMs }),
  /checked-in draft-review contract/,
);

assert.throws(
  () => validateBufferPublishInput({ ...validInput, generated_at: '2026-08-27T05:30:00.000Z' }, { nowMs }),
  /too stale/,
);

assert.throws(
  () => validateBufferPublishInput({ ...validInput, linkedin_rising_floor_ready: false }, { nowMs }),
  /linkedin_rising_floor_ready must be true/,
);

for (const baseline of ['', 'unknown', 'none', 'n/a', 'unverified']) {
  assert.throws(
    () => validateBufferPublishInput({ ...validInput, linkedin_baseline_ref: baseline }, { nowMs }),
    /linkedin_baseline_ref must name the latest verified LinkedIn analytics or platform-recap baseline/,
  );
}

for (const field of ['linkedin_growth_hypothesis', 'linkedin_24h_gate', 'linkedin_48h_gate', 'linkedin_next_mutation']) {
  assert.throws(
    () => validateBufferPublishInput({ ...validInput, [field]: 'too short' }, { nowMs }),
    new RegExp(`${field} must contain at least 20 characters`),
  );
}

assert.throws(
  () => validateBufferProviderActionContract({ action: 'buffer_add_to_queue' }),
  /method must be draft/,
);
for (const method of ['queue', 'schedule', 'share_now', 'share_next', 'schedule_draft', 'future_unknown']) {
  assert.throws(
    () => validateBufferProviderActionContract({ action: 'buffer_add_to_queue', method }),
    /method must be draft/,
  );
}

const facebookInput = {
  ...validInput,
  content_field: 'facebook_founder_draft',
  channel: 'juss_and_co_facebook',
};
for (const field of Object.keys(linkedinStrategy)) delete facebookInput[field];
const facebookPrepared = validateBufferPublishInput(facebookInput, { nowMs });
assert.equal(facebookPrepared.content_validated, true);
assert.equal(facebookPrepared.channel, 'juss_and_co_facebook');
assert.equal('linkedin_rising_floor_ready' in facebookPrepared, false);
assert.equal(facebookPrepared.buffer_method, 'draft');

const overrideAttempt = validateBufferPublishInput({
  ...validInput,
  method: 'share_now',
  buffer_method: 'share_now',
  saveToDraft: false,
  buffer_save_to_draft: false,
  buffer_api_sharing_mode: 'shareNow',
  buffer_api_due_at: '2026-08-27T06:01:01.000Z',
  scheduled_at: '2026-08-27T06:01:01.000Z',
}, { nowMs });
assert.equal(overrideAttempt.buffer_method, 'draft');
assert.equal(overrideAttempt.buffer_save_to_draft, true);
assert.equal(overrideAttempt.buffer_api_sharing_mode, 'addToQueue');
assert.equal(overrideAttempt.buffer_api_due_at, null);
assert.equal(overrideAttempt.scheduled_at, null);

class FixedDate extends Date {
  static now() { return nowMs; }
}

const zapierLikeContext = {
  inputData: validInput,
  output: undefined,
  Date: FixedDate,
  require,
  module: { exports: {} },
};
vm.createContext(zapierLikeContext);
vm.runInContext(
  readFileSync(require.resolve('./buffer-content-firewall.cjs'), 'utf8'),
  zapierLikeContext,
  { filename: 'buffer-content-firewall.cjs' },
);
assert.equal(zapierLikeContext.output.buffer_method, 'draft');
assert.equal(zapierLikeContext.output.buffer_save_to_draft, true);
assert.equal(zapierLikeContext.output.buffer_api_sharing_mode, 'addToQueue');
assert.equal(zapierLikeContext.output.buffer_api_due_at, null);
assert.equal(zapierLikeContext.output.review_window_minutes, 0);

console.log('Buffer draft firewall verified: finished copy is held as an explicit Buffer draft with saveToDraft=true, no scheduled fire time, no share-now path, and unsafe provider methods fail closed.');
