'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
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
  PUBLIC_SIGNAL_CONTEXT_VERSION,
  PUBLIC_SIGNAL_POLICY_VERSION,
  FOUNDER_APPROVED_STEERING_GRANT_ID,
  MAX_STEERING_GRANT_ID_LENGTH,
  MAX_AUTHORIZATION_RECEIPT_LENGTH,
} = require('./buffer-content-firewall.cjs');

const ROOT = resolve(__dirname, '../..');
const contract = JSON.parse(readFileSync(join(ROOT, 'config', 'buffer-provider-contract.json'), 'utf8'));

assert.equal(contract.version, 3);
assert.equal(contract.status, 'implemented-awaiting-live-provider-and-ingress-proof');
assert.equal(contract.provider, 'buffer');
assert.equal(contract.zapier.action, BUFFER_PROVIDER_ACTION);
assert.equal(contract.zapier.requiredMethod, BUFFER_PROVIDER_METHOD);
assert.deepEqual(contract.zapier.allowedMethods, [BUFFER_PROVIDER_METHOD]);
assert.equal(contract.api.mutation, 'createPost');
assert.equal(contract.api.required.sharingMode, BUFFER_API_SHARING_MODE);
assert.equal(contract.api.required.sharingMode, 'customScheduled');
assert.equal(contract.api.required.dueAtSource, 'scheduled_at');
assert.equal(contract.api.required.saveToDraft, BUFFER_API_SAVE_TO_DRAFT);
assert.equal(contract.reviewWindow.minutes, BUFFER_REVIEW_WINDOW_MINUTES);
assert.equal(contract.reviewWindow.shareNowAllowed, false);
assert.equal(contract.notification.provider, 'gmail');
assert.equal(contract.notification.required, true);
assert.equal(contract.notification.failurePolicy, 'cancel_scheduled_batch');
assert.ok(contract.notification.requiredFields.includes('reply_context_id'));
assert.ok(contract.notification.requiredFields.includes('gmail_thread_id'));
assert.deepEqual(contract.notification.replyAuthorizationFields, [
  'founder_sender', 'reply_to', 'reply_context_id', 'review_token', 'review_deadline',
]);
assert.deepEqual(contract.notification.evidenceOnlyFields, ['gmail_thread_id']);
assert.equal(contract.notification.replyIdentityPolicy, 'exact_founder_sender_private_recipient_and_uuid_review_context');
assert.equal(contract.notification.replyParsingPolicy, 'exactly_one_unquoted_command_on_first_nonempty_line');
assert.equal(contract.notification.ambiguousReplyPolicy, 'reject_multiple_unquoted_command_lines');
assert.equal(contract.notification.replyIngress.requiredLatencyClass, 'instant_private_ingress');
assert.equal(contract.notification.replyIngress.gmailPollingAllowed, false);
assert.equal(contract.notification.replyIngress.preferredImplementation, 'cloudflare_email_routing_worker');

assert.equal(contract.authority.publishAllowed, true);
assert.equal(contract.authority.schedulePolicyId, BUFFER_SCHEDULE_POLICY_ID);
assert.equal(contract.authority.requiredAuthorizationMode, BUFFER_AUTHORIZATION_MODE);
assert.equal(contract.authority.standingGrantId, FOUNDER_APPROVED_STEERING_GRANT_ID);
assert.equal(contract.authority.requiresRuntimeMintedCorrelation, true);
assert.equal(contract.authority.correlationFormat, 'standing-policy:<grantId>:<invocationId>:<publicSignalHashPrefix>');
assert.match(contract.authority.correlationPurpose, /not founder authentication/);
assert.equal(contract.authority.authenticatedAuthorizationReceiptVerifiedAtFirewall, false);
assert.match(contract.authority.securityBoundary, /actor authentication.*trusted private ingress/i);
assert.equal(contract.authority.publicSignalContextVersion, PUBLIC_SIGNAL_CONTEXT_VERSION);
assert.equal(contract.authority.publicSignalPolicyVersion, PUBLIC_SIGNAL_POLICY_VERSION);
assert.equal(contract.authority.requiresCurrentIntentHash, true);
assert.equal(contract.authority.requiresSourceContextHash, true);
assert.equal(contract.authority.requiresPrivateEvidenceHash, true);
assert.equal(contract.authority.requiresPositiveEvidenceCount, true);
assert.equal(contract.authority.maximumGrantIdLength, MAX_STEERING_GRANT_ID_LENGTH);
assert.equal(contract.authority.maximumReceiptLength, MAX_AUTHORIZATION_RECEIPT_LENGTH);
assert.equal(contract.authority.requiresExactSourceCommit, true);
assert.equal(contract.authority.requiresHttpsProof, false);
assert.equal(contract.authority.optionalPublicProofMustBeHttps, true);
assert.equal(contract.authority.liveProviderMutationIncluded, false);
assert.equal(contract.activationGates.freeTwoStepZapAloneSufficient, false);
assert.equal(contract.activationGates.gmailPollingTriggerAcceptedForDeadlineCommands, false);
assert.equal(contract.activationGates.controlledSyntheticRunRequired, true);
assert.equal(contract.activationGates.privateIngressAuthenticationProofRequiredBeforeClaimingAuthenticatedFounderAuthority, true);

