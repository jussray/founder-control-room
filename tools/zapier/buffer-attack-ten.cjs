'use strict';

const { createHash } = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const HTTPS_URL = /^https:\/\//i;

const ATTACK_TEN_VERSION = 1;
const PUBLICATION_OPERATION = 'schedule_linkedin_post';
const PUBLICATION_PROVIDER = 'buffer';
const VERIFIED_PUBLICATION_STATE = 'VERIFIED_PUBLISHED';
const MAX_INGRESS_REPLAY_WINDOW_MS = 5 * 60 * 1000;
const PRODUCTION_BLOCK_REASON = 'AUTHORITATIVE_PRODUCTION_ADAPTER_REQUIRED';
const LINKEDIN_HOSTS = new Set(['linkedin.com', 'www.linkedin.com']);

const PUBLICATION_STATES = Object.freeze([
  'DRAFT',
  'FOUNDER_APPROVED',
  'REVIEW_WINDOW_OPEN',
  'REVIEW_WINDOW_MATURED',
  'AUTHORITY_MINTED',
  'PROVIDER_CAPABILITY_VERIFIED',
  'ACTION_SUBMITTED',
  'PROVIDER_ACKNOWLEDGED',
  'READBACK_CONFIRMED',
  'RUNTIME_OUTCOME_OBSERVED',
  VERIFIED_PUBLICATION_STATE,
  'DENIED',
  'EXPIRED',
  'REVOKED',
  'FAILED',
  'UNKNOWN',
  'CORRELATION_FAILED',
  'INGRESS_INVALID',
  'DUPLICATE_BLOCKED',
  'ROLLBACK_PENDING',
  'ROLLED_BACK',
]);

