'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const {
  validateBufferPublishInput,
  BUFFER_PROVIDER_ACTION,
  BUFFER_PROVIDER_METHOD,
  BUFFER_API_SAVE_TO_DRAFT,
  BUFFER_REVIEW_WINDOW_MINUTES,
  BUFFER_SCHEDULE_POLICY_ID,
  BUFFER_AUTHORIZATION_MODE,
  BUFFER_NOTIFICATION_MODE,
} = require('./buffer-content-firewall.cjs');

const sha = '205a239486b6b542648ce2f125178814e358b816';
const generatedAt = '2026-08-02T21:00:00.000Z';
const invocationId = '3f10e0f9-b0b4-4e64-b9ff-c5f10f848067';
const steeringGrantId = 'founder-approved-auto-distribution-v1';
const founderApprovalId = `standing-policy:${steeringGrantId}:${invocationId}`;
const nowMs = Date.parse('2026-08-02T21:01:00.000Z');

const founderLinkedInPost = `
I deleted the marketing before I added the design.

The latest storefront update removed claims the business had not yet earned the right to publish. The replacement is a four-part operating standard: Story. Quality. Care. Proof.

What is verified: the focused implementation exists, unsupported certainty was removed, and Cloudflare Pages built the exact branch head.

What remains unfinished: the change is not merged or live, and browser proof has not executed.

Proof: https://github.com/jussray/jussbeautifulhair-site/pull/27
`.trim();

const validInput = {
  post_text: founderLinkedInPost,
  content_field: 'linkedin_draft',
  channel: 'juss_rayy_linkedin',
  destination_mode: 'schedule',
  publish_allowed: true,
  proof_url: 'https://github.com/jussray/jussbeautifulhair-site/pull/27',
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
};

const prepared = validateBufferPublishInput(validInput, { nowMs });
assert.equal(prepared.content_validated, true);
assert.equal(prepared.validated_post_text, founderLinkedInPost);
assert.equal(prepared.destination_mode, 'schedule');
assert.equal(prepared.publish_allowed, true);
assert.equal(prepared.authorization_mode, BUFFER_AUTHORIZATION_MODE);
assert.equal(prepared.authorization_receipt_verified, true);
assert.equal(prepared.schedule_policy_id, BUFFER_SCHEDULE_POLICY_ID);
assert.equal(prepared.buffer_action, BUFFER_PROVIDER_ACTION);
assert.equal(prepared.buffer_action, 'buffer_add_to_queue');
assert.equal(prepared.buffer_method, BUFFER_PROVIDER_METHOD);
assert.equal(prepared.buffer_method, 'schedule');
assert.equal(prepared.buffer_save_to_draft, BUFFER_API_SAVE_TO_DRAFT);
assert.equal(prepared.buffer_save_to_draft, false);
assert.equal(prepared.review_window_minutes, BUFFER_REVIEW_WINDOW_MINUTES);
assert.equal(prepared.review_window_minutes, 20);
assert.equal(prepared.scheduled_at, '2026-08-02T21:20:00.000Z');
assert.equal(prepared.review_deadline, prepared.scheduled_at);
assert.equal(prepared.notification_required, true);
assert.equal(prepared.notification_failure_policy, 'cancel_scheduled_batch');
assert.equal(prepared.share_now_allowed, false);

assert.throws(
  () => validateBufferPublishInput({ ...validInput, post_text: 'You are writing for Ray. Return this structure: {{GitHub PR title}}' }, { nowMs }),
  /FOUNDER_SIGNAL_CONTENT_REJECTED/,
);

assert.throws(
  () => validateBufferPublishInput({ ...validInput, content_field: 'prompt' }, { nowMs }),
  /instruction input, not publishable copy/,
);

for (const destinationMode of ['draft', 'queue', 'publish', 'share_now', 'share_next', 'schedule_draft']) {
  assert.throws(
    () => validateBufferPublishInput({ ...validInput, destination_mode: destinationMode }, { nowMs }),
    /destination_mode must be schedule/,
    `${destinationMode} must fail under the schedule-only contract`,
  );
}

assert.throws(
  () => validateBufferPublishInput({ ...validInput, publish_allowed: false }, { nowMs }),
  /publish_allowed must be true/,
);

assert.throws(
  () => validateBufferPublishInput({ ...validInput, founder_approval_id: 'founder-approved:caller-text' }, { nowMs }),
  /runtime-minted receipt/,
);

assert.throws(
  () => validateBufferPublishInput({ ...validInput, schedule_policy_id: 'caller-owned-policy' }, { nowMs }),
  /checked-in scheduling contract/,
);

assert.throws(
  () => validateBufferPublishInput({ ...validInput, generated_at: '2026-08-02T20:30:00.000Z' }, { nowMs }),
  /too stale/,
);

const overrideAttempt = validateBufferPublishInput({
  ...validInput,
  method: 'share_now',
  buffer_method: 'share_now',
  saveToDraft: true,
  buffer_save_to_draft: true,
  scheduled_at: '2026-08-02T21:01:01.000Z',
}, { nowMs });
assert.equal(overrideAttempt.buffer_method, 'schedule');
assert.equal(overrideAttempt.buffer_save_to_draft, false);
assert.equal(overrideAttempt.scheduled_at, '2026-08-02T21:20:00.000Z');

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
assert.equal(zapierLikeContext.output.buffer_method, 'schedule');
assert.equal(zapierLikeContext.output.buffer_save_to_draft, false);
assert.equal(zapierLikeContext.output.review_window_minutes, 20);

console.log('Buffer scheduling firewall verified: approved finished copy receives one owned schedule 20 minutes after generation; stale timestamps, prompts, draft/queue/share-now modes, and caller overrides fail closed.');