const nowMs = Date.parse('2026-08-02T21:00:30.000Z');
const invocationId = '3f10e0f9-b0b4-4e64-b9ff-c5f10f848067';
const baseInput = {
  post_text: [
    'The repository now computes a Buffer schedule exactly twenty minutes after verified content generation.',
    'A required Gmail digest exposes each caption, channel, fire time, and cancellation path before the posts can fire.',
    'The public copy can stay useful without exposing the private evidence lineage behind the claim.',
  ].join('\n\n'),
  content_field: 'linkedin_draft',
  channel: 'juss_rayy_linkedin',
  destination_mode: 'schedule',
  publish_allowed: true,
  proof_url: '',
  source_commit_sha: '38d8e5bd40594915407126915177f98c6ef983d9',
  current_intent_hash: 'a'.repeat(64),
  source_context_hash: 'b'.repeat(64),
  evidence_hash: 'c'.repeat(64),
  evidence_count: 3,
  policy_version: PUBLIC_SIGNAL_POLICY_VERSION,
  generated_at: '2026-08-02T21:00:00.000Z',
  invocation_id: invocationId,
  steering_grant_id: FOUNDER_APPROVED_STEERING_GRANT_ID,
  authorization_mode: BUFFER_AUTHORIZATION_MODE,
  batch_id: '66cf315f-e1a0-4aad-9c76-355f1df30b54',
  batch_size: 1,
  batch_index: 1,
  schedule_policy_id: BUFFER_SCHEDULE_POLICY_ID,
  notification_mode: BUFFER_NOTIFICATION_MODE,
  linkedin_rising_floor_ready: true,
  linkedin_baseline_ref: 'linkedin-export:2026-08-02..2026-08-08',
  linkedin_growth_hypothesis: 'Preserve proof-first resonance while testing for stronger distribution and business relevance.',
  linkedin_24h_gate: 'Compare 24-hour reach, engagement quality, and warm conversation conversion to the verified prior floor.',
  linkedin_48h_gate: 'Compare 48-hour impressions, engagement rate, quality comments, and profile or follower conversion.',
  linkedin_next_mutation: 'Carry the winning hook, proof mechanic, format, visual, or conversion behavior into the next post.',
};
baseInput.public_signal_hash = computePublicSignalHash(baseInput);
baseInput.founder_approval_id = `standing-policy:${baseInput.steering_grant_id}:${invocationId}:${baseInput.public_signal_hash.slice(0, 16)}`;

