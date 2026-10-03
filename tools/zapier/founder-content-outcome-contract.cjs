'use strict';

const { createHash, createHmac } = require('node:crypto');

const HASH = /^[0-9a-f]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const KEY_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const SUBJECT_ID = /^[A-Za-z0-9._:/-]{1,160}$/;
const PROVIDER_STATES = new Set(['unknown', 'draft', 'scheduled', 'published', 'failed']);
const TARGET_SCOPES = new Set(['portfolio', 'product']);
const TARGET_AUDIENCES = new Set(['investor', 'product_user']);
const SOURCE_ACCOUNT_TYPES = new Set([
  'personal_profile',
  'brand_page',
  'business_account',
  'creator_account',
  'channel',
  'unknown',
]);
const COVERAGE_STATES = new Set(['observed', 'UNKNOWN', 'OUT_OF_SCOPE']);
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
const COMMON_TARGET_METRIC_KEYS = Object.freeze([
  'proof_link_clicks',
]);
const PRODUCT_USER_TARGET_METRIC_KEYS = Object.freeze([
  'signups',
  'activations',
  'core_actions',
  'returning_users',
  'referrals',
  'paid_conversions',
]);
const INVESTOR_TARGET_METRIC_KEYS = Object.freeze([
  'qualified_investor_connections',
  'investor_conversations',
  'investor_introductions',
  'investor_meetings',
]);
const TARGET_METRIC_KEYS = Object.freeze([
  ...COMMON_TARGET_METRIC_KEYS,
  ...PRODUCT_USER_TARGET_METRIC_KEYS,
  ...INVESTOR_TARGET_METRIC_KEYS,
]);
const MEASUREMENT_SOURCE_ROLES = Object.freeze({
  github_proof: 'github',
  metricool_performance: 'metricool',
  exa_external: 'exa',
});
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

