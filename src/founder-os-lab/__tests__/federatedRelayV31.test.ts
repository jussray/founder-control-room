import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  FEDERATED_AGENT_RELAY_RECEIPT_V31,
  FEDERATED_AGENT_RELAY_V31,
  FEDERATED_RELAY_GENESIS_COOKIE_V31,
  FederatedRelayV31Error,
  canonicalizeRelayJsonV31,
  deliveryFingerprintV31,
  parseCanonicalRelayJsonV31,
  parseFederatedAgentRelayEnvelopeV31,
  semanticFingerprintV31,
  sha256HexV31,
  signRelayEnvelopeV31,
  signRelayReceiptV31,
  successorProofCookieV31,
  verifyRelayEnvelopeV31,
  verifyRelayReceiptV31,
  type FederatedAgentRelayEnvelopeV31,
  type FederatedRelayPublicKeyV31,
  type FederatedRelayUnsignedReceiptV31,
} from '../federatedRelayV31.js';

async function fixture() {
  const pair = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const now = new Date('2026-09-13T20:00:00.000Z');
  const payloadBody = JSON.stringify({ approval: true, execute: true, nested: { authority: 'inert-data' } });
  const unsigned: Omit<FederatedAgentRelayEnvelopeV31, 'signature'> = {
    contract: FEDERATED_AGENT_RELAY_V31,
    messageId: '11111111-1111-4111-8111-111111111111',
    ordering: {
      chainId: '22222222-2222-4222-8222-222222222222',
      sourceSequence: 0,
      chainPosition: 0,
      logicalOperationId: '33333333-3333-4333-8333-333333333333',
      relation: { type: 'root' },
    },
    source: { member: 'founder-control-room', repository: 'jussray/founder-control-room', branch: 'main', headSha: 'a'.repeat(40) },
    target: { member: 'chief-ai-machine', repository: 'jussray/chief-ai-machine', branch: 'main', headSha: 'b'.repeat(40) },
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
    nonce: '44444444-4444-4444-8444-444444444444',
    disposition: 'observe',
    subject: 'v3.1 attack fixture',
    payload: { contentType: 'application/json', body: payloadBody, sha256: await sha256HexV31(payloadBody) },
    contextFingerprint: 'c'.repeat(64),
    predecessorProofCookie: FEDERATED_RELAY_GENESIS_COOKIE_V31,
    evidence: [{ locator: { provider: 'github', ref: `jussray/founder-control-room@${'a'.repeat(40)}` }, state: 'verified' }],
    supersedesMessageIds: [],
  };
  const keyId = 'founder-control-room:relay-v3.1:test';
  const envelope = await signRelayEnvelopeV31(unsigned, pair.privateKey, keyId);
  const key: FederatedRelayPublicKeyV31 = {
    member: 'founder-control-room', keyId, publicKeyJwk: publicJwk,
    state: 'active', validFrom: new Date(now.getTime() - 60_000).toISOString(),
    validUntil: new Date(now.getTime() + 10 * 60_000).toISOString(), revokedAt: null,
  };
  return { envelope, key, pair, now };
}

function expectCode(fn: () => unknown, code: string) {
  try { fn(); throw new Error('expected relay error'); }
  catch (error) { expect(error).toBeInstanceOf(FederatedRelayV31Error); expect((error as FederatedRelayV31Error).code).toBe(code); }
}