const prepared = validateBufferPublishInput(baseInput, { nowMs });
assert.equal(prepared.buffer_action, contract.zapier.action);
assert.equal(prepared.buffer_method, contract.zapier.requiredMethod);
assert.equal(prepared.buffer_api_sharing_mode, contract.api.required.sharingMode);
assert.equal(prepared.buffer_api_due_at, prepared.scheduled_at);
assert.equal(prepared.buffer_save_to_draft, contract.api.required.saveToDraft);
assert.equal(prepared.destination_mode, 'schedule');
assert.equal(prepared.publish_allowed, true);
assert.equal(prepared.review_window_minutes, contract.reviewWindow.minutes);
assert.equal(prepared.notification_mode, BUFFER_NOTIFICATION_MODE);
assert.equal(prepared.authorization_receipt_verified, false);
assert.equal(prepared.standing_policy_correlation_verified, true);
assert.equal(prepared.public_signal_hash, baseInput.public_signal_hash);
assert.equal(prepared.evidence_hash, baseInput.evidence_hash);
assert.equal(prepared.evidence_count, baseInput.evidence_count);
assert.equal(prepared.proof_url, '');
assert.equal(prepared.linkedin_rising_floor_ready, true);
assert.equal(prepared.linkedin_baseline_ref, baseInput.linkedin_baseline_ref);

for (const destinationMode of contract.zapier.rejectedMethods) {
  assert.throws(
    () => validateBufferPublishInput({ ...baseInput, destination_mode: destinationMode }, { nowMs }),
    /destination_mode must be schedule/,
    `${destinationMode} must fail closed in executable code`,
  );
}

assert.throws(() => validateBufferPublishInput({ ...baseInput, destination_mode: '' }, { nowMs }), /destination_mode must be schedule/);
assert.throws(() => validateBufferPublishInput({ ...baseInput, publish_allowed: false }, { nowMs }), /publish_allowed must be true/);
assert.throws(() => validateBufferPublishInput({ ...baseInput, steering_grant_id: 'caller-owned-policy' }, { nowMs }), /checked-in founder standing policy/);
assert.throws(() => validateBufferPublishInput({ ...baseInput, founder_approval_id: 'standing-policy:wrong:receipt' }, { nowMs }), /context-bound standing-policy correlation receipt/);
assert.throws(() => validateBufferPublishInput({ ...baseInput, public_signal_hash: 'd'.repeat(64) }, { nowMs }), /public_signal_hash does not match/);
assert.throws(() => validateBufferPublishInput({ ...baseInput, current_intent_hash: 'd'.repeat(64) }, { nowMs }), /public_signal_hash does not match/);
assert.throws(() => validateBufferPublishInput({ ...baseInput, evidence_hash: '' }, { nowMs }), /private evidence lineage/);
assert.throws(() => validateBufferPublishInput({ ...baseInput, linkedin_rising_floor_ready: false }, { nowMs }), /linkedin_rising_floor_ready must be true/);

const withPublicProof = {
  ...baseInput,
  proof_url: 'https://github.com/jussray/founder-control-room/pull/429',
};
withPublicProof.public_signal_hash = computePublicSignalHash(withPublicProof);
withPublicProof.founder_approval_id = `standing-policy:${withPublicProof.steering_grant_id}:${invocationId}:${withPublicProof.public_signal_hash.slice(0, 16)}`;
assert.equal(validateBufferPublishInput(withPublicProof, { nowMs }).proof_url, withPublicProof.proof_url);
assert.throws(() => validateBufferPublishInput({ ...baseInput, proof_url: 'http://example.com' }, { nowMs }), /proof_url must be empty or an HTTPS URL/);

const callerOverride = validateBufferPublishInput({
  ...baseInput,
  method: 'share_now',
  buffer_method: 'share_now',
  saveToDraft: true,
  buffer_save_to_draft: true,
  buffer_api_sharing_mode: 'shareNow',
  buffer_api_due_at: '2026-08-02T21:00:31.000Z',
  scheduled_at: '2026-08-02T21:00:31.000Z',
}, { nowMs });
assert.equal(callerOverride.buffer_method, 'schedule');
assert.equal(callerOverride.buffer_api_sharing_mode, 'customScheduled');
assert.equal(callerOverride.buffer_api_due_at, '2026-08-02T21:20:00.000Z');
assert.equal(callerOverride.buffer_save_to_draft, false);
assert.equal(callerOverride.scheduled_at, '2026-08-02T21:20:00.000Z');

console.log('Buffer provider contract verified against executable scheduling code: exact customScheduled/dueAt mapping, optional public proof with mandatory private evidence lineage, context-bound standing-policy correlation without authentication overclaim, LinkedIn rising-floor gates, private review ingress requirements, fail-closed compensation, and no share-now override.');
