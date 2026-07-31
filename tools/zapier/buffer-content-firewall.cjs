'use strict';

const MIN_POST_LENGTH = 80;
const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const HTTPS_URL = /^https:\/\//i;
const ALLOWED_DESTINATION_MODES = new Set(['draft', 'queue', 'publish']);
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

function validateBufferPublishInput(input = {}) {
  const postText = asTrimmedString(input.post_text);
  const contentField = asTrimmedString(input.content_field);
  const destinationMode = asTrimmedString(input.destination_mode).toLowerCase();
  const proofUrl = asTrimmedString(input.proof_url);
  const sourceCommitSha = asTrimmedString(input.source_commit_sha);
  const founderApprovalId = asTrimmedString(input.founder_approval_id);
  const publishAllowed = asBoolean(input.publish_allowed);
  const channel = asTrimmedString(input.channel);

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
    errors.push('destination_mode must be draft, queue, or publish');
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

  if ((destinationMode === 'queue' || destinationMode === 'publish') &&
      (!publishAllowed || !founderApprovalId)) {
    errors.push('queue or publish mode requires publish_allowed=true and founder_approval_id');
  }

  if (errors.length > 0) {
    const error = new Error(`FOUNDER_SIGNAL_CONTENT_REJECTED: ${errors.join('; ')}`);
    error.code = 'FOUNDER_SIGNAL_CONTENT_REJECTED';
    error.details = errors;
    throw error;
  }

  return {
    validated_post_text: postText,
    content_validated: true,
    content_field: contentField,
    channel,
    destination_mode: destinationMode,
    proof_url: proofUrl,
    source_commit_sha: sourceCommitSha,
    founder_approval_id: founderApprovalId || null,
  };
}

if (typeof inputData !== 'undefined') {
  output = validateBufferPublishInput(inputData);
}

module.exports = {
  validateBufferPublishInput,
  ALLOWED_CONTENT_FIELDS,
  FORBIDDEN_CONTENT_FIELDS,
  PROMPT_LEAK_PATTERNS,
};
