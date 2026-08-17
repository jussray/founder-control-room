/* globals inputData, output: true */
'use strict';

const {
  ALLOWED_CONTENT_FIELDS,
  FORBIDDEN_CONTENT_FIELDS,
  PROMPT_LEAK_PATTERNS,
  validateLinkedInRisingFloor,
  BUFFER_PROVIDER_ACTION,
  BUFFER_PROVIDER_METHOD,
  BUFFER_API_SHARING_MODE,
  BUFFER_API_SAVE_TO_DRAFT,
  BUFFER_REVIEW_WINDOW_MINUTES,
  BUFFER_SCHEDULE_POLICY_ID,
  BUFFER_NOTIFICATION_MODE,
  LINKEDIN_CHANNEL,
} = require('./buffer-content-firewall.cjs');

const MIN_POST_LENGTH = 80;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const HTTPS_URL = /^https:\/\//i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_GENERATION_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;
const REVIEW_WINDOW_MS = BUFFER_REVIEW_WINDOW_MINUTES * 60 * 1000;
const AUTHORIZATION_MODE = 'exact-current-you';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function bool(value) {
  return value === true || value === 'true';
}

function integer(value) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function timestamp(value) {
  const raw = text(value);
  const ms = Date.parse(raw);
  return raw && Number.isFinite(ms) ? ms : null;
}

function reject(errors) {
  const error = new Error(`FIRST_PARTY_FOUNDER_CONTENT_REJECTED: ${errors.join('; ')}`);
  error.code = 'FIRST_PARTY_FOUNDER_CONTENT_REJECTED';
  error.details = errors;
  throw error;
}