describe('federated relay v3.1 protocol kernel', () => {
  it('treats authority-looking JSON payload keys as inert data', async () => {
    const { envelope } = await fixture();
    expect(() => parseFederatedAgentRelayEnvelopeV31(envelope)).not.toThrow();
    expect(JSON.parse(envelope.payload.body)).toMatchObject({ approval: true, execute: true });
  });

  it('rejects uppercase commit identity instead of normalizing it', async () => {
    const { envelope } = await fixture();
    const hostile = structuredClone(envelope);
    hostile.source.headSha = 'A'.repeat(40);
    expectCode(() => parseFederatedAgentRelayEnvelopeV31(hostile), 'relay_source_head_sha');
  });

  it('rejects duplicate raw JSON object names before parsing', async () => {
    const { envelope } = await fixture();
    const canonical = canonicalizeRelayJsonV31(envelope);
    const duplicate = canonical.replace('"messageId":', '"messageId":"11111111-1111-4111-8111-111111111111","messageId":');
    expectCode(() => parseCanonicalRelayJsonV31(duplicate), 'relay_json_duplicate_key');
  });

  it('requires canonical unpadded 64-byte Ed25519 signatures', async () => {
    const { envelope } = await fixture();
    const hostile = structuredClone(envelope);
    hostile.signature.valueBase64Url = `${hostile.signature.valueBase64Url}=`;
    expectCode(() => parseFederatedAgentRelayEnvelopeV31(hostile), 'relay_signature_base64url_invalid');
  });

  it('does not Unicode-normalize canonical strings', () => {
    expect(canonicalizeRelayJsonV31({ x: '\u00e9' })).not.toBe(canonicalizeRelayJsonV31({ x: 'e\u0301' }));
  });

  it('binds successor cookies to chain identity and the full delivery fingerprint', async () => {
    const { envelope } = await fixture();
    const delivery = await deliveryFingerprintV31(envelope);
    const first = await successorProofCookieV31(envelope, delivery);
    const other = structuredClone(envelope);
    other.ordering.chainId = '55555555-5555-4555-8555-555555555555';
    const second = await successorProofCookieV31(other, delivery);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^Q4R:v3\.1:[0-9a-f]{64}$/);
  });

  it('separates semantic and delivery fingerprints', async () => {
    const { envelope } = await fixture();
    const semantic = await semanticFingerprintV31(envelope);
    const delivery = await deliveryFingerprintV31(envelope);
    expect(semantic).toMatch(/^[0-9a-f]{64}$/);
    expect(delivery).toMatch(/^[0-9a-f]{64}$/);
    expect(semantic).not.toBe(delivery);
  });

  it('verifies signatures only while the source key is usable at issue and acceptance time', async () => {
    const { envelope, key, now } = await fixture();
    await expect(verifyRelayEnvelopeV31({ envelope, key, acceptedAt: now })).resolves.toMatchObject({ deliveryFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) });
    await expect(verifyRelayEnvelopeV31({ envelope, key: { ...key, validUntil: new Date(now.getTime() - 1).toISOString() }, acceptedAt: now })).rejects.toMatchObject({ code: 'relay_signing_key_not_current' });
  });

  it('receiver-signs immutable acceptance evidence without mutable current state', async () => {
    const { envelope, pair, key, now } = await fixture();
    const verified = await verifyRelayEnvelopeV31({ envelope, key, acceptedAt: now });
    const unsigned: FederatedRelayUnsignedReceiptV31 = {
      contract: FEDERATED_AGENT_RELAY_RECEIPT_V31,
      receiptId: '66666666-6666-4666-8666-666666666666',
      delivery: 'accepted', messageId: envelope.messageId,
      semanticFingerprint: verified.semanticFingerprint,
      deliveryFingerprint: verified.deliveryFingerprint,
      predecessorProofCookie: envelope.predecessorProofCookie,
      successorProofCookie: verified.successorProofCookie,
      sourceHeadSha: envelope.source.headSha, targetObservedHeadSha: envelope.target.headSha,
      sourceCommitEvidence: { repository: envelope.source.repository, branch: envelope.source.branch, headSha: envelope.source.headSha, state: 'reachable_at_acceptance', checkedAt: now.toISOString() },
      evidenceDigest: verified.evidenceDigest,
      acceptedKey: { member: key.member, keyId: key.keyId, stateAtAcceptance: 'active', validFrom: key.validFrom, validUntil: key.validUntil },
      acceptedAt: now.toISOString(), executionAuthorized: false, authorityTransferred: false, approvalCarriedForward: false,
      nextGate: 'local approval remains required',
      receiver: { ...envelope.target, keyId: key.keyId },
    };
    const receipt = await signRelayReceiptV31(unsigned, pair.privateKey, key.keyId);
    expect('currentState' in receipt).toBe(false);
    expect('supersededByMessageId' in receipt).toBe(false);
    await expect(verifyRelayReceiptV31(receipt, { ...key, member: 'chief-ai-machine' })).resolves.toBeUndefined();
  });
});