const RED_STATES = new Set([
  'DENIED',
  'EXPIRED',
  'REVOKED',
  'FAILED',
  'UNKNOWN',
  'CORRELATION_FAILED',
  'INGRESS_INVALID',
  'DUPLICATE_BLOCKED',
  'ROLLBACK_PENDING',
  'ROLLED_BACK',
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  DRAFT: new Set(['FOUNDER_APPROVED', 'DENIED']),
  FOUNDER_APPROVED: new Set(['REVIEW_WINDOW_OPEN', 'REVOKED', 'EXPIRED']),
  REVIEW_WINDOW_OPEN: new Set(['REVIEW_WINDOW_MATURED', 'REVOKED', 'EXPIRED', 'DENIED']),
  REVIEW_WINDOW_MATURED: new Set(['AUTHORITY_MINTED', 'REVOKED', 'EXPIRED', 'DENIED']),
  AUTHORITY_MINTED: new Set(['PROVIDER_CAPABILITY_VERIFIED', 'REVOKED', 'EXPIRED', 'DENIED', 'DUPLICATE_BLOCKED', 'CORRELATION_FAILED']),
  PROVIDER_CAPABILITY_VERIFIED: new Set(['ACTION_SUBMITTED', 'REVOKED', 'EXPIRED', 'DENIED', 'FAILED', 'DUPLICATE_BLOCKED', 'CORRELATION_FAILED']),
  ACTION_SUBMITTED: new Set(['PROVIDER_ACKNOWLEDGED', 'FAILED', 'UNKNOWN', 'DUPLICATE_BLOCKED', 'CORRELATION_FAILED']),
  PROVIDER_ACKNOWLEDGED: new Set(['READBACK_CONFIRMED', 'FAILED', 'UNKNOWN', 'CORRELATION_FAILED']),
  READBACK_CONFIRMED: new Set(['RUNTIME_OUTCOME_OBSERVED', 'FAILED', 'UNKNOWN', 'CORRELATION_FAILED']),
  RUNTIME_OUTCOME_OBSERVED: new Set([VERIFIED_PUBLICATION_STATE, 'FAILED', 'UNKNOWN', 'CORRELATION_FAILED', 'ROLLBACK_PENDING']),
  VERIFIED_PUBLISHED: new Set(['ROLLBACK_PENDING']),
  ROLLBACK_PENDING: new Set(['ROLLED_BACK', 'FAILED', 'UNKNOWN']),
  DENIED: new Set(),
  EXPIRED: new Set(),
  REVOKED: new Set(),
  FAILED: new Set(['ROLLBACK_PENDING']),
  UNKNOWN: new Set(['ROLLBACK_PENDING']),
  CORRELATION_FAILED: new Set(['ROLLBACK_PENDING']),
  INGRESS_INVALID: new Set(['ROLLBACK_PENDING']),
  DUPLICATE_BLOCKED: new Set(),
  ROLLED_BACK: new Set(),
});

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseTime(value) {
  const text = asText(value);
  const ms = Date.parse(text);
  return text && Number.isFinite(ms) ? ms : null;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireState(value) {
  const state = asText(value);
  if (!PUBLICATION_STATES.includes(state)) {
    throw new Error(`PUBLICATION_LEDGER_REJECTED: unsupported state ${state || '<empty>'}`);
  }
  return state;
}

function isLinkedInUrl(value) {
  const raw = asText(value);
  if (!HTTPS_URL.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && LINKEDIN_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function deriveAdvisoryIdempotencyKey(input = {}) {
  const publicationRunId = asText(input.publicationRunId);
  const contentSha256 = asText(input.contentSha256).toLowerCase();
  const authorityId = asText(input.authorityId);
  const authorityNonce = asText(input.authorityNonce);
  const channelId = asText(input.channelId);

  if (!UUID.test(publicationRunId)
    || !SHA256.test(contentSha256)
    || !authorityId
    || !UUID.test(authorityNonce)
    || !channelId) {
    return '';
  }

  return `buffer-attack-ten-v1:${sha256(stableJson({
    publicationRunId,
    contentSha256,
    authorityId,
    authorityNonce,
    channelId,
    provider: PUBLICATION_PROVIDER,
    operation: PUBLICATION_OPERATION,
  }))}`;
}

function appendPublicationEvent(events = [], input = {}) {
  if (!Array.isArray(events)) {
    throw new Error('PUBLICATION_LEDGER_REJECTED: events must be an array');
  }
  const publicationRunId = asText(input.publicationRunId);
  const eventId = asText(input.eventId);
  const occurredAt = asText(input.occurredAt);
  const evidenceRef = asText(input.evidenceRef);
  const state = requireState(input.state);

  if (!UUID.test(publicationRunId)) {
    throw new Error('PUBLICATION_LEDGER_REJECTED: publicationRunId must be a UUID');
  }
  if (!UUID.test(eventId)) {
    throw new Error('PUBLICATION_LEDGER_REJECTED: eventId must be a UUID');
  }
  if (parseTime(occurredAt) === null) {
    throw new Error('PUBLICATION_LEDGER_REJECTED: occurredAt must be a valid ISO timestamp');
  }
  if (!evidenceRef) {
    throw new Error('PUBLICATION_LEDGER_REJECTED: evidenceRef is required');
  }

  const prior = events.length > 0 ? events[events.length - 1] : null;
  const previousHash = prior ? asText(prior.eventHash) : 'GENESIS';
  if (prior && !SHA256.test(previousHash)) {
    throw new Error('PUBLICATION_LEDGER_REJECTED: prior event hash is invalid');
  }

  const canonical = {
    publicationRunId,
    eventId,
    occurredAt: new Date(occurredAt).toISOString(),
    state,
    evidenceRef,
    previousHash,
  };

  return [
    ...events,
    {
      ...canonical,
      eventHash: sha256(stableJson(canonical)),
    },
  ];
}

function validatePublicationEventChain(events = []) {
  const errors = [];
  if (!Array.isArray(events) || events.length === 0) {
    return { valid: false, errors: ['publication event chain is empty'], currentState: 'UNKNOWN' };
  }

  let previousHash = 'GENESIS';
  let runId = null;
  let previousState = null;
  let previousTime = null;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index] || {};
    const prefix = `event ${index + 1}`;

    if (!UUID.test(asText(event.publicationRunId))) errors.push(`${prefix} has invalid publicationRunId`);
    if (!UUID.test(asText(event.eventId))) errors.push(`${prefix} has invalid eventId`);
    if (!PUBLICATION_STATES.includes(asText(event.state))) errors.push(`${prefix} has invalid state`);
    if (!asText(event.evidenceRef)) errors.push(`${prefix} is missing evidenceRef`);

    const occurredAtMs = parseTime(event.occurredAt);
    if (occurredAtMs === null) {
      errors.push(`${prefix} has invalid occurredAt`);
    } else if (previousTime !== null && occurredAtMs < previousTime) {
      errors.push(`${prefix} occurred before the prior event`);
    }
    previousTime = occurredAtMs ?? previousTime;

    if (runId === null) {
      runId = asText(event.publicationRunId);
    } else if (asText(event.publicationRunId) !== runId) {
      errors.push(`${prefix} changed publicationRunId`);
    }

    if (asText(event.previousHash) !== previousHash) {
      errors.push(`${prefix} previousHash does not match the chain`);
    }

    const canonical = {
      publicationRunId: asText(event.publicationRunId),
      eventId: asText(event.eventId),
      occurredAt: occurredAtMs === null ? asText(event.occurredAt) : new Date(occurredAtMs).toISOString(),
      state: asText(event.state),
      evidenceRef: asText(event.evidenceRef),
      previousHash: asText(event.previousHash),
    };
    const expectedHash = sha256(stableJson(canonical));
    if (!SHA256.test(asText(event.eventHash)) || asText(event.eventHash) !== expectedHash) {
      errors.push(`${prefix} eventHash does not match event content`);
    }

    const state = asText(event.state);
    if (previousState === null) {
      if (state !== 'DRAFT') errors.push('event chain must begin at DRAFT');
    } else {
      const allowed = ALLOWED_TRANSITIONS[previousState];
      if (!allowed || !allowed.has(state)) {
        errors.push(`invalid state transition ${previousState} -> ${state}`);
      }
    }

    previousState = state;
    previousHash = asText(event.eventHash);
  }

  return {
    valid: errors.length === 0,
    errors,
    currentState: errors.length === 0 ? previousState : 'UNKNOWN',
    publicationRunId: runId,
    eventCount: events.length,
    chainHead: errors.length === 0 ? previousHash : null,
  };
}

function attack(id, name, pass, detail) {
  return { id, name, pass: pass === true, detail };
}

function trustedSignerSet(options = {}) {
  if (!Array.isArray(options.trustedIngressSignerIds)) return new Set();
  return new Set(options.trustedIngressSignerIds.map(asText).filter(Boolean));
}

/**
 * Pure source/advisory evaluator only.
 *
 * This function intentionally cannot mint production publication authority:
 * it does not own the authenticated FCR approval store, atomic execution
 * reservation, cryptographic ingress verifier, provider credentials, provider
 * readback client, or public runtime observer. `allowed` therefore remains
 * false even when every advisory assertion is internally coherent.
 */
function evaluatePublicationAttackTen(input = {}, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const trustedIngressSignerIds = trustedSignerSet(options);
  const publicationRunId = asText(input.publicationRunId);
  const contentSha256 = asText(input.contentSha256).toLowerCase();
  const founderApproval = input.founderApproval || {};
  const authority = input.authority || {};
  const reviewWindow = input.reviewWindow || {};
  const providerCapability = input.providerCapability || {};
  const execution = input.execution || {};
  const providerReadback = input.providerReadback || {};
  const ingress = input.ingress || {};
  const runtime = input.runtime || {};
  const negativeControls = input.negativeControls || {};
  const redStatePolicy = input.redStatePolicy || {};
  const eventChain = validatePublicationEventChain(input.events);

  const authorityNotBefore = parseTime(authority.notBefore);
  const authorityExpiresAt = parseTime(authority.expiresAt);
  const authorityConsumedAt = parseTime(authority.consumedAt);
  const reviewMaturedAt = parseTime(reviewWindow.maturedAt);
  const ingressSignedAt = parseTime(ingress.signedAt);
  const ingressReceivedAt = parseTime(ingress.receivedAt);
  const ingressReplayWindowMs = Number(ingress.replayWindowMs);
  const ingressSignerId = asText(ingress.signerId);
  const expectedIdempotencyKey = deriveAdvisoryIdempotencyKey({
    publicationRunId,
    contentSha256,
    authorityId: authority.id,
    authorityNonce: authority.nonce,
    channelId: authority.channelId,
  });

  const results = [];

  results.push(attack(
    'A1',
    'founder intent evidence is exact and store-bound',
    UUID.test(publicationRunId)
      && SHA256.test(contentSha256)
      && Boolean(asText(founderApproval.id))
      && founderApproval.immutable === true
      && founderApproval.evidenceSource === 'fcr-authoritative-approval-store'
      && founderApproval.storeReadbackVerified === true
      && asText(founderApproval.publicationRunId) === publicationRunId
      && asText(founderApproval.contentSha256).toLowerCase() === contentSha256,
    'advisory founder-approval evidence must identify the authoritative FCR store and bind the exact run/content hash; the pure evaluator cannot perform that read itself',
  ));

  results.push(attack(
    'A2',
    'authority evidence is scoped, expiring, and consumed exactly once by this action',
    Boolean(asText(authority.id))
      && UUID.test(asText(authority.nonce))
      && authority.operation === PUBLICATION_OPERATION
      && authority.provider === PUBLICATION_PROVIDER
      && Boolean(asText(authority.channelId))
      && asText(authority.contentSha256).toLowerCase() === contentSha256
      && asText(authority.recipient) === asText(input.executorIdentity)
      && authorityNotBefore !== null
      && authorityExpiresAt !== null
      && authorityNotBefore <= authorityConsumedAt
      && authorityConsumedAt !== null
      && authorityConsumedAt <= nowMs
      && authorityConsumedAt < authorityExpiresAt
      && authority.consumed === true
      && asText(authority.consumedByActionId) === asText(execution.actionId)
      && asText(authority.consumedPublicationRunId) === publicationRunId,
    'terminal advisory evidence must show the exact authority was consumed once for this run/action, never merely caller-declared unused',
  ));

  results.push(attack(
    'A3',
    'review-window rules are control-plane enforced',
    reviewWindow.state === 'REVIEW_WINDOW_MATURED'
      && reviewMaturedAt !== null
      && reviewMaturedAt <= nowMs
      && authorityNotBefore !== null
      && authorityNotBefore >= reviewMaturedAt
      && reviewWindow.providerOverrideAllowed === false,
    'authority cannot become valid before the review window matures',
  ));

  const exactContentCorrelation = [
    founderApproval.contentSha256,
    authority.contentSha256,
    execution.contentSha256,
    providerReadback.contentSha256,
    runtime.contentSha256,
  ].every((hash) => asText(hash).toLowerCase() === contentSha256);

  results.push(attack(
    'A4',
    'content identity is frozen and integrity-bound',
    input.contentFrozen === true
      && SHA256.test(contentSha256)
      && exactContentCorrelation,
    'approved, authorized, executed, read-back, and runtime-observed content hashes must match',
  ));

  results.push(attack(
    'A5',
    'provider capability evidence is live and policy-gated',
    providerCapability.live === true
      && providerCapability.policyGatePassed === true
      && providerCapability.provider === PUBLICATION_PROVIDER
      && Boolean(asText(providerCapability.accountId))
      && asText(providerCapability.channelId) === asText(authority.channelId)
      && asText(providerCapability.accountId) === asText(execution.accountId),
    'a configured credential or mock is not live capability proof',
  ));

  results.push(attack(
    'A6',
    'execution evidence is deterministically idempotent and reservation-correlated',
    Boolean(expectedIdempotencyKey)
      && asText(execution.idempotencyKey) === expectedIdempotencyKey
      && execution.uniquenessConstraintVerified === true
      && execution.duplicateAttemptBlocked === true
      && execution.reservationState === 'persisted'
      && Boolean(asText(execution.reservationId))
      && Boolean(asText(execution.actionId))
      && asText(execution.publicationRunId) === publicationRunId
      && asText(execution.authorityId) === asText(authority.id),
    'advisory retry-safety evidence must use the derived key and identify a persisted exact-scope reservation',
  ));

  results.push(attack(
    'A7',
    'provider acknowledgement is independently read back',
    providerReadback.verified === true
      && providerReadback.platform === 'linkedin'
      && Boolean(asText(providerReadback.observedPostId))
      && isLinkedInUrl(providerReadback.observedUrl)
      && asText(providerReadback.actionId) === asText(execution.actionId)
      && asText(providerReadback.accountId) === asText(execution.accountId)
      && asText(providerReadback.channelId) === asText(authority.channelId),
    'provider submission is insufficient without exact LinkedIn provider readback',
  ));

  results.push(attack(
    'A8',
    'ingress evidence is cryptographically verified, correlated, durable, deduplicated, and replay-bounded',
    ingress.capability === 'VERIFIED'
      && ingress.authenticated === true
      && ingress.signatureVerified === true
      && ingress.verificationSource === 'server-signature-verifier'
      && Boolean(asText(ingress.signatureEvidenceRef))
      && ingress.ledgerLookupVerified === true
      && Boolean(ingressSignerId)
      && trustedIngressSignerIds.has(ingressSignerId)
      && ingress.deduplicated === true
      && ingress.durable === true
      && Boolean(asText(ingress.eventId))
      && asText(ingress.publicationRunId) === publicationRunId
      && asText(ingress.authorityId) === asText(authority.id)
      && asText(ingress.contentSha256).toLowerCase() === contentSha256
      && asText(ingress.actionId) === asText(execution.actionId)
      && ingressSignedAt !== null
      && ingressReceivedAt !== null
      && ingressSignedAt <= ingressReceivedAt
      && ingressReceivedAt <= nowMs
      && Number.isInteger(ingressReplayWindowMs)
      && ingressReplayWindowMs > 0
      && ingressReplayWindowMs <= MAX_INGRESS_REPLAY_WINDOW_MS
      && ingressReceivedAt - ingressSignedAt <= ingressReplayWindowMs
      && nowMs - ingressReceivedAt <= ingressReplayWindowMs,
    'advisory ingress evidence must identify a server-side cryptographic verifier plus durable ledger readback; booleans alone are never production authority',
  ));

  results.push(attack(
    'A9',
    'runtime outcome is observed on the exact approved LinkedIn destination',
    runtime.observed === true
      && runtime.platform === 'linkedin'
      && asText(runtime.channelId) === asText(authority.channelId)
      && Boolean(asText(runtime.observedPostId))
      && isLinkedInUrl(runtime.observedUrl)
      && asText(runtime.observedPostId) === asText(providerReadback.observedPostId)
      && asText(runtime.observedUrl) === asText(providerReadback.observedUrl),
    'runtime evidence must bind the same LinkedIn destination, channel, post identity, and URL as provider readback',
  ));

  results.push(attack(
    'A10',
    'failure, expiry, denial, and rollback stay visible and safe',
    eventChain.valid === true
      && eventChain.publicationRunId === publicationRunId
      && eventChain.currentState === VERIFIED_PUBLICATION_STATE
      && redStatePolicy.missingEvidenceResolvesTo === 'UNKNOWN'
      && redStatePolicy.rollbackSafe === true
      && negativeControls.prematureExecutionDenied === true
      && negativeControls.expiredAuthorityRejected === true
      && negativeControls.replayedNonceBlocked === true
      && negativeControls.mismatchedContentRejected === true,
    'only a valid hash-chained VERIFIED_PUBLISHED evidence chain with passing negative controls may be advisory-green',
  ));

  const advisoryAllowed = results.every((result) => result.pass);
  return {
    attackTenVersion: ATTACK_TEN_VERSION,
    publicationRunId,
    contentSha256,
    state: eventChain.currentState,
    attackResults: results,
    failures: results.filter((result) => !result.pass),
    exactReceiptCorrelation: results.slice(0, 9).every((result) => result.pass),
    advisoryAllowed,
    allowed: false,
    productionAuthority: false,
    productionBlockReason: PRODUCTION_BLOCK_REASON,
    eventChain,
  };
}

/**
 * Fail closed by construction.
 *
 * The pure Attack Ten evaluator is intentionally incapable of authorizing a
 * provider mutation. A future production adapter must own the authenticated
 * approval read/claim, atomic reservation/nonce consumption, cryptographic
 * ingress verification, provider readback, and runtime observation before it
 * can expose a separate production-authority decision.
 */
function productionPublicationAllowed() {
  return false;
}

module.exports = {
  ATTACK_TEN_VERSION,
  PUBLICATION_OPERATION,
  PUBLICATION_PROVIDER,
  VERIFIED_PUBLICATION_STATE,
  PRODUCTION_BLOCK_REASON,
  PUBLICATION_STATES,
  RED_STATES,
  appendPublicationEvent,
  validatePublicationEventChain,
  deriveAdvisoryIdempotencyKey,
  evaluatePublicationAttackTen,
  productionPublicationAllowed,
};
