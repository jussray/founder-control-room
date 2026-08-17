'use strict';

const { createHash } = require('node:crypto');
const { authorizeFounderContentPublication } = require('./founder-content-authorization-contract.cjs');

const HASH = /^[0-9a-f]{64}$/i;
const HTTPS_URL = /^https:\/\//i;
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,159}$/i;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_CURRENT_YOU_AGE_MS = 24 * 60 * 60 * 1000;

function asString(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function reject(errors) {
  const error = new Error(`FOUNDER_CONTENT_PUBLISH_NOW_REJECTED: ${errors.join('; ')}`);
  error.code = 'FOUNDER_CONTENT_PUBLISH_NOW_REJECTED';
  error.details = errors;
  throw error;
}

function parseTime(value, label) {
  const raw = asString(value, 64);
  const ms = Date.parse(raw);
  if (!raw || Number.isNaN(ms)) reject([`${label} must be an RFC3339 timestamp`]);
  return { raw: new Date(ms).toISOString(), ms };
}

function validateCanonicalAuthorization(authorization = {}, nowMs) {
  const errors = [];
  const authorizationHash = asString(authorization.authorization_hash, 64).toLowerCase();
  const publicPayloadHash = asString(authorization.public_payload_hash, 64).toLowerCase();
  const proposalHash = asString(authorization.proposal_hash, 64).toLowerCase();
  const platform = asString(authorization.content?.platform, 80).toLowerCase();
  const text = asString(authorization.content?.text, 3000);
  const intentId = asString(authorization.current_you?.intent_id, 200);
  const intentVersion = authorization.current_you?.intent_version;
  const currentObserved = parseTime(authorization.current_you?.observed_at, 'authorization.current_you.observed_at');
  const expires = parseTime(authorization.expires_at, 'authorization.expires_at');

  if (authorization.kind !== 'fcr/founder-content-publication-authorization') errors.push('canonical authorization kind is invalid');
  if (authorization.state !== 'authorized-for-scheduled-review') errors.push('canonical authorization state is invalid');
  if (authorization.authority?.execution_mode !== 'schedule_review_window') errors.push('canonical authorization must begin in schedule_review_window mode');
  if (authorization.authority?.one_shot !== true) errors.push('canonical authorization must be one_shot');
  if (authorization.authority?.share_now_allowed !== false) errors.push('canonical authorization must not pre-authorize share_now');
  if (!HASH.test(authorizationHash)) errors.push('authorization_hash must be sha256');
  if (!HASH.test(publicPayloadHash)) errors.push('public_payload_hash must be sha256');
  if (!HASH.test(proposalHash)) errors.push('proposal_hash must be sha256');
  if (!platform || !text) errors.push('authorized public platform and text are required');
  if (!intentId) errors.push('authorized Current You intent id is required');
  if (!Number.isInteger(intentVersion) || intentVersion < 1) errors.push('authorized Current You intent version is invalid');
  if (nowMs >= expires.ms) errors.push('canonical publication authorization is expired');

  if (errors.length > 0) reject(errors);
  return { authorizationHash, publicPayloadHash, proposalHash, platform, text, intentId, intentVersion, currentObserved, expires };
}

function validateCurrentYou(currentYou = {}, source, nowMs) {
  const errors = [];
  const intentId = asString(currentYou.intent_id, 200);
  const intentVersion = currentYou.intent_version;
  const observed = parseTime(currentYou.observed_at, 'current_you.observed_at');

  if (currentYou.authenticated !== true) errors.push('current_you.authenticated must be true');
  if (currentYou.source !== 'current_authenticated_founder') errors.push('current_you.source must be current_authenticated_founder');
  if (intentId !== source.intentId) errors.push('Current You intent id no longer matches the approved content');
  if (intentVersion !== source.intentVersion) errors.push('Current You intent version no longer matches the approved content');
  if (observed.ms < source.currentObserved.ms) errors.push('Current You must be re-read at or after the canonical approval observation');
  if (observed.ms > nowMs + MAX_CLOCK_SKEW_MS) errors.push('Current You observation is future-dated');
  if (nowMs - observed.ms > MAX_CURRENT_YOU_AGE_MS) errors.push('Current You observation is stale');

  if (errors.length > 0) reject(errors);
  return { intentId, intentVersion, observed };
}

function publishAuthorizationIdentity(authorization = {}) {
  return {
    version: 1,
    source_authorization_hash: asString(authorization.source_authorization_hash, 64).toLowerCase(),
    proposal_hash: asString(authorization.proposal_hash, 64).toLowerCase(),
    public_payload_hash: asString(authorization.public_payload_hash, 64).toLowerCase(),
    provider: asString(authorization.destination?.provider, 80).toLowerCase(),
    provider_account_id: asString(authorization.destination?.provider_account_id, 240),
    channel: asString(authorization.destination?.channel, 80).toLowerCase(),
    current_you_intent_id: asString(authorization.current_you?.intent_id, 200),
    current_you_intent_version: authorization.current_you?.intent_version,
    current_you_observed_at: asString(authorization.current_you?.observed_at, 64),
    expires_at: asString(authorization.expires_at, 64),
    execution_mode: 'publish_now',
  };
}

function expectedIdempotencyKey(authorization = {}) {
  return hash({
    kind: 'fcr/founder-content-publish-now-idempotency',
    publish_authorization_hash: asString(authorization.publish_authorization_hash, 64).toLowerCase(),
    provider: asString(authorization.destination?.provider, 80).toLowerCase(),
    provider_account_id: asString(authorization.destination?.provider_account_id, 240),
    public_payload_hash: asString(authorization.public_payload_hash, 64).toLowerCase(),
  });
}

function authorizeFounderContentPublishNow({ proposal, approval, confirmation = {}, provider, provider_account_id: providerAccountId, channel, current_you: currentYou, now } = {}) {
  const nowTime = parseTime(now, 'now');
  const canonicalAuthorization = authorizeFounderContentPublication({ proposal, approval, now: nowTime.raw });
  const source = validateCanonicalAuthorization(canonicalAuthorization, nowTime.ms);
  const current = validateCurrentYou(currentYou, source, nowTime.ms);
  const providerName = asString(provider, 80).toLowerCase();
  const accountId = asString(providerAccountId, 240);
  const targetChannel = asString(channel, 80).toLowerCase();
  const errors = [];

  if (confirmation.confirm_publication !== true) errors.push('confirm_publication must be true');
  if (asString(confirmation.authorization_hash, 64).toLowerCase() !== source.authorizationHash) errors.push('confirmation authorization_hash must match the exact canonical approval packet');
  if (asString(confirmation.public_payload_hash, 64).toLowerCase() !== source.publicPayloadHash) errors.push('confirmation public_payload_hash must match the exact approved copy');
  if (!IDENTIFIER.test(providerName)) errors.push('provider is required and must be a stable identifier');
  if (!accountId) errors.push('provider_account_id is required');
  if (targetChannel !== source.platform) errors.push('channel must match the exact authorized platform');
  if (!Array.isArray(canonicalAuthorization.channels) || !canonicalAuthorization.channels.includes(targetChannel)) errors.push('channel is not present in the canonical authorization');
  if (confirmation.revoked === true) errors.push('publish_now confirmation is revoked');
  if (confirmation.used === true) errors.push('publish_now confirmation has already been used');

  if (errors.length > 0) reject(errors);

  const identity = {
    version: 1,
    source_authorization_hash: source.authorizationHash,
    proposal_hash: source.proposalHash,
    public_payload_hash: source.publicPayloadHash,
    provider: providerName,
    provider_account_id: accountId,
    channel: targetChannel,
    current_you_intent_id: current.intentId,
    current_you_intent_version: current.intentVersion,
    current_you_observed_at: current.observed.raw,
    expires_at: source.expires.raw,
    execution_mode: 'publish_now',
  };
  const publishAuthorizationHash = hash(identity);
  const provisional = {
    publish_authorization_hash: publishAuthorizationHash,
    public_payload_hash: source.publicPayloadHash,
    destination: { provider: providerName, provider_account_id: accountId },
  };

  return Object.freeze({
    version: 1,
    kind: 'fcr/founder-content-publish-now-authorization',
    state: 'authorized-for-publish',
    execution_mode: 'publish_now',
    publish_authorization_hash: publishAuthorizationHash,
    source_authorization_hash: source.authorizationHash,
    proposal_hash: source.proposalHash,
    public_payload_hash: source.publicPayloadHash,
    content: Object.freeze({ platform: source.platform, text: source.text }),
    destination: Object.freeze({ provider: providerName, provider_account_id: accountId, channel: targetChannel }),
    current_you: Object.freeze({ authenticated: true, source: 'current_authenticated_founder', intent_id: current.intentId, intent_version: current.intentVersion, observed_at: current.observed.raw }),
    authority: Object.freeze({
      share_now_allowed: true,
      share_now_authorized: true,
      external_write_authorized: true,
      provider_receipt_required: true,
      provider_readback_required: true,
      one_shot: true,
      replay_allowed: false,
      future_you_advisory_only: true,
      analytics_can_authorize_publish: false,
    }),
    idempotency_key: expectedIdempotencyKey(provisional),
    expires_at: source.expires.raw,
  });
}

function writeEnvelopeIdentity(envelope = {}) {
  return {
    version: 1,
    operation: 'publish_now',
    idempotency_key: asString(envelope.idempotency_key, 64).toLowerCase(),
    publish_authorization_hash: asString(envelope.publish_authorization_hash, 64).toLowerCase(),
    public_payload_hash: asString(envelope.public_payload_hash, 64).toLowerCase(),
    destination: {
      provider: asString(envelope.destination?.provider, 80).toLowerCase(),
      provider_account_id: asString(envelope.destination?.provider_account_id, 240),
      channel: asString(envelope.destination?.channel, 80).toLowerCase(),
    },
    public_payload: {
      platform: asString(envelope.public_payload?.platform, 80).toLowerCase(),
      text: asString(envelope.public_payload?.text, 3000),
    },
    expires_at: asString(envelope.expires_at, 64),
  };
}

function buildFounderContentProviderWriteEnvelope({ publish_authorization: authorization, now, consumed_idempotency_keys: consumedKeys = [] } = {}) {
  const nowTime = parseTime(now, 'now');
  const errors = [];
  const expires = parseTime(authorization.expires_at, 'publish_authorization.expires_at');
  const key = asString(authorization.idempotency_key, 64).toLowerCase();
  const authorizationHash = asString(authorization.publish_authorization_hash, 64).toLowerCase();

  if (authorization.kind !== 'fcr/founder-content-publish-now-authorization') errors.push('publish authorization kind is invalid');
  if (authorization.state !== 'authorized-for-publish') errors.push('publish authorization state must be authorized-for-publish');
  if (authorization.execution_mode !== 'publish_now') errors.push('execution_mode must be publish_now');
  if (authorization.authority?.external_write_authorized !== true) errors.push('external write is not authorized');
  if (authorization.authority?.provider_receipt_required !== true) errors.push('provider receipt must be required');
  if (authorization.authority?.one_shot !== true) errors.push('publish authorization must be one_shot');
  if (!HASH.test(authorizationHash)) errors.push('publish_authorization_hash must be sha256');
  if (HASH.test(authorizationHash) && hash(publishAuthorizationIdentity(authorization)) !== authorizationHash) errors.push('publish authorization identity has been mutated');
  if (!HASH.test(key)) errors.push('idempotency_key must be sha256');
  if (HASH.test(key) && expectedIdempotencyKey(authorization) !== key) errors.push('idempotency_key does not match exact provider/account/copy authorization');
  if (nowTime.ms >= expires.ms) errors.push('publish authorization is expired');
  if (Array.isArray(consumedKeys) && consumedKeys.includes(key)) errors.push('publish authorization replay is blocked');
  if (!asString(authorization.destination?.provider, 80)) errors.push('provider destination is required');
  if (!asString(authorization.destination?.provider_account_id, 240)) errors.push('provider account destination is required');
  if (!asString(authorization.content?.text, 3000)) errors.push('authorized public text is required');
  if (asString(authorization.destination?.channel, 80).toLowerCase() !== asString(authorization.content?.platform, 80).toLowerCase()) errors.push('destination channel no longer matches authorized platform');

  if (errors.length > 0) reject(errors);

  const envelope = {
    version: 1,
    kind: 'fcr/founder-content-provider-write-envelope',
    operation: 'publish_now',
    idempotency_key: key,
    publish_authorization_hash: authorizationHash,
    public_payload_hash: authorization.public_payload_hash,
    destination: Object.freeze({ ...authorization.destination }),
    public_payload: Object.freeze({ platform: authorization.content.platform, text: authorization.content.text }),
    expires_at: authorization.expires_at,
  };
  const envelopeHash = hash(writeEnvelopeIdentity(envelope));

  return Object.freeze({
    ...envelope,
    write_envelope_hash: envelopeHash,
    authority: Object.freeze({ external_write_authorized: true, one_shot: true, provider_receipt_required: true, provider_readback_required: true }),
    privacy: Object.freeze({ includes_private_lineage: false, includes_internal_evidence: false, includes_credentials: false, includes_raw_diff: false, includes_private_metrics: false }),
  });
}

function recordFounderContentProviderReceipt({ write_envelope: envelope, provider_result: result = {}, observed_at: observedAt } = {}) {
  const observed = parseTime(observedAt, 'observed_at');
  const errors = [];
  const provider = asString(envelope.destination?.provider, 80).toLowerCase();
  const accountId = asString(envelope.destination?.provider_account_id, 240);
  const resultProvider = asString(result.provider, 80).toLowerCase();
  const resultAccount = asString(result.provider_account_id, 240);
  const postId = asString(result.provider_post_id, 240) || null;
  const publicUrl = asString(result.public_url, 1000) || null;
  const providerStatus = asString(result.status, 80).toLowerCase() || 'unknown';
  const httpStatus = Number.isInteger(result.http_status) ? result.http_status : null;
  const envelopeHash = asString(envelope.write_envelope_hash, 64).toLowerCase();

  if (envelope.kind !== 'fcr/founder-content-provider-write-envelope') errors.push('write envelope kind is invalid');
  if (!HASH.test(envelopeHash) || hash(writeEnvelopeIdentity(envelope)) !== envelopeHash) errors.push('write envelope identity has been mutated');
  if (resultProvider && resultProvider !== provider) errors.push('provider result does not match authorized provider');
  if (resultAccount && resultAccount !== accountId) errors.push('provider result does not match authorized account');
  if (errors.length > 0) reject(errors);

  const failed = result.write_succeeded === false || (httpStatus !== null && httpStatus >= 400) || providerStatus === 'failed';
  const published = !failed
    && result.write_succeeded === true
    && result.readback_verified === true
    && providerStatus === 'published'
    && Boolean(postId)
    && Boolean(publicUrl)
    && HTTPS_URL.test(publicUrl);

  const state = failed ? 'failed' : published ? 'published' : 'UNKNOWN';
  const identity = {
    version: 1,
    write_envelope_hash: envelopeHash,
    write_idempotency_key: envelope.idempotency_key,
    publish_authorization_hash: envelope.publish_authorization_hash,
    public_payload_hash: envelope.public_payload_hash,
    provider,
    provider_account_id: accountId,
    provider_post_id: postId,
    public_url: publicUrl,
    provider_status: providerStatus,
    http_status: httpStatus,
    observed_at: observed.raw,
    state,
  };

  return Object.freeze({
    version: 1,
    kind: 'fcr/founder-content-provider-receipt',
    ...identity,
    receipt_hash: hash(identity),
    truth: Object.freeze({ published, state, provider_readback_verified: result.readback_verified === true, external_write_occurred: result.write_succeeded === true, missing_receipt_is_not_success: true }),
  });
}

module.exports = {
  authorizeFounderContentPublishNow,
  buildFounderContentProviderWriteEnvelope,
  recordFounderContentProviderReceipt,
};
