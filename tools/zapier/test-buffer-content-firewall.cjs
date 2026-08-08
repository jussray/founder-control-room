'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const {
  validateBufferPublishInput,
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
const generatedAt = '2026-08-02T21:00:00.000Z';
const invocationId = '3f10e0f9-b0b4-4e64-b9ff-c5f10f848067';
const steeringGrantId = 'founder-approved-auto-distribution-v1';
const founderApprovalId = `standing-policy:${steeringGrantId}:${invocationId}`;
const nowMs = Date.parse('2026-08-02T21:01:00.000Z');

assert.equal(MAX_STEERING_GRANT_ID_LENGTH, 100);
assert.equal(MAX_AUTHORIZATION_RECEIPT_LENGTH, 200);
assert.equal(BUFFER_API_SHARING_MODE, 'customScheduled');
assert.equal(LINKEDIN_CHANNEL, 'juss_rayy_linkedin');
assert.equal(LINKEDIN_MIN_STRATEGY_TEXT, 20);

const founderLinkedInPost = `
I deleted the marketing before I added the design.

The latest storefront update removed claims the business had not yet earned the right to publish. The replacement is a four-part operating standard: Story. Quality. Care. Proof.

What is verified: the focused implementation exists, unsupported certainty was removed, and Cloudflare Pages built the exact branch head.

What remains unfinished: the change is not merged or live, and browser proof has not executed.

Proof: https://github.com/jussray/jussbeautifulhair-site/pull/27
`.trim();

const linkedinStrategy = {
  linkedin_rising_floor_ready: true,
  linkedin_baseline_ref: 'linkedin-export:2026-08-02..2026-08-08',
  linkedin_growth_hypothesis: 'Keep the proof-first hook while increasing distribution and investor relevance.',
  linkedin_24h_gate: 'Compare 24-hour reach, engagement quality, and warm conversation conversion with the verified prior floor.',
  linkedin_48h_gate: 'Compare 48-hour impressions, engagement rate, quality comments, and profile or follower conversion.',
  linkedin_next_mutation: 'Carry forward the winning hook, proof mechanic, format, or conversion signal into the next post.',
};

const validInput = {
  post_text: founderLinkedInPost,
  content_field: 'linkedin_draft',
  channel: LINKEDIN_CHANNEL,
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
  ...linkedinStrategy,
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
assert.equal(prepared.buffer_api_sharing_mode, BUFFER_API_SHARING_MODE);
assert.equal(prepared.buffer_api_sharing_mode, 'customScheduled');
assert.equal(prepared.buffer_api_due_at, '2026-08-02T21:20:00.000Z');
assert.equal(prepared.review_window_minutes, BUFFER_REVIEW_WINDOW_MINUTES);
assert.equal(prepared.review_window_minutes, 20);
assert.equal(prepared.scheduled_at, '2026-08-02T21:20:00.000Z');
assert.equal(prepared.review_deadline, prepared.scheduled_at);
assert.equal(prepared.notification_required, true);
assert.equal(prepared.notification_failure_policy, 'cancel_scheduled_batch');
assert.equal(prepared.share_now_allowed, false);
assert.equal(prepared.linkedin_rising_floor_ready, true);
assert.equal(prepared.linkedin_baseline_ref, linkedinStrategy.linkedin_baseline_ref);
assert.equal(prepared.linkedin_growth_hypothesis, linkedinStrategy.linkedin_growth_hypothesis);
assert.equal(prepared.linkedin_24h_gate, linkedinStrategy.linkedin_24h_gate);
assert.equal(prepared.linkedin_48h_gate, linkedinStrategy.linkedin_48h_gate);
assert.equal(prepared.linkedin_next_mutation, linkedinStrategy.linkedin_next_mutation);

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
  /checked-in scheduling contract/,
);

assert.throws(
  () => validateBufferPublishInput({ ...validInput, generated_at: '2026-08-02T20:30:00.000Z' }, { nowMs }),
  /too stale/,
);

assert.throws(
  () => validateBufferPublishInput({ ...validInput, linkedin_rising_floor_ready: false }, { nowMs }),
  /linkedin_rising_floor_ready must be true/,
);

for (const baseline of ['', 'unknown', 'none', 'n\/a', 'unverified']) {
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
  () => validateBufferPublishInput({ ...validInput, content_field: 'facebook_founder_draft' }, { nowMs }),
  /juss_rayy_linkedin must publish only linkedin_draft/,
);

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

const overrideAttempt = validateBufferPublishInput({
  ...validInput,
  method: 'share_now',
  buffer_method: 'share_now',
  saveToDraft: true,
  buffer_save_to_draft: true,
  buffer_api_sharing_mode: 'shareNow',
  buffer_api_due_at: '2026-08-02T21:01:01.000Z',
  scheduled_at: '2026-08-02T21:01:01.000Z',
}, { nowMs });
assert.equal(overrideAttempt.buffer_method, 'schedule');
assert.equal(overrideAttempt.buffer_save_to_draft, false);
assert.equal(overrideAttempt.buffer_api_sharing_mode, 'customScheduled');
assert.equal(overrideAttempt.buffer_api_due_at, '2026-08-02T21:20:00.000Z');
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
assert.equal(zapierLikeContext.output.buffer_api_sharing_mode, 'customScheduled');
assert.equal(zapierLikeContext.output.buffer_api_due_at, '2026-08-02T21:20:00.000Z');
assert.equal(zapierLikeContext.output.review_window_minutes, 20);
assert.equal(zapierLikeContext.output.linkedin_rising_floor_ready, true);

console.log('Buffer scheduling firewall verified: approved finished copy receives one owned 20-minute schedule; LinkedIn additionally requires a verified rising-floor baseline, growth hypothesis, 24h/48h gates, and next mutation while non-LinkedIn channels remain unchanged.');