function validateFirstPartyFounderBufferInput(input = {}, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const postText = text(input.post_text);
  const contentField = text(input.content_field);
  const channel = text(input.channel).toLowerCase();
  const proofUrl = text(input.proof_url);
  const sourceCommitSha = text(input.source_commit_sha).toLowerCase();
  const authorizationHash = text(input.founder_content_authorization_hash).toLowerCase();
  const executionId = text(input.founder_content_execution_id).toLowerCase();
  const founderApprovalId = text(input.founder_approval_id);
  const currentIntentId = text(input.current_you_intent_id);
  const currentIntentVersion = integer(input.current_you_intent_version);
  const currentObservedAt = timestamp(input.current_you_observed_at);
  const generatedAtMs = timestamp(input.generated_at);
  const invocationId = text(input.invocation_id).toLowerCase();
  const batchId = text(input.batch_id).toLowerCase();
  const batchSize = integer(input.batch_size);
  const batchIndex = integer(input.batch_index);
  const errors = [];

  if (!ALLOWED_CONTENT_FIELDS.has(contentField)) {
    errors.push(FORBIDDEN_CONTENT_FIELDS.has(contentField)
      ? `content_field ${contentField} is instruction input, not publishable copy`
      : `content_field ${contentField || '<empty>'} is not approved`);
  }
  if (!channel) errors.push('channel is required');
  if (input.authorization_mode !== AUTHORIZATION_MODE) errors.push('authorization_mode must be exact-current-you');
  if (!SHA256.test(authorizationHash)) errors.push('founder_content_authorization_hash must be sha256');
  if (!UUID.test(executionId)) errors.push('founder_content_execution_id must be an FCR execution UUID');
  if (founderApprovalId !== `current-you:${authorizationHash}`) {
    errors.push('founder_approval_id must bind the exact FCR founder-content authorization hash');
  }
  if (!currentIntentId || currentIntentVersion === null || currentIntentVersion < 1 || currentObservedAt === null) {
    errors.push('Current You identity, version, and observation timestamp are required');
  }
  if (!bool(input.publish_allowed)) errors.push('publish_allowed must be true');
  if (text(input.destination_mode) !== 'schedule') errors.push('destination_mode must be schedule');
  if (text(input.schedule_policy_id) !== BUFFER_SCHEDULE_POLICY_ID) errors.push('schedule_policy_id mismatch');
  if (text(input.notification_mode) !== BUFFER_NOTIFICATION_MODE) errors.push('notification_mode mismatch');
  if (!UUID.test(invocationId) || !UUID.test(batchId)) errors.push('invocation_id and batch_id must be UUIDs');
  if (batchSize === null || batchSize < 1 || batchSize > 3) errors.push('batch_size must be 1 through 3');
  if (batchIndex === null || batchSize === null || batchIndex < 1 || batchIndex > batchSize) {
    errors.push('batch_index must identify an item inside batch_size');
  }
  if (!HTTPS_URL.test(proofUrl)) errors.push('proof_url must be HTTPS');
  if (!COMMIT_SHA.test(sourceCommitSha)) errors.push('source_commit_sha must be exact');
  if (postText.length < MIN_POST_LENGTH) errors.push(`post_text must contain at least ${MIN_POST_LENGTH} characters`);
  if (PROMPT_LEAK_PATTERNS.some(pattern => pattern.test(postText))) {
    errors.push('post_text resembles instructions or unresolved automation input');
  }

  let linkedinStrategy = null;
  if (channel === LINKEDIN_CHANNEL) {
    if (contentField !== 'linkedin_draft') errors.push('juss_rayy_linkedin must use linkedin_draft');
    linkedinStrategy = validateLinkedInRisingFloor(input, errors);
  }

  if (generatedAtMs === null) {
    errors.push('generated_at must be a valid timestamp');
  } else {
    const age = nowMs - generatedAtMs;
    if (age > MAX_GENERATION_AGE_MS) errors.push('generated_at is too stale');
    if (age < -MAX_CLOCK_SKEW_MS) errors.push('generated_at is too far in the future');
  }
  if (currentObservedAt !== null && currentObservedAt > nowMs + MAX_CLOCK_SKEW_MS) {
    errors.push('current_you_observed_at is too far in the future');
  }
  if (bool(input.share_now_allowed)) errors.push('share_now_allowed must remain false');
  if (text(input.buffer_method) !== BUFFER_PROVIDER_METHOD) errors.push('buffer_method must be schedule');
  if (bool(input.buffer_save_to_draft) !== BUFFER_API_SAVE_TO_DRAFT) errors.push('buffer_save_to_draft must be false');
  if (text(input.buffer_api_sharing_mode) !== BUFFER_API_SHARING_MODE) errors.push('buffer_api_sharing_mode mismatch');

  if (errors.length) reject(errors);

  const scheduledAtMs = generatedAtMs + REVIEW_WINDOW_MS;
  if (scheduledAtMs <= nowMs) reject(['scheduled_at must remain in the future']);
  const scheduledAt = new Date(scheduledAtMs).toISOString();

  return {
    validated_post_text: postText,
    content_validated: true,
    content_field: contentField,
    channel,
    destination_mode: 'schedule',
    publish_allowed: true,
    proof_url: proofUrl,
    source_commit_sha: sourceCommitSha,
    invocation_id: invocationId,
    authorization_mode: AUTHORIZATION_MODE,
    authorization_receipt_verified: true,
    founder_content_authorization_hash: authorizationHash,
    founder_content_execution_id: executionId,
    current_you_intent_id: currentIntentId,
    current_you_intent_version: currentIntentVersion,
    schedule_policy_id: BUFFER_SCHEDULE_POLICY_ID,
    batch_id: batchId,
    batch_size: batchSize,
    batch_index: batchIndex,
    generated_at: new Date(generatedAtMs).toISOString(),
    scheduled_at: scheduledAt,
    review_deadline: scheduledAt,
    review_window_minutes: BUFFER_REVIEW_WINDOW_MINUTES,
    review_state: 'pending_notification',
    notification_mode: BUFFER_NOTIFICATION_MODE,
    notification_required: true,
    notification_failure_policy: 'cancel_scheduled_batch',
    buffer_action: BUFFER_PROVIDER_ACTION,
    buffer_method: BUFFER_PROVIDER_METHOD,
    buffer_save_to_draft: BUFFER_API_SAVE_TO_DRAFT,
    buffer_api_sharing_mode: BUFFER_API_SHARING_MODE,
    buffer_api_due_at: scheduledAt,
    share_now_allowed: false,
    ...(linkedinStrategy ?? {}),
  };
}

if (typeof inputData !== 'undefined') {
  output = validateFirstPartyFounderBufferInput(inputData);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateFirstPartyFounderBufferInput,
    AUTHORIZATION_MODE,
  };
}
