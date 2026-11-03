'use strict';

const { createHash } = require('node:crypto');

const FCR_SOCIAL_ANALYTICS_OBSERVATION_KIND = 'fcr/social-analytics-observation@v1';
const HASH = /^[0-9a-f]{64}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const IDENTIFIER = /^[A-Za-z0-9._:@/-]{1,200}$/;
const WINDOW_KINDS = new Set([
  'post_lifetime',
  'rolling_7d',
  'rolling_30d',
  'rolling_90d',
  'calendar_month',
  'custom_range',
]);
const SCOPES = new Set(['account', 'post']);
const TRUTH_STATES = new Set(['VERIFIED', 'OBSERVED', 'INFERRED', 'UNKNOWN', 'BLOCKED']);
const SOCIAL_METRIC_KEYS = Object.freeze([
  'impressions',
  'views',
  'reach',
  'likes',
  'comments',
  'shares',
  'saves',
  'profile_actions',
  'follower_change',
]);
const UNSIGNED_METRICS = new Set(SOCIAL_METRIC_KEYS.filter((key) => key !== 'follower_change'));

function text(value, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function reject(errors) {
  const error = new Error(`SOCIAL_ANALYTICS_OBSERVATION_REJECTED: ${errors.join('; ')}`);
  error.code = 'SOCIAL_ANALYTICS_OBSERVATION_REJECTED';
  error.details = errors;
  throw error;
}

function parseIso(value, label, errors, required = false) {
  const normalized = text(value, 64);
  if (!normalized) {
    if (required) errors.push(`${label} is required`);
    return null;
  }
  if (!ISO_DATE.test(normalized) || Number.isNaN(Date.parse(normalized))) {
    errors.push(`${label} must be ISO UTC`);
  }
  return normalized;
}

function normalizeEvidenceRefs(value, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('evidence_refs must contain at least one evidence reference');
    return [];
  }
  if (value.length > 20) errors.push('evidence_refs may contain at most 20 references');
  const refs = [];
  for (const raw of value.slice(0, 20)) {
    const ref = text(raw, 240);
    if (!ref) {
      errors.push('evidence_refs contains an invalid reference');
      continue;
    }
    if (!refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

function normalizeIdentity(input, errors) {
  const sourceObservationHash = text(input.source_observation_hash, 64).toLowerCase();
  const platform = text(input.platform, 80).toLowerCase();
  const provider = text(input.provider, 80).toLowerCase();
  const accountId = text(input.account_id, 200);
  const scope = text(input.scope, 40).toLowerCase();
  const postId = text(input.post_id, 200) || null;
  const observedAt = parseIso(input.observed_at, 'observed_at', errors, true);
  const truthState = text(input.truth_state, 40).toUpperCase() || 'OBSERVED';

  if (!HASH.test(sourceObservationHash)) errors.push('source_observation_hash must be SHA-256');
  if (!platform) errors.push('platform is required');
  if (!provider) errors.push('provider is required');
  if (!IDENTIFIER.test(accountId)) errors.push('account_id is invalid');
  if (!SCOPES.has(scope)) errors.push('scope must be account or post');
  if (scope === 'post' && (!postId || !IDENTIFIER.test(postId))) errors.push('post scope requires a valid post_id');
  if (scope === 'account' && postId) errors.push('account scope must not contain post_id');
  if (!TRUTH_STATES.has(truthState)) errors.push('truth_state is invalid');

  const window = record(input.window) || {};
  const windowKind = text(window.kind, 40).toLowerCase();
  if (!WINDOW_KINDS.has(windowKind)) errors.push('window.kind is invalid');
  const boundedWindow = windowKind !== 'post_lifetime';
  const windowStart = parseIso(window.start, 'window.start', errors, boundedWindow);
  const windowEnd = parseIso(window.end, 'window.end', errors, boundedWindow);
  if ((windowStart && !windowEnd) || (!windowStart && windowEnd)) {
    errors.push('window.start and window.end must be supplied together');
  }
  if (windowStart && windowEnd && Date.parse(windowEnd) <= Date.parse(windowStart)) {
    errors.push('window.end must be later than window.start');
  }

  const rawMetrics = record(input.metrics) || {};
  const rawDefinitions = record(input.metric_definitions) || {};
  const allowed = new Set(SOCIAL_METRIC_KEYS);
  for (const key of Object.keys(rawMetrics)) {
    if (!allowed.has(key)) errors.push(`metrics.${key} is unsupported`);
  }
  for (const key of Object.keys(rawDefinitions)) {
    if (!allowed.has(key)) errors.push(`metric_definitions.${key} is unsupported`);
  }

  const metrics = {};
  const metricStates = {};
  const metricDefinitions = {};
  for (const key of SOCIAL_METRIC_KEYS) {
    const value = rawMetrics[key];
    if (value === undefined || value === null) {
      metrics[key] = null;
      metricStates[key] = 'UNKNOWN';
      metricDefinitions[key] = null;
      if (rawDefinitions[key] !== undefined && rawDefinitions[key] !== null) {
        errors.push(`metric_definitions.${key} requires an observed metric`);
      }
      continue;
    }
    if (!Number.isInteger(value) || (UNSIGNED_METRICS.has(key) && value < 0)) {
      errors.push(`metrics.${key} must be ${key === 'follower_change' ? 'an integer' : 'a non-negative integer'} or null`);
    }
    const definition = text(rawDefinitions[key], 500);
    if (!definition) errors.push(`metric_definitions.${key} is required for an observed metric`);
    metrics[key] = value;
    metricStates[key] = 'observed';
    metricDefinitions[key] = definition || null;
  }

  const evidenceRefs = normalizeEvidenceRefs(input.evidence_refs, errors);

  return {
    version: 1,
    kind: FCR_SOCIAL_ANALYTICS_OBSERVATION_KIND,
    source_observation_hash: sourceObservationHash,
    platform,
    provider,
    account_id: accountId,
    scope,
    post_id: postId,
    observed_at: observedAt,
    window: {
      kind: windowKind,
      start: windowStart,
      end: windowEnd,
    },
    metrics,
    metric_states: metricStates,
    metric_definitions: metricDefinitions,
    evidence_refs: evidenceRefs,
    truth_state: truthState,
  };
}

function buildSocialAnalyticsObservation(input = {}) {
  const errors = [];
  const identity = normalizeIdentity(input, errors);
  if (errors.length > 0) reject(errors);
  return Object.freeze({
    ...identity,
    receipt_hash: hash(identity),
    authority: Object.freeze({
      observation_only: true,
      learning_authority: 'advisory_only',
      can_publish: false,
      can_schedule: false,
      can_change_content: false,
      can_override_product_gates: false,
      can_increase_authority: false,
      missing_metrics_are_unknown: true,
    }),
  });
}

function validateSocialAnalyticsObservation(input) {
  const receipt = record(input);
  if (!receipt) reject(['observation must be an object']);
  const errors = [];
  const identity = normalizeIdentity(receipt, errors);
  const receiptHash = text(receipt.receipt_hash, 64).toLowerCase();
  if (!HASH.test(receiptHash)) errors.push('receipt_hash must be SHA-256');
  else if (hash(identity) !== receiptHash) errors.push('receipt_hash does not match observation identity');

  const authority = record(receipt.authority);
  if (!authority
      || authority.observation_only !== true
      || authority.learning_authority !== 'advisory_only'
      || authority.can_publish !== false
      || authority.can_schedule !== false
      || authority.can_change_content !== false
      || authority.can_override_product_gates !== false
      || authority.can_increase_authority !== false
      || authority.missing_metrics_are_unknown !== true) {
    errors.push('authority must remain observation-only and non-authorizing');
  }

  if (errors.length > 0) reject(errors);
  return Object.freeze({ ...identity, receipt_hash: receiptHash, authority: Object.freeze({ ...authority }) });
}

function deriveRate(receipt, numerator, denominator) {
  const validated = validateSocialAnalyticsObservation(receipt);
  if (!SOCIAL_METRIC_KEYS.includes(numerator) || !SOCIAL_METRIC_KEYS.includes(denominator)) {
    reject(['rate metrics must use supported social metric keys']);
  }
  if (validated.metric_states[numerator] !== 'observed' || validated.metric_states[denominator] !== 'observed') {
    return Object.freeze({ state: 'UNKNOWN', numerator, denominator, value: null });
  }
  const divisor = validated.metrics[denominator];
  if (divisor === 0) return Object.freeze({ state: 'UNKNOWN', numerator, denominator, value: null });
  return Object.freeze({
    state: 'observed',
    numerator,
    denominator,
    value: validated.metrics[numerator] / divisor,
    account_id: validated.account_id,
    scope: validated.scope,
    post_id: validated.post_id,
    window: validated.window,
    source_receipt_hash: validated.receipt_hash,
  });
}

module.exports = {
  FCR_SOCIAL_ANALYTICS_OBSERVATION_KIND,
  SOCIAL_METRIC_KEYS,
  WINDOW_KINDS: Object.freeze([...WINDOW_KINDS]),
  buildSocialAnalyticsObservation,
  validateSocialAnalyticsObservation,
  deriveRate,
};
