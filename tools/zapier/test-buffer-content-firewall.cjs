'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const {
  validateBufferPublishInput,
  computePublicSignalHash,
  BUFFER_PROVIDER_ACTION,
  BUFFER_PROVIDER_METHOD,
  BUFFER_API_SHARING_MODE,
  BUFFER_API_SAVE_TO_DRAFT,
  BUFFER_REVIEW_WINDOW_MINUTES,
  BUFFER_SCHEDULE_POLICY_ID,
  BUFFER_AUTHORIZATION_MODE,
  BUFFER_NOTIFICATION_MODE,
  PUBLIC_SIGNAL_POLICY_VERSION,
  FOUNDER_APPROVED_STEERING_GRANT_ID,
  LINKEDIN_CHANNEL,
  LINKEDIN_MIN_STRATEGY_TEXT,
  MAX_STEERING_GRANT_ID_LENGTH,
  MAX_AUTHORIZATION_RECEIPT_LENGTH,
} = require('./buffer-content-firewall.cjs');

const sha = '205a239486b6b542648ce2f125178814e358b816';
const generatedAt = '2026-08-02T21:00:00.000Z';
const invocationId = '3f10e0f9-b0b4-4e64-b9ff-c5f10f848067';
const steeringGrantId = FOUNDER_APPROVED_STEERING_GRANT_ID;
const nowMs = Date.parse('2026-08-02T21:01:00.000Z');
const currentIntentHash = 'a'.repeat(64);
const sourceContextHash = 'b'.repeat(64);
const evidenceHash = 'c'.repeat(64);

assert.equal(MAX_STEERING_GRANT_ID_LENGTH, 100);
assert.equal(MAX_AUTHORIZATION_RECEIPT_LENGTH, 240);
assert.equal(BUFFER_API_SHARING_MODE, 'customScheduled');
assert.equal(LINKEDIN_CHANNEL, 'juss_rayy_linkedin');
assert.equal(LINKEDIN_MIN_STRATEGY_TEXT, 20);

const founderLinkedInPost = `
I deleted the marketing before I added the design.

The latest storefront update removed claims the business had not yet earned the right to publish. The replacement is a four-part operating standard: Story. Quality. Care. Proof.

What is verified: the focused implementation exists, unsupported certainty was removed, and Cloudflare Pages built the exact branch head.

What remains unfinished: the change is not merged or live, and browser proof has not executed.
`.trim();

const linkedinStrategy = {
  linkedin_rising_floor_ready: true,
  linkedin_baseline_ref: 'linkedin-export:2026-08-02..2026-08-08',
  linkedin_growth_hypothesis: 'Keep the proof-first hook while increasing distribution and investor relevance.',
  linkedin_24h_gate: 'Compare 24-hour reach, engagement quality, and warm conversation conversion with the verified prior floor.',
  linkedin_48h_gate: 'Compare 48-hour impressions, engagement rate, quality comments, and profile or follower conversion.',
  linkedin_next_mutation: 'Carry forward the winning hook, proof mechanic, format, or conversion signal into the next post.',
};

const bindingInput = {
  post_text: founderLinkedInPost,
  channel: LINKEDIN_CHANNEL,
  source_commit_sha: sha,
  proof_url: '',
  current_intent_hash: currentIntentHash,
  source_context_hash: sourceContextHash,
  evidence_hash: evidenceHash,
  evidence_count: 2,
  policy_version: PUBLIC_SIGNAL_POLICY_VERSION,
};
const publicSignalHash = computePublicSignalHash(bindingInput);
const founderApprovalId = `standing-policy:${steeringGrantId}:${invocationId}:${publicSignalHash.slice(0, 16)}`;
const validInput = {
  ...bindingInput,
  content_field: 'linkedin_draft',
  destination_mode: 'schedule',
  publish_allowed: true,
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
  public_signal_hash: publicSignalHash,
  ...linkedinStrategy,
};

const prepared = validateBufferPublishInput(validInput, { nowMs });
assert.equal(prepared.content_validated, true);
assert.equal(prepared.validated_post_text, founderLinkedInPost);
assert.equal(prepared.proof_url, '');
assert.equal(prepared.authorization_receipt_verified, false);
assert.equal(prepared.standing_policy_correlation_verified, true);
assert.equal(prepared.public_signal_hash, publicSignalHash);
assert.equal(prepared.evidence_hash, evidenceHash);
assert.equal(prepared.evidence_count, 2);
assert.equal(prepared.buffer_action, BUFFER_PROVIDER_ACTION);
assert.equal(prepared.buffer_method, BUFFER_PROVIDER_METHOD);
assert.equal(prepared.buffer_save_to_draft, BUFFER_API_SAVE_TO_DRAFT);
assert.equal(prepared.buffer_api_sharing_mode, BUFFER_API_SHARING_MODE);
assert.equal(prepared.review_window_minutes, BUFFER_REVIEW_WINDOW_MINUTES);
assert.equal(prepared.scheduled_at, '2026-08-02T21:20:00.000Z');
assert.equal(prepared.share_now_allowed, false);

