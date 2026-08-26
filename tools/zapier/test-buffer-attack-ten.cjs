'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const {
  ATTACK_TEN_VERSION,
  VERIFIED_PUBLICATION_STATE,
  appendPublicationEvent,
  validatePublicationEventChain,
  evaluatePublicationAttackTen,
  productionPublicationAllowed,
} = require('./buffer-attack-ten.cjs');

const ROOT = resolve(__dirname, '../..');
const contract = JSON.parse(readFileSync(join(ROOT, 'config', 'buffer-provider-contract.json'), 'utf8'));

assert.equal(contract.attackTen.version, ATTACK_TEN_VERSION);
assert.equal(contract.attackTen.status, 'implemented-awaiting-controlled-live-proof');
assert.equal(contract.attackTen.releaseState, VERIFIED_PUBLICATION_STATE);
assert.equal(contract.attackTen.verifiedLeverageCountState, VERIFIED_PUBLICATION_STATE);
assert.deepEqual(contract.attackTen.assertions.map(({ id }) => id), [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
]);
assert.equal(contract.attackTen.eventLedger.appendOnly, true);
assert.equal(contract.attackTen.eventLedger.hashChained, true);
assert.equal(contract.attackTen.eventLedger.stateOverwriteAllowed, false);
assert.equal(contract.attackTen.eventLedger.missingEvidenceState, 'UNKNOWN');
assert.equal(contract.attackTen.releaseGate.requiresRuntimeOutcomeObservation, true);
assert.equal(contract.authority.liveProviderMutationIncluded, false);

const runId = '19f2f2df-66ca-45d5-8b0c-188128c3e9ac';
const contentSha256 = 'a'.repeat(64);
const authorityNonce = 'ba80d7c8-cc8a-4fbb-b1d2-7f6ad87fe40f';
const nowIso = '2026-08-25T22:20:00.000Z';
const nowMs = Date.parse(nowIso);
const evaluationOptions = {
  nowMs,
  trustedIngressSignerIds: ['fcr-ingress-signer-v1'],
};

const sequence = [
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
];

let events = [];
sequence.forEach((state, index) => {
  events = appendPublicationEvent(events, {
    publicationRunId: runId,
    eventId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    occurredAt: new Date(Date.parse('2026-08-25T22:00:00.000Z') + (index * 60_000)).toISOString(),
    state,
    evidenceRef: `synthetic:${state.toLowerCase()}`,
  });
});

const validInput = {
  publicationRunId: runId,
  contentSha256,
  contentFrozen: true,
  executorIdentity: 'founder-control-room',
  founderApproval: {
    id: 'approval:verified-delegation-post-v1',
    publicationRunId: runId,
    contentSha256,
    immutable: true,
  },
  reviewWindow: {
    state: 'REVIEW_WINDOW_MATURED',
    maturedAt: '2026-08-25T22:03:00.000Z',
    providerOverrideAllowed: false,
  },
  authority: {
    id: 'authority:verified-delegation-post-v1',
    nonce: authorityNonce,
    operation: 'schedule_linkedin_post',
    provider: 'buffer',
    recipient: 'founder-control-room',
    channelId: 'juss_rayy_linkedin',
    contentSha256,
    notBefore: '2026-08-25T22:03:00.000Z',
    expiresAt: '2026-08-26T00:30:00.000Z',
    consumed: false,
  },
  providerCapability: {
    live: true,
    policyGatePassed: true,
    provider: 'buffer',
    accountId: 'buffer-account-ray',
    channelId: 'juss_rayy_linkedin',
  },
  execution: {
    publicationRunId: runId,
    authorityId: 'authority:verified-delegation-post-v1',
    accountId: 'buffer-account-ray',
    actionId: 'buffer-action-123',
    idempotencyKey: `buffer:${runId}:${contentSha256}`,
    contentSha256,
    uniquenessConstraintVerified: true,
    duplicateAttemptBlocked: true,
  },
  providerReadback: {
    verified: true,
    actionId: 'buffer-action-123',
    accountId: 'buffer-account-ray',
    channelId: 'juss_rayy_linkedin',
    observedPostId: 'linkedin-post-123',
    observedUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:123',
    contentSha256,
  },
  ingress: {
    capability: 'VERIFIED',
    authenticated: true,
    signatureVerified: true,
    signerId: 'fcr-ingress-signer-v1',
    deduplicated: true,
    durable: true,
    eventId: 'provider-event-123',
    publicationRunId: runId,
    authorityId: 'authority:verified-delegation-post-v1',
    contentSha256,
    actionId: 'buffer-action-123',
    signedAt: '2026-08-25T22:19:30.000Z',
    receivedAt: nowIso,
    replayWindowMs: 60_000,
  },
  runtime: {
    observed: true,
    observedPostId: 'linkedin-post-123',
    observedUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:123',
    contentSha256,
  },
  negativeControls: {
    prematureExecutionDenied: true,
    expiredAuthorityRejected: true,
    replayedNonceBlocked: true,
    mismatchedContentRejected: true,
  },
  redStatePolicy: {
    missingEvidenceResolvesTo: 'UNKNOWN',
    rollbackSafe: true,
  },
  events,
};

