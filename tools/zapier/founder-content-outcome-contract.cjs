'use strict';

const { createHash, createHmac } = require('node:crypto');

const HASH = /^[0-9a-f]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const KEY_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const PROVIDER_STATES = new Set(['unknown', 'draft', 'scheduled', 'published', 'failed']);
const METRIC_KEYS = Object.freeze([
  'impressions',
  'reactions',
  'comments',
  'profile_views',
  'attributed_visits',
  'qualified_conversations',
  'attributed_contacts',
  'attributed_deals',
]);
const FORBIDDEN_FIELDS = Object.freeze([
  'raw_post_text',
  'dm_text',
  'comment_text',
  'provider_payload',
  'customer_data',
  'private_notes',
]);
const FCR_LEARNING_TRANSPORT_CONTRACT = 'juss-v10/fcr-founder-content-learning-http@v1';
const FCR_LEARNING_ROUTE = '/api/chief/founder-content-learning';

function asString(value, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function reject(errors) {
  const error = new Error(`FOUNDER_CONTENT_OUTCOME_REJECTED: ${errors.join('; ')}`);
  error.code = 'FOUNDER_CONTENT_OUTCOME_REJECTED';
  error.details = errors;
  throw error;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function buildFounderContentOutcomeObservation(input = {}) {
  const errors = [];
  const contentId = asString(input.content_id, 64);
  const authorizationHash = asString(input.authorization_hash, 64).toLowerCase();
  const publicPayloadHash = asString(input.public_payload_hash, 64).toLowerCase();
  const platform = asString(input.platform, 80).toLowerCase();
  const provider = asString(input.provider, 80).toLowerCase();
  const providerState = asString(input.provider_state, 40).toLowerCase() || 'unknown';
  const providerReceiptId = asString(input.provider_receipt_id, 240) || null;
  const observedAt = asString(input.observed_at, 64);

  if (!UUID.test(contentId)) errors.push('content_id must be a UUID');
  if (!HASH.test(authorizationHash)) errors.push('authorization_hash must be SHA-256');
  if (!HASH.test(publicPayloadHash)) errors.push('public_payload_hash must be SHA-256');
  if (!platform) errors.push('platform is required');
  if (!provider) errors.push('provider is required');
  if (!PROVIDER_STATES.has(providerState)) errors.push('provider_state is invalid');
  if (!ISO_DATE.test(observedAt) || Number.isNaN(Date.parse(observedAt))) errors.push('observed_at must be ISO UTC');
  if (providerState === 'published' && !providerReceiptId) {
    errors.push('provider_receipt_id is required before provider_state may be published');
  }

  for (const field of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      errors.push(`${field} is forbidden in founder-content outcome observations`);
    }
  }

  const metrics = {};
  const metricStates = {};
  for (const key of METRIC_KEYS) {
    const value = input.metrics?.[key];
    if (value === undefined || value === null) {
      metrics[key] = null;
      metricStates[key] = 'UNKNOWN';
      continue;
    }
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`metrics.${key} must be a non-negative integer or null`);
      continue;
    }
    metrics[key] = value;
    metricStates[key] = 'observed';
  }

  if (errors.length > 0) reject(errors);

  const identity = {
    version: 1,
    content_id: contentId,
    authorization_hash: authorizationHash,
    public_payload_hash: publicPayloadHash,
    platform,
    provider,
    provider_state: providerState,
    provider_receipt_id: providerReceiptId,
    observed_at: observedAt,
    metrics,
    metric_states: metricStates,
  };

  return Object.freeze({
    version: 1,
    kind: 'fcr/founder-content-outcome-observation',
    ...identity,
    observation_hash: hash(identity),
    authority: Object.freeze({
      observation_only: true,
      learning_authority: 'advisory_only',
      can_authorize_publish: false,
      can_change_content: false,
      can_increase_authority: false,
      missing_metrics_are_unknown: true,
    }),
    privacy: Object.freeze({
      raw_post_text_stored: false,
      private_messages_stored: false,
      raw_comments_stored: false,
      provider_payload_stored: false,
      customer_private_data_stored: false,
    }),
  });
}