assert.throws(() => validateBufferPublishInput({ ...validInput, post_text: 'You are writing for Ray. Return this structure: {{GitHub PR title}}' }, { nowMs }), /FOUNDER_SIGNAL_CONTENT_REJECTED/);
assert.throws(() => validateBufferPublishInput({ ...validInput, content_field: 'prompt' }, { nowMs }), /instruction input, not publishable copy/);
for (const destinationMode of ['draft', 'queue', 'publish', 'share_now', 'share_next', 'schedule_draft']) {
  assert.throws(() => validateBufferPublishInput({ ...validInput, destination_mode: destinationMode }, { nowMs }), /destination_mode must be schedule/);
}
assert.throws(() => validateBufferPublishInput({ ...validInput, publish_allowed: false }, { nowMs }), /publish_allowed must be true/);
assert.throws(() => validateBufferPublishInput({ ...validInput, steering_grant_id: 'caller-owned-policy' }, { nowMs }), /checked-in founder standing policy/);
assert.throws(() => validateBufferPublishInput({ ...validInput, founder_approval_id: 'founder-approved:caller-text' }, { nowMs }), /context-bound standing-policy correlation receipt/);
assert.throws(() => validateBufferPublishInput({ ...validInput, schedule_policy_id: 'caller-owned-policy' }, { nowMs }), /checked-in scheduling contract/);
assert.throws(() => validateBufferPublishInput({ ...validInput, generated_at: '2026-08-02T20:30:00.000Z' }, { nowMs }), /too stale/);
assert.throws(() => validateBufferPublishInput({ ...validInput, evidence_hash: '' }, { nowMs }), /private evidence lineage/);
assert.throws(() => validateBufferPublishInput({ ...validInput, evidence_count: 0 }, { nowMs }), /positive integer/);
assert.throws(() => validateBufferPublishInput({ ...validInput, current_intent_hash: 'd'.repeat(64) }, { nowMs }), /public_signal_hash does not match/);
assert.throws(() => validateBufferPublishInput({ ...validInput, source_context_hash: 'd'.repeat(64) }, { nowMs }), /public_signal_hash does not match/);
assert.throws(() => validateBufferPublishInput({ ...validInput, post_text: `${founderLinkedInPost} Changed after approval.` }, { nowMs }), /public_signal_hash does not match/);
assert.throws(() => validateBufferPublishInput({ ...validInput, proof_url: 'http://example.com' }, { nowMs }), /proof_url must be empty or an HTTPS URL/);
assert.throws(() => validateBufferPublishInput({ ...validInput, policy_version: 'public-progress-v2' }, { nowMs }), /checked-in public signal policy/);
assert.throws(() => validateBufferPublishInput({ ...validInput, linkedin_rising_floor_ready: false }, { nowMs }), /linkedin_rising_floor_ready must be true/);
for (const baseline of ['', 'unknown', 'none', 'n/a', 'unverified']) {
  assert.throws(() => validateBufferPublishInput({ ...validInput, linkedin_baseline_ref: baseline }, { nowMs }), /linkedin_baseline_ref must name/);
}
for (const field of ['linkedin_growth_hypothesis', 'linkedin_24h_gate', 'linkedin_48h_gate', 'linkedin_next_mutation']) {
  assert.throws(() => validateBufferPublishInput({ ...validInput, [field]: 'too short' }, { nowMs }), new RegExp(`${field} must contain at least 20 characters`));
}
assert.throws(() => validateBufferPublishInput({ ...validInput, content_field: 'facebook_founder_draft' }, { nowMs }), /juss_rayy_linkedin must publish only linkedin_draft/);

const facebookBase = { ...validInput, content_field: 'facebook_founder_draft', channel: 'juss_and_co_facebook' };
for (const field of Object.keys(linkedinStrategy)) delete facebookBase[field];
facebookBase.public_signal_hash = computePublicSignalHash(facebookBase);
facebookBase.founder_approval_id = `standing-policy:${steeringGrantId}:${invocationId}:${facebookBase.public_signal_hash.slice(0, 16)}`;
const facebookPrepared = validateBufferPublishInput(facebookBase, { nowMs });
assert.equal(facebookPrepared.channel, 'juss_and_co_facebook');
assert.equal('linkedin_rising_floor_ready' in facebookPrepared, false);

const overrideAttempt = validateBufferPublishInput({
  ...validInput,
  method: 'share_now', buffer_method: 'share_now', saveToDraft: true, buffer_save_to_draft: true,
  buffer_api_sharing_mode: 'shareNow', buffer_api_due_at: '2026-08-02T21:01:01.000Z', scheduled_at: '2026-08-02T21:01:01.000Z',
}, { nowMs });
assert.equal(overrideAttempt.buffer_method, 'schedule');
assert.equal(overrideAttempt.buffer_save_to_draft, false);
assert.equal(overrideAttempt.buffer_api_sharing_mode, 'customScheduled');
assert.equal(overrideAttempt.scheduled_at, '2026-08-02T21:20:00.000Z');

class FixedDate extends Date { static now() { return nowMs; } }
const zapierLikeContext = { inputData: validInput, output: undefined, Date: FixedDate, require, module: { exports: {} } };
vm.createContext(zapierLikeContext);
vm.runInContext(readFileSync(require.resolve('./buffer-content-firewall.cjs'), 'utf8'), zapierLikeContext, { filename: 'buffer-content-firewall.cjs' });
assert.equal(zapierLikeContext.output.standing_policy_correlation_verified, true);
assert.equal(zapierLikeContext.output.authorization_receipt_verified, false);
assert.equal(zapierLikeContext.output.buffer_method, 'schedule');

console.log('Buffer scheduling firewall verified: public proof is optional, private evidence is mandatory by hash/count, exact Current-You/source/public context drift fails closed, standing-policy correlation is not mislabeled authentication, LinkedIn strategy gates remain enforced, and share-now remains forbidden.');
