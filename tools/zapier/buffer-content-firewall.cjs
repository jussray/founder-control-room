/* globals inputData, output: true */
'use strict';

const MIN_POST_LENGTH = 80;
const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const HTTPS_URL = /^https:\/\//i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUFFER_PROVIDER_ACTION = 'buffer_add_to_queue';
const BUFFER_PROVIDER_METHOD = 'schedule';
const BUFFER_API_SHARING_MODE = 'customScheduled';
const BUFFER_API_SAVE_TO_DRAFT = false;
const BUFFER_REVIEW_WINDOW_MINUTES = 20;
const BUFFER_REVIEW_WINDOW_MS = BUFFER_REVIEW_WINDOW_MINUTES * 60 * 1000;
const MAX_GENERATION_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;
const MAX_STEERING_GRANT_ID_LENGTH = 100;
const MAX_AUTHORIZATION_RECEIPT_LENGTH = 200;
const BUFFER_SCHEDULE_POLICY_ID = 'buffer-20-minute-review-v1';
const BUFFER_AUTHORIZATION_MODE = 'standing-policy';
const BUFFER_NOTIFICATION_MODE = 'gmail_campaign_digest';
const ALLOWED_DESTINATION_MODES = new Set(['schedule']);
const ALLOWED_CONTENT_FIELDS = new Set([
  'linkedin_draft',
  'facebook_founder_draft',
  'facebook_brand_draft',
  'instagram_draft',
  'threads_draft',
  'x_draft',
  'tiktok_caption',
  'youtube_shorts_draft',
  'pinterest_draft',
  'bluesky_draft',
  'mastodon_draft',
  'google_business_draft',
]);
const FORBIDDEN_CONTENT_FIELDS = new Set([
  'prompt',
  'system_prompt',
  'user_prompt',
  'user_message',
  'instructions',
  'raw_response',
  'input',
  'github_evidence',
]);
const PROMPT_LEAK_PATTERNS = [
  /\byou are writing for\b/i,
  /\byou are the (analysis|content|social|copy) worker\b/i,
  /\breturn (exactly )?(one )?(valid )?json\b/i,
  /\breturn this structure\b/i,
  /\bbefore writing anything\b/i,
  /\bcreate (a|the|three) (concise|platform-specific|linkedin|facebook|instagram|social)/i,
  /\bsystem instruction\s*:/i,
  /\buser message\s*:/i,
  /\binstructions?\s*:/i,
  /\bgithub evidence\s*:/i,
  /\{\{[^}]+\}\}/,
];

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asBoolean(value) {
  return value === true || value === 'true';
}

function asInteger(value) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseIsoTimestamp(value) {
  const text = asTrimmedString(value);
  const timestamp = Date.parse(text);
  return text && Number.isFinite(timestamp) ? timestamp : null;
}