function normalizeEvidenceRefs(value, label, errors) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array of evidence references`);
    return [];
  }
  if (value.length > 20) {
    errors.push(`${label} may contain at most 20 evidence references`);
  }
  const refs = [];
  for (const raw of value.slice(0, 20)) {
    const ref = asString(raw, 240);
    if (!ref) {
      errors.push(`${label} contains an invalid evidence reference`);
      continue;
    }
    if (!refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

function allowedTargetMetrics(audience) {
  return new Set([
    ...COMMON_TARGET_METRIC_KEYS,
    ...(audience === 'product_user'
      ? PRODUCT_USER_TARGET_METRIC_KEYS
      : INVESTOR_TARGET_METRIC_KEYS),
  ]);
}

function normalizeCoverageState(value) {
  const raw = asString(value, 40);
  if (!raw) return 'UNKNOWN';
  if (raw.toLowerCase() === 'observed') return 'observed';
  return raw.toUpperCase();
}

function buildSourceAccount(input, errors) {
  const source = record(input.source_account);
  if (!source) return null;

  const network = asString(source.network, 80).toLowerCase();
  const lane = asString(source.lane, 160).toLowerCase();
  const accountType = asString(source.account_type, 80).toLowerCase();
  const accountId = asString(source.account_id, 160);
  const connectorAccountType = asString(source.connector_account_type, 80).toLowerCase() || null;
  const connectorAccountId = asString(source.connector_account_id, 160) || null;
  const coverageState = normalizeCoverageState(source.coverage_state);

  if (!network) errors.push('source_account.network is required');
  if (!lane || (network && !lane.startsWith(`${network}.`))) {
    errors.push('source_account.lane must be network-scoped, for example facebook.creator');
  }
  if (!SOURCE_ACCOUNT_TYPES.has(accountType)) {
    errors.push('source_account.account_type is invalid');
  }
  if (!SUBJECT_ID.test(accountId)) errors.push('source_account.account_id is invalid');
  if ((connectorAccountType && !connectorAccountId) || (!connectorAccountType && connectorAccountId)) {
    errors.push('source_account connector_account_type and connector_account_id must be provided together');
  }
  if (connectorAccountType && !SOURCE_ACCOUNT_TYPES.has(connectorAccountType)) {
    errors.push('source_account.connector_account_type is invalid');
  }
  if (connectorAccountId && !SUBJECT_ID.test(connectorAccountId)) {
    errors.push('source_account.connector_account_id is invalid');
  }
  if (!COVERAGE_STATES.has(coverageState)) {
    errors.push('source_account.coverage_state must be observed, UNKNOWN, or OUT_OF_SCOPE');
  }

  return Object.freeze({
    network,
    lane,
    account_type: accountType,
    account_id: accountId,
    connector_account_type: connectorAccountType,
    connector_account_id: connectorAccountId,
    coverage_state: coverageState,
  });
}

function buildTargetExtension(input, errors) {
  const target = record(input.target);
  const hasTargetMetrics = input.target_metrics !== undefined && input.target_metrics !== null;
  const hasMeasurementSources = input.measurement_sources !== undefined && input.measurement_sources !== null;

  if (!target) {
    if (hasTargetMetrics || hasMeasurementSources) {
      errors.push('target is required when target_metrics or measurement_sources are provided');
    }
    return null;
  }

  const scope = asString(target.scope, 40).toLowerCase();
  const subjectId = asString(target.subject_id, 160);
  const audience = asString(target.audience, 40).toLowerCase();
  const campaignId = asString(target.campaign_id, 160) || null;

  if (!TARGET_SCOPES.has(scope)) errors.push('target.scope must be portfolio or product');
  if (!SUBJECT_ID.test(subjectId)) errors.push('target.subject_id is invalid');
  if (!TARGET_AUDIENCES.has(audience)) errors.push('target.audience must be investor or product_user');
  if (audience === 'product_user' && scope !== 'product') {
    errors.push('product_user observations must bind to target.scope=product');
  }

  const rawTargetMetrics = record(input.target_metrics) || {};
  for (const key of Object.keys(rawTargetMetrics)) {
    if (!TARGET_METRIC_KEYS.includes(key)) errors.push(`target_metrics.${key} is unsupported`);
  }

  const permitted = allowedTargetMetrics(audience);
  const targetMetrics = {};
  const targetMetricStates = {};
  for (const key of TARGET_METRIC_KEYS) {
    const value = rawTargetMetrics[key];
    if (value !== undefined && value !== null && !permitted.has(key)) {
      errors.push(`target_metrics.${key} does not belong to the ${audience || 'unknown'} audience lane`);
    }
    if (value === undefined || value === null) {
      targetMetrics[key] = null;
      targetMetricStates[key] = 'UNKNOWN';
      continue;
    }
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`target_metrics.${key} must be a non-negative integer or null`);
      continue;
    }
    targetMetrics[key] = value;
    targetMetricStates[key] = 'observed';
  }

  const rawSources = record(input.measurement_sources) || {};
  for (const key of Object.keys(rawSources)) {
    if (!Object.prototype.hasOwnProperty.call(MEASUREMENT_SOURCE_ROLES, key)) {
      errors.push(`measurement_sources.${key} is unsupported`);
    }
  }

  const measurementSources = {};
  for (const [role, provider] of Object.entries(MEASUREMENT_SOURCE_ROLES)) {
    const refs = normalizeEvidenceRefs(rawSources[role], `measurement_sources.${role}`, errors);
    measurementSources[role] = Object.freeze({
      provider,
      state: refs.length > 0 ? 'observed' : 'UNKNOWN',
      evidence_refs: Object.freeze(refs),
    });
  }

  return Object.freeze({
    target: Object.freeze({
      scope,
      subject_id: subjectId,
      audience,
      campaign_id: campaignId,
    }),
    target_metrics: Object.freeze(targetMetrics),
    target_metric_states: Object.freeze(targetMetricStates),
    measurement_sources: Object.freeze(measurementSources),
  });
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

  const sourceAccount = buildSourceAccount(input, errors);
  if (sourceAccount && platform && sourceAccount.network !== platform) {
    errors.push('source_account.network must match platform');
  }
  if (sourceAccount && sourceAccount.coverage_state !== 'observed') {
    for (const key of METRIC_KEYS) {
      if (input.metrics?.[key] !== undefined && input.metrics?.[key] !== null) {
        errors.push(`metrics.${key} cannot be observed when source_account.coverage_state is ${sourceAccount.coverage_state}`);
      }
    }
  }

  const targetExtension = buildTargetExtension(input, errors);

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
  if (sourceAccount) identity.source_account = sourceAccount;
  if (targetExtension) Object.assign(identity, targetExtension);

  const authority = {
    observation_only: true,
    learning_authority: 'advisory_only',
    can_authorize_publish: false,
    can_change_content: false,
    can_increase_authority: false,
    missing_metrics_are_unknown: true,
  };
  if (sourceAccount) {
    authority.cross_account_metric_donation_forbidden = true;
  }
  if (targetExtension) {
    authority.target_attribution_only = true;
    authority.target_metrics_can_authorize_action = false;
  }

  return Object.freeze({
    version: 1,
    kind: 'fcr/founder-content-outcome-observation',
    ...identity,
    observation_hash: hash(identity),
    authority: Object.freeze(authority),
    privacy: Object.freeze({
      raw_post_text_stored: false,
      private_messages_stored: false,
      raw_comments_stored: false,
      provider_payload_stored: false,
      customer_private_data_stored: false,
    }),
  });
}

function validateSourceAccount(input, errors) {
  const source = record(input.source_account);
  if (!source) return false;

  const network = asString(source.network, 80).toLowerCase();
  const lane = asString(source.lane, 160).toLowerCase();
  const accountType = asString(source.account_type, 80).toLowerCase();
  const accountId = asString(source.account_id, 160);
  const connectorAccountType = asString(source.connector_account_type, 80).toLowerCase() || null;
  const connectorAccountId = asString(source.connector_account_id, 160) || null;
  const coverageState = normalizeCoverageState(source.coverage_state);

  if (!network || network !== asString(input.platform, 80).toLowerCase()) {
    errors.push('stored source_account.network must match platform');
  }
  if (!lane || (network && !lane.startsWith(`${network}.`))) {
    errors.push('stored source_account.lane must remain network-scoped');
  }
  if (!SOURCE_ACCOUNT_TYPES.has(accountType)) errors.push('stored source_account.account_type is invalid');
  if (!SUBJECT_ID.test(accountId)) errors.push('stored source_account.account_id is invalid');
  if ((connectorAccountType && !connectorAccountId) || (!connectorAccountType && connectorAccountId)) {
    errors.push('stored source_account connector identity is incomplete');
  }
  if (connectorAccountType && !SOURCE_ACCOUNT_TYPES.has(connectorAccountType)) {
    errors.push('stored source_account.connector_account_type is invalid');
  }
  if (connectorAccountId && !SUBJECT_ID.test(connectorAccountId)) {
    errors.push('stored source_account.connector_account_id is invalid');
  }
  if (!COVERAGE_STATES.has(coverageState) || source.coverage_state !== coverageState) {
    errors.push('stored source_account.coverage_state is invalid');
  }

  if (coverageState !== 'observed') {
    const metrics = record(input.metrics) || {};
    const states = record(input.metric_states) || {};
    for (const key of METRIC_KEYS) {
      if (metrics[key] !== null || states[key] !== 'UNKNOWN') {
        errors.push(`stored metrics.${key} must remain UNKNOWN when source account coverage is ${coverageState}`);
      }
    }
  }

  return true;
}

function validateTargetExtension(input, errors) {
  const target = record(input.target);
  if (!target) return false;

  const scope = asString(target.scope, 40).toLowerCase();
  const subjectId = asString(target.subject_id, 160);
  const audience = asString(target.audience, 40).toLowerCase();
  if (!TARGET_SCOPES.has(scope)) errors.push('stored target.scope is invalid');
  if (!SUBJECT_ID.test(subjectId)) errors.push('stored target.subject_id is invalid');
  if (!TARGET_AUDIENCES.has(audience)) errors.push('stored target.audience is invalid');
  if (audience === 'product_user' && scope !== 'product') {
    errors.push('stored product_user target must be product-scoped');
  }

  const metrics = record(input.target_metrics);
  const states = record(input.target_metric_states);
  if (!metrics || !states) {
    errors.push('target metrics and states are required when target is present');
  } else {
    const permitted = allowedTargetMetrics(audience);
    for (const key of TARGET_METRIC_KEYS) {
      const value = metrics[key];
      const state = states[key];
      if (value === null) {
        if (state !== 'UNKNOWN') errors.push(`target_metric_states.${key} must be UNKNOWN when value is null`);
      } else if (!Number.isInteger(value) || value < 0) {
        errors.push(`stored target_metrics.${key} is invalid`);
      } else {
        if (state !== 'observed') errors.push(`target_metric_states.${key} must be observed when value is present`);
        if (!permitted.has(key)) errors.push(`stored target_metrics.${key} crosses audience lanes`);
      }
    }
  }

  const sources = record(input.measurement_sources);
  if (!sources) {
    errors.push('measurement_sources are required when target is present');
  } else {
    for (const [role, provider] of Object.entries(MEASUREMENT_SOURCE_ROLES)) {
      const source = record(sources[role]);
      if (!source || source.provider !== provider || !['observed', 'UNKNOWN'].includes(source.state)) {
        errors.push(`measurement_sources.${role} is invalid`);
        continue;
      }
      const refs = Array.isArray(source.evidence_refs) ? source.evidence_refs : null;
      if (!refs || refs.some((ref) => !asString(ref, 240))) {
        errors.push(`measurement_sources.${role}.evidence_refs is invalid`);
        continue;
      }
      if ((refs.length > 0 ? 'observed' : 'UNKNOWN') !== source.state) {
        errors.push(`measurement_sources.${role}.state does not match evidence`);
      }
    }
  }

  return true;
}

function validateFounderContentOutcomeObservation(observation) {
  const input = record(observation);
  if (!input) reject(['observation must be an object']);

  const authority = record(input.authority);
  const privacy = record(input.privacy);
  const errors = [];
  const hasSourceAccount = validateSourceAccount(input, errors);
  const hasTarget = validateTargetExtension(input, errors);
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
  if (hasSourceAccount) identity.source_account = input.source_account;
  if (hasTarget) {
    identity.target = input.target;
    identity.target_metrics = input.target_metrics;
    identity.target_metric_states = input.target_metric_states;
    identity.measurement_sources = input.measurement_sources;
  }

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
  if (hasSourceAccount && authority?.cross_account_metric_donation_forbidden !== true) {
    errors.push('source account observations must forbid cross-account metric donation');
  }
  if (hasTarget && (
    authority?.target_attribution_only !== true
    || authority?.target_metrics_can_authorize_action !== false
  )) {
    errors.push('target attribution authority must remain observation-only');
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
  COVERAGE_STATES,
  FCR_LEARNING_ROUTE,
  FCR_LEARNING_TRANSPORT_CONTRACT,
  INVESTOR_TARGET_METRIC_KEYS,
  MEASUREMENT_SOURCE_ROLES,
  METRIC_KEYS,
  PRODUCT_USER_TARGET_METRIC_KEYS,
  SOURCE_ACCOUNT_TYPES,
  TARGET_METRIC_KEYS,
};
