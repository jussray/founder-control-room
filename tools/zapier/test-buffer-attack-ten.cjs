'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const {
  ATTACK_TEN_VERSION,
  VERIFIED_PUBLICATION_STATE,
  PRODUCTION_BLOCK_REASON,
  REVIEW_WINDOW_MS,
  appendPublicationEvent,
  validatePublicationEventChain,
  deriveCanonicalPayloadSha256,
  deriveAdvisoryIdempotencyKey,
  expectedPublicationEvidenceRef,
  evaluatePublicationAttackTen,
  productionPublicationAllowed,
} = require('./buffer-attack-ten.cjs');

const ROOT = resolve(__dirname, '../..');
const contract = JSON.parse(readFileSync(join(ROOT, 'config', 'buffer-provider-contract.json'), 'utf8'));

assert.equal(contract.attackTen.version, ATTACK_TEN_VERSION);
assert.equal(contract.attackTen.status, 'implemented-awaiting-controlled-live-proof');
assert.equal(contract.attackTen.scope, 'advisory-evidence-only');
assert.equal(contract.attackTen.standaloneEvaluatorAuthorizesProduction, false);
assert.equal(contract.attackTen.requiresAuthoritativeProductionAdapter, true);
assert.equal(contract.attackTen.releaseState, VERIFIED_PUBLICATION_STATE);
assert.equal(contract.attackTen.verifiedLeverageCountState, VERIFIED_PUBLICATION_STATE);
assert.deepEqual(contract.attackTen.assertions.map(({ id }) => id), [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
]);
assert.equal(contract.attackTen.eventLedger.appendOnly, true);
assert.equal(contract.attackTen.eventLedger.hashChained, true);
assert.equal(contract.attackTen.eventLedger.stateOverwriteAllowed, false);
assert.equal(contract.attackTen.eventLedger.exactEvidenceRefBindingRequired, true);
assert.equal(contract.attackTen.eventLedger.ingressInvalidReachableFromProcessingStates, true);
assert.equal(contract.attackTen.eventLedger.missingEvidenceState, 'UNKNOWN');
assert.equal(contract.attackTen.releaseGate.standaloneEvaluatorAuthorizesProduction, false);
assert.equal(contract.attackTen.releaseGate.requiresAuthoritativeProductionAdapter, true);
assert.equal(contract.attackTen.releaseGate.requiresConsumedOneUseAuthorityEvidence, true);
assert.equal(contract.attackTen.releaseGate.requiresRuntimeOutcomeObservation, true);
assert.equal(contract.authority.liveProviderMutationIncluded, false);
assert.equal(REVIEW_WINDOW_MS, 20 * 60 * 1000);

const runId = '19f2f2df-66ca-45d5-8b0c-188128c3e9ac';
const authorityNonce = 'ba80d7c8-cc8a-4fbb-b1d2-7f6ad87fe40f';
const authorityId = 'authority:verified-delegation-post-v1';
const actionId = 'buffer-action-123';
const channelId = 'juss_rayy_linkedin';
const canonicalPayload = {
  platform: 'linkedin',
  channelId,
  text: 'Synthetic approved post for the Buffer Attack Ten advisory proof.',
};
const contentSha256 = deriveCanonicalPayloadSha256(canonicalPayload);
assert.match(contentSha256, /^[0-9a-f]{64}$/);

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

const expectedIdempotencyKey = deriveAdvisoryIdempotencyKey({
  publicationRunId: runId,
  contentSha256,
  authorityId,
  authorityNonce,
  channelId,
});
assert.ok(expectedIdempotencyKey.startsWith('buffer-attack-ten-v1:'));