function validateFounderContentOutcomeObservation(observation) {
  const input = record(observation);
  if (!input) reject(['observation must be an object']);

  const authority = record(input.authority);
  const privacy = record(input.privacy);
  const identity = {
    version: input.version,
    content_id: input.content_id,
    authorization_hash: input.authorization_hash,
    public_payload_hash: input.public_payload_hash,
    platform: input.platform,
    provider: input.provider,
    provider_state: input.provider_state,
    provider_receipt_id: input.provider_receipt_id,
    observed_at: input.observed_at,
    metrics: input.metrics,
    metric_states: input.metric_states,
  };
  const errors = [];

  if (input.kind !== 'fcr/founder-content-outcome-observation') errors.push('unsupported outcome observation kind');
  if (!HASH.test(asString(input.observation_hash, 64))) errors.push('observation_hash must be SHA-256');
  else if (hash(identity) !== String(input.observation_hash).toLowerCase()) {
    errors.push('observation_hash does not match outcome identity');
  }
  if (!authority
      || authority.observation_only !== true
      || authority.learning_authority !== 'advisory_only'
      || authority.can_authorize_publish !== false
      || authority.can_change_content !== false
      || authority.can_increase_authority !== false
      || authority.missing_metrics_are_unknown !== true) {
    errors.push('observation authority must remain advisory-only and non-authorizing');
  }
  if (!privacy
      || privacy.raw_post_text_stored !== false
      || privacy.private_messages_stored !== false
      || privacy.raw_comments_stored !== false
      || privacy.provider_payload_stored !== false
      || privacy.customer_private_data_stored !== false) {
    errors.push('observation privacy boundary is invalid');
  }

  if (errors.length > 0) reject(errors);
  return input;
}

function buildFounderContentLearningRequest(observation, options = {}) {
  const validated = validateFounderContentOutcomeObservation(observation);
  const secret = asString(options.secret, 4096);
  const keyId = asString(options.key_id, 160);
  const issuedAt = asString(options.issued_at, 64) || new Date().toISOString();
  const errors = [];

  if (secret.length < 16) errors.push('learning transport secret must be at least 16 characters');
  if (!KEY_ID.test(keyId)) errors.push('learning transport key_id is invalid');
  if (!ISO_DATE.test(issuedAt) || Number.isNaN(Date.parse(issuedAt))) {
    errors.push('learning transport issued_at must be ISO UTC');
  }
  if (errors.length > 0) reject(errors);

  const body = JSON.stringify(validated);
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const signatureInput = [FCR_LEARNING_TRANSPORT_CONTRACT, keyId, issuedAt, bodyHash].join('\n');
  const signature = createHmac('sha256', secret).update(signatureInput).digest('hex');

  return Object.freeze({
    contract: FCR_LEARNING_TRANSPORT_CONTRACT,
    method: 'POST',
    path: FCR_LEARNING_ROUTE,
    headers: Object.freeze({
      'Content-Type': 'application/json; charset=utf-8',
      'X-FCR-Learning-Key-Id': keyId,
      'X-FCR-Learning-Issued-At': issuedAt,
      'X-FCR-Learning-Signature': signature,
    }),
    body,
    body_hash: bodyHash,
    authority: Object.freeze({
      source_authentication_only: true,
      learning_authority: 'advisory_only',
      can_authorize_publish: false,
      can_execute: false,
      can_increase_authority: false,
    }),
    privacy: Object.freeze({
      secret_returned: false,
      raw_post_text_returned: false,
      provider_payload_returned: false,
      customer_private_data_returned: false,
    }),
  });
}

module.exports = {
  buildFounderContentOutcomeObservation,
  buildFounderContentLearningRequest,
  FCR_LEARNING_ROUTE,
  FCR_LEARNING_TRANSPORT_CONTRACT,
  METRIC_KEYS,
};