function validateBufferPublishInput(input = {}, options = {}) {
  const postText = asTrimmedString(input.post_text);
  const contentField = asTrimmedString(input.content_field);
  const destinationMode = asTrimmedString(input.destination_mode).toLowerCase();
  const proofUrl = asTrimmedString(input.proof_url);
  const sourceCommitSha = asTrimmedString(input.source_commit_sha);
  const publishAllowed = asBoolean(input.publish_allowed);
  const channel = asTrimmedString(input.channel);
  const batchId = asTrimmedString(input.batch_id);
  const batchSize = asInteger(input.batch_size);
  const batchIndex = asInteger(input.batch_index);
  const invocationId = asTrimmedString(input.invocation_id);
  const steeringGrantId = asTrimmedString(input.steering_grant_id);
  const founderApprovalId = asTrimmedString(input.founder_approval_id);
  const authorizationMode = asTrimmedString(input.authorization_mode);
  const schedulePolicyId = asTrimmedString(input.schedule_policy_id);
  const notificationMode = asTrimmedString(input.notification_mode);
  const generatedAtMs = parseIsoTimestamp(input.generated_at);
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();

  const errors = [];

  if (!ALLOWED_CONTENT_FIELDS.has(contentField)) {
    if (FORBIDDEN_CONTENT_FIELDS.has(contentField)) {
      errors.push(`content_field ${contentField} is instruction input, not publishable copy`);
    } else {
      errors.push(`content_field ${contentField || '<empty>'} is not an approved social output field`);
    }
  }

  if (!channel) errors.push('channel is required');

  if (!ALLOWED_DESTINATION_MODES.has(destinationMode)) {
    errors.push('destination_mode must be schedule under the 20-minute review-window contract');
  }

  if (!publishAllowed) {
    errors.push('publish_allowed must be true for the approved schedule-with-review-window contract');
  }

  if (!UUID.test(invocationId)) errors.push('invocation_id must be a UUID');
  if (!steeringGrantId || steeringGrantId.length > MAX_STEERING_GRANT_ID_LENGTH) {
    errors.push(`steering_grant_id is required and must not exceed ${MAX_STEERING_GRANT_ID_LENGTH} characters`);
  }
  if (founderApprovalId.length > MAX_AUTHORIZATION_RECEIPT_LENGTH) {
    errors.push(`founder_approval_id must not exceed ${MAX_AUTHORIZATION_RECEIPT_LENGTH} characters`);
  }
  if (authorizationMode !== BUFFER_AUTHORIZATION_MODE) {
    errors.push('authorization_mode must be standing-policy');
  }
  const expectedApprovalId = steeringGrantId && invocationId
    ? `standing-policy:${steeringGrantId}:${invocationId}`
    : null;
  if (
    !expectedApprovalId ||
    expectedApprovalId.length > MAX_AUTHORIZATION_RECEIPT_LENGTH ||
    founderApprovalId !== expectedApprovalId
  ) {
    errors.push('founder_approval_id must be the runtime-minted receipt for this grant and invocation');
  }
  if (schedulePolicyId !== BUFFER_SCHEDULE_POLICY_ID) {
    errors.push('schedule_policy_id does not match the checked-in scheduling contract');
  }

  if (notificationMode !== BUFFER_NOTIFICATION_MODE) {
    errors.push('notification_mode must be gmail_campaign_digest');
  }

  if (!UUID.test(batchId)) errors.push('batch_id must be a UUID');
  if (batchSize === null || batchSize < 1 || batchSize > 3) {
    errors.push('batch_size must be an integer from 1 through 3');
  }
  if (batchIndex === null || batchIndex < 1 || batchSize === null || batchIndex > batchSize) {
    errors.push('batch_index must identify one item inside the declared batch_size');
  }

  if (postText.length < MIN_POST_LENGTH) {
    errors.push(`post_text must contain at least ${MIN_POST_LENGTH} characters of finished copy`);
  }

  const promptLeak = PROMPT_LEAK_PATTERNS.find((pattern) => pattern.test(postText));
  if (promptLeak) {
    errors.push('post_text resembles instructions, a prompt template, or unresolved automation input');
  }

  if (!HTTPS_URL.test(proofUrl)) {
    errors.push('proof_url must be an HTTPS URL');
  }

  if (!EXACT_COMMIT_SHA.test(sourceCommitSha)) {
    errors.push('source_commit_sha must be an exact 40-character commit SHA');
  }

  if (generatedAtMs === null) {
    errors.push('generated_at must be a valid ISO timestamp');
  } else {
    const generationAgeMs = nowMs - generatedAtMs;
    if (generationAgeMs > MAX_GENERATION_AGE_MS) {
      errors.push('generated_at is too stale to preserve a meaningful review window');
    }
    if (generationAgeMs < -MAX_CLOCK_SKEW_MS) {
      errors.push('generated_at is too far in the future');
    }
  }

  if (errors.length > 0) {
    const error = new Error(`FOUNDER_SIGNAL_CONTENT_REJECTED: ${errors.join('; ')}`);
    error.code = 'FOUNDER_SIGNAL_CONTENT_REJECTED';
    error.details = errors;
    throw error;
  }

  const scheduledAtMs = generatedAtMs + BUFFER_REVIEW_WINDOW_MS;
  if (scheduledAtMs <= nowMs) {
    const error = new Error('FOUNDER_SIGNAL_CONTENT_REJECTED: scheduled_at must remain in the future');
    error.code = 'FOUNDER_SIGNAL_CONTENT_REJECTED';
    error.details = ['scheduled_at must remain in the future'];
    throw error;
  }
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
    steering_grant_id: steeringGrantId,
    authorization_mode: BUFFER_AUTHORIZATION_MODE,
    authorization_receipt_verified: true,
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
  };
}

if (typeof inputData !== 'undefined') {
  output = validateBufferPublishInput(inputData);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateBufferPublishInput,
    BUFFER_PROVIDER_ACTION,
    BUFFER_PROVIDER_METHOD,
    BUFFER_API_SHARING_MODE,
    BUFFER_API_SAVE_TO_DRAFT,
    BUFFER_REVIEW_WINDOW_MINUTES,
    BUFFER_SCHEDULE_POLICY_ID,
    BUFFER_AUTHORIZATION_MODE,
    BUFFER_NOTIFICATION_MODE,
    MAX_STEERING_GRANT_ID_LENGTH,
    MAX_AUTHORIZATION_RECEIPT_LENGTH,
    ALLOWED_CONTENT_FIELDS,
    FORBIDDEN_CONTENT_FIELDS,
    PROMPT_LEAK_PATTERNS,
  };
}