const validInput = {
  publicationRunId: runId,
  canonicalPayload,
  contentSha256,
  contentFrozen: true,
  executorIdentity: 'founder-control-room',
  founderApproval: {
    id: 'approval:verified-delegation-post-v1',
    publicationRunId: runId,
    contentSha256,
    immutable: true,
    evidenceSource: 'fcr-authoritative-approval-store',
    storeReadbackVerified: true,
  },
  reviewWindow: {
    state: 'REVIEW_WINDOW_MATURED',
    policyId: 'buffer-20-minute-review-v1',
    generatedAt: '2026-08-25T21:43:00.000Z',
    maturedAt: '2026-08-25T22:03:00.000Z',
    providerOverrideAllowed: false,
  },
  authority: {
    id: authorityId,
    nonce: authorityNonce,
    operation: 'schedule_linkedin_post',
    provider: 'buffer',
    recipient: 'founder-control-room',
    channelId,
    contentSha256,
    notBefore: '2026-08-25T22:03:00.000Z',
    expiresAt: '2026-08-26T00:30:00.000Z',
    consumed: true,
    consumedAt: '2026-08-25T22:12:00.000Z',
    consumedByActionId: actionId,
    consumedPublicationRunId: runId,
  },
  providerCapability: {
    live: true,
    policyGatePassed: true,
    provider: 'buffer',
    accountId: 'buffer-account-ray',
    channelId,
  },
  execution: {
    publicationRunId: runId,
    authorityId,
    accountId: 'buffer-account-ray',
    actionId,
    idempotencyKey: expectedIdempotencyKey,
    contentSha256,
    uniquenessConstraintVerified: true,
    duplicateAttemptBlocked: true,
    reservationState: 'persisted',
    reservationId: 'approval-execution-123',
  },
  providerReadback: {
    verified: true,
    platform: 'linkedin',
    actionId,
    accountId: 'buffer-account-ray',
    channelId,
    observedPostId: 'linkedin-post-123',
    observedUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:123',
    contentSha256,
  },
  ingress: {
    capability: 'VERIFIED',
    authenticated: true,
    signatureVerified: true,
    verificationSource: 'server-signature-verifier',
    signatureEvidenceRef: 'receipt:signature:provider-event-123',
    ledgerLookupVerified: true,
    signerId: 'fcr-ingress-signer-v1',
    deduplicated: true,
    durable: true,
    eventId: 'provider-event-123',
    publicationRunId: runId,
    authorityId,
    contentSha256,
    actionId,
    signedAt: '2026-08-25T22:19:30.000Z',
    receivedAt: nowIso,
    replayWindowMs: 60_000,
  },
  runtime: {
    observed: true,
    platform: 'linkedin',
    channelId,
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
  events: [],
};

let events = [];
sequence.forEach((state, index) => {
  events = appendPublicationEvent(events, {
    publicationRunId: runId,
    eventId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    occurredAt: new Date(Date.parse('2026-08-25T22:00:00.000Z') + (index * 60_000)).toISOString(),
    state,
    evidenceRef: expectedPublicationEvidenceRef(state, validInput),
  });
});
validInput.events = events;

const validEvaluation = evaluatePublicationAttackTen(validInput, evaluationOptions);
assert.equal(validEvaluation.attackTenVersion, ATTACK_TEN_VERSION);
assert.equal(validEvaluation.canonicalPayloadSha256, contentSha256);
assert.equal(validEvaluation.advisoryAllowed, true);
assert.equal(validEvaluation.allowed, false);
assert.equal(validEvaluation.productionAuthority, false);
assert.equal(validEvaluation.productionBlockReason, PRODUCTION_BLOCK_REASON);
assert.equal(validEvaluation.failures.length, 0);
assert.equal(validEvaluation.state, VERIFIED_PUBLICATION_STATE);
assert.equal(productionPublicationAllowed(validInput, evaluationOptions), false);
assert.equal(productionPublicationAllowed(validInput, { nowMs: Date.parse('2020-01-01T00:00:00.000Z') }), false);

const chain = validatePublicationEventChain(events);
assert.equal(chain.valid, true);
assert.equal(chain.currentState, VERIFIED_PUBLICATION_STATE);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  founderApproval: {
    ...validInput.founderApproval,
    evidenceSource: 'caller-json',
  },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A1').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  reviewWindow: { ...validInput.reviewWindow, state: 'REVIEW_WINDOW_OPEN' },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A3').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  reviewWindow: {
    ...validInput.reviewWindow,
    generatedAt: '2026-08-25T21:59:00.000Z',
  },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A3').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  reviewWindow: { ...validInput.reviewWindow, policyId: 'caller-short-window' },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A3').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  authority: { ...validInput.authority, expiresAt: '2026-08-25T22:11:59.000Z' },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A2').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  authority: { ...validInput.authority, consumed: false },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A2').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  authority: { ...validInput.authority, consumedByActionId: 'other-action' },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A2').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  execution: { ...validInput.execution, contentSha256: 'b'.repeat(64) },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A4').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  canonicalPayload: {
    ...validInput.canonicalPayload,
    text: `${validInput.canonicalPayload.text} MUTATED`,
  },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A4').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  canonicalPayload: {
    ...validInput.canonicalPayload,
    channelId: 'wrong-linkedin-channel',
  },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A4').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  providerCapability: { ...validInput.providerCapability, live: false },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A5').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  execution: { ...validInput.execution, idempotencyKey: `caller-chosen:${runId}` },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A6').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  execution: { ...validInput.execution, reservationState: 'caller-asserted' },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A6').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  providerReadback: { ...validInput.providerReadback, actionId: 'wrong-action' },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A7').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  ingress: { ...validInput.ingress, signatureVerified: false },
}, evaluationOptions).attackResults.find(({ id }) => id === 'A8').pass, false);

