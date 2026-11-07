/* globals inputData, output: true */
'use strict';

const MIN_POST_LENGTH = 80;
const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const HTTPS_URL = /^https:\/\//i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUFFER_PROVIDER_ACTION = 'buffer_add_to_queue';
const BUFFER_PROVIDER_METHOD = 'draft';
const BUFFER_API_SHARING_MODE = 'addToQueue';
const BUFFER_API_SAVE_TO_DRAFT = true;
const BUFFER_REVIEW_WINDOW_MINUTES = 0;
const MAX_GENERATION_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;
const MAX_STEERING_GRANT_ID_LENGTH = 100;
const MAX_AUTHORIZATION_RECEIPT_LENGTH = 200;
const BUFFER_SCHEDULE_POLICY_ID = 'buffer-draft-review-v1';
const BUFFER_AUTHORIZATION_MODE = 'standing-policy';
const BUFFER_NOTIFICATION_MODE = 'gmail_campaign_digest';
const LINKEDIN_CHANNEL = 'juss_rayy_linkedin';
const LINKEDIN_MIN_STRATEGY_TEXT = 20;
const LINKEDIN_UNKNOWN_BASELINE_VALUES = new Set(['unknown', 'none', 'n/a', 'na', 'unverified']);
const ALLOWED_DESTINATION_MODES = new Set(['draft']);
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

function isExplicitFalse(value) {
  return value === false || value === 'false';
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

function validateLinkedInRisingFloor(input, errors) {
  const linkedinRisingFloorReady = asBoolean(input.linkedin_rising_floor_ready);
  const linkedinBaselineRef = asTrimmedString(input.linkedin_baseline_ref);
  const linkedinGrowthHypothesis = asTrimmedString(input.linkedin_growth_hypothesis);
  const linkedin24hGate = asTrimmedString(input.linkedin_24h_gate);
  const linkedin48hGate = asTrimmedString(input.linkedin_48h_gate);
  const linkedinNextMutation = asTrimmedString(input.linkedin_next_mutation);

  if (!linkedinRisingFloorReady) {
    errors.push('linkedin_rising_floor_ready must be true before LinkedIn can enter Buffer drafts');
  }

  if (
    !linkedinBaselineRef ||
    LINKEDIN_UNKNOWN_BASELINE_VALUES.has(linkedinBaselineRef.toLowerCase())
  ) {
    errors.push('linkedin_baseline_ref must name the latest verified LinkedIn analytics or platform-recap baseline');
  }

  const strategyFields = [
    ['linkedin_growth_hypothesis', linkedinGrowthHypothesis],
    ['linkedin_24h_gate', linkedin24hGate],
    ['linkedin_48h_gate', linkedin48hGate],
    ['linkedin_next_mutation', linkedinNextMutation],
  ];

  for (const [name, value] of strategyFields) {
    if (value.length < LINKEDIN_MIN_STRATEGY_TEXT) {
      errors.push(`${name} must contain at least ${LINKEDIN_MIN_STRATEGY_TEXT} characters of finished strategy`);
    }
  }

  return {
    linkedin_rising_floor_ready: linkedinRisingFloorReady,
    linkedin_baseline_ref: linkedinBaselineRef,
    linkedin_growth_hypothesis: linkedinGrowthHypothesis,
    linkedin_24h_gate: linkedin24hGate,
    linkedin_48h_gate: linkedin48hGate,
    linkedin_next_mutation: linkedinNextMutation,
  };
}

function validateBufferProviderActionContract({ action, method } = {}) {
  const normalizedAction = asTrimmedString(action);
  const normalizedMethod = asTrimmedString(method).toLowerCase();
  const errors = [];

  if (normalizedAction !== BUFFER_PROVIDER_ACTION) {
    errors.push(`action must be ${BUFFER_PROVIDER_ACTION}`);
  }
  if (normalizedMethod !== BUFFER_PROVIDER_METHOD) {
    errors.push('method must be draft; never rely on the Buffer default');
  }

  if (errors.length > 0) {
    const error = new Error(`BUFFER_PROVIDER_CONTRACT_REJECTED: ${errors.join('; ')}`);
    error.code = 'BUFFER_PROVIDER_CONTRACT_REJECTED';
    error.details = errors;
    throw error;
  }

  return {
    buffer_action: BUFFER_PROVIDER_ACTION,
    buffer_method: BUFFER_PROVIDER_METHOD,
  };
}

function validateBufferPublishInput(input = {}, options = {}) {
  const postText = asTrimmedString(input.post_text);
  const contentField = asTrimmedString(input.content_field);
  const destinationMode = asTrimmedString(input.destination_mode).toLowerCase();
  const proofUrl = asTrimmedString(input.proof_url);
  const sourceCommitSha = asTrimmedString(input.source_commit_sha);
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

  let linkedinStrategy = null;
  if (channel === LINKEDIN_CHANNEL) {
    if (contentField !== 'linkedin_draft') {
      errors.push('juss_rayy_linkedin must use only linkedin_draft');
    }
    linkedinStrategy = validateLinkedInRisingFloor(input, errors);
  }

  if (!ALLOWED_DESTINATION_MODES.has(destinationMode)) {
    errors.push('destination_mode must be draft under the review-only contract');
  }

  if (!isExplicitFalse(input.publish_allowed)) {
    errors.push('publish_allowed must be explicitly false in draft-only mode');
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
    errors.push('schedule_policy_id does not match the checked-in draft-review contract');
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
      errors.push('generated_at is too stale for a fresh draft handoff');
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

  const provider = validateBufferProviderActionContract({
    action: BUFFER_PROVIDER_ACTION,
    method: BUFFER_PROVIDER_METHOD,
  });

  return {
    validated_post_text: postText,
    content_validated: true,
    content_field: contentField,
    channel,
    destination_mode: 'draft',
    publish_allowed: false,
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
    scheduled_at: null,
    review_deadline: null,
    review_window_minutes: BUFFER_REVIEW_WINDOW_MINUTES,
    review_state: 'draft_pending_founder_review',
    notification_mode: BUFFER_NOTIFICATION_MODE,
    notification_required: false,
    notification_failure_policy: 'retain_draft',
    ...provider,
    buffer_save_to_draft: BUFFER_API_SAVE_TO_DRAFT,
    buffer_api_sharing_mode: BUFFER_API_SHARING_MODE,
    buffer_api_due_at: null,
    share_now_allowed: false,
    ...(linkedinStrategy ?? {}),
  };
}

if (typeof inputData !== 'undefined') {
  output = validateBufferPublishInput(inputData);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateBufferPublishInput,
    validateBufferProviderActionContract,
    validateLinkedInRisingFloor,
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
    ALLOWED_CONTENT_FIELDS,
    FORBIDDEN_CONTENT_FIELDS,
    PROMPT_LEAK_PATTERNS,
  };
}
