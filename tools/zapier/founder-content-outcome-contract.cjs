'use strict';

const { createHash } = require('node:crypto');

const HASH = /^[0-9a-f]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
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

function asString(value, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
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

module.exports = {
  buildFounderContentOutcomeObservation,
  METRIC_KEYS,
};