assert.equal(evaluatePublicationAttackTen({
  ...validInput,
  ingress: {
    ...validInput.ingress,
    verificationSource: undefined,
    signatureEvidenceRef: undefined,
    ledgerLookupVerified: false,
    signatureVerified: true,
    authenticated: true,
    deduplicated: true,
    durable: true,
  },
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
assert.equal(crossRunEvaluation.advisoryAllowed, false);
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
assert.equal(selfDeclaredTrust.advisoryAllowed, false);

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

const wrongDestination = 'https://example.com/not-linkedin';
const wrongDestinationEvaluation = evaluatePublicationAttackTen({
  ...validInput,
  providerReadback: {
    ...validInput.providerReadback,
    observedUrl: wrongDestination,
  },
  runtime: {
    ...validInput.runtime,
    observedUrl: wrongDestination,
  },
}, evaluationOptions);
assert.equal(wrongDestinationEvaluation.attackResults.find(({ id }) => id === 'A7').pass, false);
assert.equal(wrongDestinationEvaluation.attackResults.find(({ id }) => id === 'A9').pass, false);
assert.equal(wrongDestinationEvaluation.advisoryAllowed, false);
assert.equal(productionPublicationAllowed({
  ...validInput,
  providerReadback: { ...validInput.providerReadback, observedUrl: wrongDestination },
  runtime: { ...validInput.runtime, observedUrl: wrongDestination },
}, evaluationOptions), false);

let wrongEvidenceEvents = [];
sequence.forEach((state, index) => {
  wrongEvidenceEvents = appendPublicationEvent(wrongEvidenceEvents, {
    publicationRunId: runId,
    eventId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    occurredAt: new Date(Date.parse('2026-08-25T22:00:00.000Z') + (index * 60_000)).toISOString(),
    state,
    evidenceRef: `wrong-but-valid:${state.toLowerCase()}`,
  });
});
const wrongEvidenceEvaluation = evaluatePublicationAttackTen({
  ...validInput,
  events: wrongEvidenceEvents,
}, evaluationOptions);
assert.equal(validatePublicationEventChain(wrongEvidenceEvents).valid, true);
assert.equal(wrongEvidenceEvaluation.attackResults.find(({ id }) => id === 'A10').pass, false);
assert.equal(wrongEvidenceEvaluation.advisoryAllowed, false);

let futureEvents = [];
sequence.forEach((state, index) => {
  futureEvents = appendPublicationEvent(futureEvents, {
    publicationRunId: runId,
    eventId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    occurredAt: new Date(nowMs + ((index + 1) * 60_000)).toISOString(),
    state,
    evidenceRef: expectedPublicationEvidenceRef(state, validInput),
  });
});
const futureEvaluation = evaluatePublicationAttackTen({
  ...validInput,
  events: futureEvents,
}, evaluationOptions);
assert.equal(validatePublicationEventChain(futureEvents).valid, true);
assert.equal(futureEvaluation.attackResults.find(({ id }) => id === 'A10').pass, false);
assert.equal(futureEvaluation.advisoryAllowed, false);

const actionSubmittedPrefix = events.slice(0, sequence.indexOf('ACTION_SUBMITTED') + 1);
const ingressInvalidEvents = appendPublicationEvent(actionSubmittedPrefix, {
  publicationRunId: runId,
  eventId: '30000000-0000-4000-8000-000000000001',
  occurredAt: '2026-08-25T22:07:30.000Z',
  state: 'INGRESS_INVALID',
  evidenceRef: expectedPublicationEvidenceRef('INGRESS_INVALID', validInput),
});
const ingressInvalidChain = validatePublicationEventChain(ingressInvalidEvents);
assert.equal(ingressInvalidChain.valid, true);
assert.equal(ingressInvalidChain.currentState, 'INGRESS_INVALID');

const tampered = events.map((event) => ({ ...event }));
tampered[5].evidenceRef = 'tampered:evidence';
const tamperedEvaluation = evaluatePublicationAttackTen({
  ...validInput,
  events: tampered,
}, evaluationOptions);
assert.equal(tamperedEvaluation.attackResults.find(({ id }) => id === 'A10').pass, false);
assert.equal(tamperedEvaluation.advisoryAllowed, false);
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

console.log('Buffer Attack Ten verified: the pure evaluator remains non-authorizing; actual canonical payload mutation, short review windows, future-dated evidence, caller approval claims, unused/replayed authority, arbitrary idempotency, unverified ingress flags, wrong destinations, cross-run substitution, stale replay, false runtime success, mismatched ledger evidence, explicit ingress-invalid transitions, tampered chains, and invalid transitions fail closed.');
