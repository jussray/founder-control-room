'use strict';

const { createHash } = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const HTTPS_URL = /^https:\/\//i;

const ATTACK_TEN_VERSION = 1;
const PUBLICATION_OPERATION = 'schedule_linkedin_post';
const PUBLICATION_PROVIDER = 'buffer';
const VERIFIED_PUBLICATION_STATE = 'VERIFIED_PUBLISHED';

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

function evaluatePublicationAttackTen(input = {}, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
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
  const reviewMaturedAt = parseTime(reviewWindow.maturedAt);

  const results = [];

  results.push(attack(
    'A1',
    'founder intent is explicit and immutable',
    UUID.test(publicationRunId)
      && SHA256.test(contentSha256)
      && Boolean(asText(founderApproval.id))
      && founderApproval.immutable === true
      && asText(founderApproval.publicationRunId) === publicationRunId
      && asText(founderApproval.contentSha256).toLowerCase() === contentSha256,
    'founder approval must bind the exact run and canonical content hash',
  ));

  results.push(attack(
    'A2',
    'authority is scoped, expiring, one-use, and non-transferable',
    Boolean(asText(authority.id))
      && UUID.test(asText(authority.nonce))
      && authority.operation === PUBLICATION_OPERATION
      && authority.provider === PUBLICATION_PROVIDER
      && Boolean(asText(authority.channelId))
      && asText(authority.contentSha256).toLowerCase() === contentSha256
      && asText(authority.recipient) === asText(input.executorIdentity)
      && authorityNotBefore !== null
      && authorityExpiresAt !== null
      && authorityNotBefore <= nowMs
      && nowMs < authorityExpiresAt
      && authority.consumed === false,
    'authority must be exact-scope, time-bounded, recipient-bound, and unused',
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
    'provider capability is live and policy-gated',
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
    'execution is idempotent and receipt-correlated',
    Boolean(asText(execution.idempotencyKey))
      && execution.uniquenessConstraintVerified === true
      && execution.duplicateAttemptBlocked === true
      && Boolean(asText(execution.actionId))
      && asText(execution.publicationRunId) === publicationRunId
      && asText(execution.authorityId) === asText(authority.id),
    'retry safety requires deterministic idempotency plus run/authority correlation',
  ));

  results.push(attack(
    'A7',
    'provider acknowledgement is independently read back',
    providerReadback.verified === true
      && Boolean(asText(providerReadback.observedPostId))
      && HTTPS_URL.test(asText(providerReadback.observedUrl))
      && asText(providerReadback.actionId) === asText(execution.actionId)
      && asText(providerReadback.accountId) === asText(execution.accountId)
      && asText(providerReadback.channelId) === asText(authority.channelId),
    'provider submission is insufficient without independent provider readback',
  ));

  results.push(attack(
    'A8',
    'ingress is authenticated, deduplicated, and durable',
    ingress.capability === 'VERIFIED'
      && ingress.authenticated === true
      && ingress.signatureVerified === true
      && ingress.deduplicated === true
      && ingress.durable === true
      && Boolean(asText(ingress.eventId)),
    'invalid, duplicate, or unauthenticated ingress cannot advance publication state',
  ));

  results.push(attack(
    'A9',
    'runtime outcome is observed rather than inferred',
    runtime.observed === true
      && Boolean(asText(runtime.observedPostId))
      && HTTPS_URL.test(asText(runtime.observedUrl))
      && asText(runtime.observedPostId) === asText(providerReadback.observedPostId)
      && asText(runtime.observedUrl) === asText(providerReadback.observedUrl),
    'verified publication requires the destination state to be observed',
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
    'only a valid hash-chained VERIFIED_PUBLISHED run with passing negative controls can satisfy the release gate',
  ));

  return {
    attackTenVersion: ATTACK_TEN_VERSION,
    publicationRunId,
    contentSha256,
    state: eventChain.currentState,
    attackResults: results,
    failures: results.filter((result) => !result.pass),
    exactReceiptCorrelation: results.slice(0, 9).every((result) => result.pass),
    allowed: results.every((result) => result.pass),
    eventChain,
  };
}

function productionPublicationAllowed(input = {}, options = {}) {
  const evaluation = evaluatePublicationAttackTen(input, options);
  return evaluation.allowed === true
    && evaluation.state === VERIFIED_PUBLICATION_STATE
    && evaluation.exactReceiptCorrelation === true;
}

module.exports = {
  ATTACK_TEN_VERSION,
  PUBLICATION_OPERATION,
  PUBLICATION_PROVIDER,
  VERIFIED_PUBLICATION_STATE,
  PUBLICATION_STATES,
  RED_STATES,
  appendPublicationEvent,
  validatePublicationEventChain,
  evaluatePublicationAttackTen,
  productionPublicationAllowed,
};