const validEvaluation = evaluatePublicationAttackTen(validInput, evaluationOptions);
assert.equal(validEvaluation.attackTenVersion, ATTACK_TEN_VERSION);
assert.equal(validEvaluation.allowed, true);
assert.equal(validEvaluation.failures.length, 0);
assert.equal(validEvaluation.state, VERIFIED_PUBLICATION_STATE);
assert.equal(productionPublicationAllowed(validInput, evaluationOptions), true);

const chain = validatePublicationEventChain(events);
assert.equal(chain.valid, true);
assert.equal(chain.currentState, VERIFIED_PUBLICATION_STATE);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  reviewWindow: { ...validInput.reviewWindow, state: 'REVIEW_WINDOW_OPEN' },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A3').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  authority: { ...validInput.authority, expiresAt: '2026-08-25T22:19:59.000Z' },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A2').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  authority: { ...validInput.authority, consumed: true },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A2').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  execution: { ...validInput.execution, contentSha256: 'b'.repeat(64) },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A4').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  providerCapability: { ...validInput.providerCapability, live: false },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A5').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  execution: { ...validInput.execution, duplicateAttemptBlocked: false },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A6').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  providerReadback: { ...validInput.providerReadback, actionId: 'wrong-action' },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A7').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  ingress: { ...validInput.ingress, signatureVerified: false },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A8').pass, false);

const otherRunIngress = {
  ...validInput.ingress,
  eventId: 'provider-event-other-run',
  publicationRunId: '29f2f2df-66ca-45d5-8b0c-188128c3e9ac',
  authorityId: 'authority:other-publication',
  contentSha256: 'b'.repeat(64),
  actionId: 'buffer-action-other',
};
const crossRunEvaluation = evaluatePublicationAttackTen({
  ...validInput,
  ingress: otherRunIngress,
}, evaluationOptions);
assert.equal(crossRunEvaluation.attackResults.find(({ id }) => id === 'A8').pass, false);
assert.equal(crossRunEvaluation.allowed, false);
assert.equal(productionPublicationAllowed({ ...validInput, ingress: otherRunIngress }, evaluationOptions), false);

const selfDeclaredTrust = evaluatePublicationAttackTen({
  ...validInput,
  ingress: {
    ...validInput.ingress,
    signerId: 'attacker-controlled-signer',
    signerTrusted: true,
  },
}, evaluationOptions);
assert.equal(selfDeclaredTrust.attackResults.find(({ id }) => id === 'A8').pass, false);
assert.equal(selfDeclaredTrust.allowed, false);

assert.equal(evaluatePublicationAttackTen(validInput, { nowMs }).attackResults.find(({ id }) => id === 'A8').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  ingress: {
    ...validInput.ingress,
    signedAt: '2026-08-25T22:10:00.000Z',
    receivedAt: '2026-08-25T22:10:30.000Z',
    replayWindowMs: 60_000,
  },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A8').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  runtime: { ...validInput.runtime, observed: false },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A9').pass, false);

const tampered = events.map((event) => ({ ...event }));
tampered[5].evidenceRef = 'tampered:evidence';
const tamperedEvaluation = evaluatePublicationAttackTen({
  ...validInput,
  events: tampered,
}, evaluationOptions);
assert.equal(tamperedEvaluation.attackResults.find(({ id }) => id === 'A10').pass, false);
assert.equal(tamperedEvaluation.allowed, false);
assert.equal(tamperedEvaluation.state, 'UNKNOWN');

const invalidTransition = [
  appendPublicationEvent([], {
    publicationRunId: runId,
    eventId: '10000000-0000-4000-8000-000000000001',
    occurredAt: '2026-08-25T22:00:00.000Z',
    state: 'DRAFT',
    evidenceRef: 'synthetic:draft',
  })[0],
];
const badEvents = appendPublicationEvent(invalidTransition, {
  publicationRunId: runId,
  eventId: '10000000-0000-4000-8000-000000000002',
  occurredAt: '2026-08-25T22:01:00.000Z',
  state: 'ACTION_SUBMITTED',
  evidenceRef: 'synthetic:invalid-transition',
});
assert.equal(validatePublicationEventChain(badEvents).valid, false);

console.log('Buffer Attack Ten verified: all ten assertions pass only for one exact hash-chained VERIFIED_PUBLISHED synthetic run; cross-run ingress substitution, caller-declared signer trust, missing signer policy, stale replay, invalid signatures, premature/expired/replayed/mismatched authority, non-live capability, duplicate execution, receipt mismatch, false runtime success, tampered chains, and invalid transitions fail closed.');
