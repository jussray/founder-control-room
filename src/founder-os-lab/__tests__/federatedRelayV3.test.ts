import { describe, expect, it } from 'vitest';

import {
  FEDERATED_AGENT_RELAY_RECEIPT_V3,
  FEDERATED_AGENT_RELAY_V3,
  FEDERATED_AGENT_RELAY_V3_GENESIS_COOKIE,
  RelayErrorV3,
  RelayTransientErrorV3,
  assertImmutableRelayReceiptV3,
  assertV3RootStartsNewChain,
  decodeBase64UrlStrictV3,
  decodeEd25519SignatureStrictV3,
  mapRelayPostgresErrorV3,
  successorProofCookieV3,
  type FederatedAgentRelayEnvelopeV3,
} from '../federatedRelayV3.js';

function rootEnvelope(): FederatedAgentRelayEnvelopeV3 {
  return {
    contract: FEDERATED_AGENT_RELAY_V3,
    messageId: '11111111-1111-4111-8111-111111111111',
    ordering: {
      chainId: '22222222-2222-4222-8222-222222222222',
      sourceSequence: 1,
      chainPosition: 0,
      logicalOperationId: '33333333-3333-4333-8333-333333333333',
    },
    source: {
      member: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      branch: 'main',
      headSha: 'a'.repeat(40),
    },
    target: {
      member: 'chief-ai-machine',
      repository: 'jussray/chief-ai-machine',
      branch: 'main',
      headSha: 'b'.repeat(40),
    },
    issuedAt: '2026-09-13T15:00:00.000Z',
    expiresAt: '2026-09-13T15:05:00.000Z',
    nonce: '44444444-4444-4444-8444-444444444444',
    disposition: 'reconcile',
    subject: 'v3 freeze contract',
    payload: {
      contentType: 'application/json',
      body: '{"observation":"evidence only"}',
      sha256: 'c'.repeat(64),
    },
    contextFingerprint: 'd'.repeat(64),
    predecessorProofCookie: FEDERATED_AGENT_RELAY_V3_GENESIS_COOKIE,
    evidence: [],
    supersedesMessageIds: [],
    signature: {
      algorithm: 'Ed25519',
      keyId: 'fcr-key-2026-09',
      valueBase64Url: 'A'.repeat(86),
    },
  };
}

describe('federated relay v3 freeze invariants', () => {
  it('keeps mutable state outside the immutable acceptance receipt', () => {
    const receipt = {
      contract: FEDERATED_AGENT_RELAY_RECEIPT_V3,
      receiptId: '55555555-5555-4555-8555-555555555555',
      delivery: 'accepted',
      messageId: '11111111-1111-4111-8111-111111111111',
      semanticFingerprint: 'a'.repeat(64),
      deliveryFingerprint: 'b'.repeat(64),
      predecessorProofCookie: FEDERATED_AGENT_RELAY_V3_GENESIS_COOKIE,
      successorProofCookie: `Q4R:v3:${'c'.repeat(64)}`,
      sourceHeadSha: 'a'.repeat(40),
      targetObservedHeadSha: 'b'.repeat(40),
      sourceCommitEvidence: {
        repository: 'jussray/founder-control-room',
        branch: 'main',
        headSha: 'a'.repeat(40),
        state: 'reachable_at_acceptance',
        checkedAt: '2026-09-13T15:00:00.000Z',
      },
      evidenceDigest: 'd'.repeat(64),
      acceptedKey: {
        member: 'founder-control-room',
        keyId: 'fcr-key-2026-09',
        stateAtAcceptance: 'active',
        validFrom: '2026-09-01T00:00:00.000Z',
        validUntil: null,
      },
      acceptedAt: '2026-09-13T15:00:01.000Z',
      executionAuthorized: false,
      authorityTransferred: false,
      approvalCarriedForward: false,
      nextGate: 'Local authority remains required.',
      receiver: {
        member: 'chief-ai-machine',
        repository: 'jussray/chief-ai-machine',
        branch: 'main',
        headSha: 'b'.repeat(40),
        keyId: 'chief-key-2026-09',
      },
      signature: {
        algorithm: 'Ed25519',
        keyId: 'chief-key-2026-09',
        valueBase64Url: 'A'.repeat(86),
      },
    } as const;

    expect(() => assertImmutableRelayReceiptV3(receipt)).not.toThrow();
    expect(() => assertImmutableRelayReceiptV3({ ...receipt, currentState: 'superseded' }))
      .toThrowError(new RelayErrorV3('relay_receipt_contains_mutable_state'));
    expect(() => assertImmutableRelayReceiptV3({ ...receipt, supersededByMessageId: receipt.messageId }))
      .toThrowError(new RelayErrorV3('relay_receipt_contains_mutable_state'));
  });

  it('binds successor cookies to the chain with protocol-specific domain separation', async () => {
    const common = {
      predecessorProofCookie: FEDERATED_AGENT_RELAY_V3_GENESIS_COOKIE,
      deliveryFingerprint: 'a'.repeat(64),
      nonce: '44444444-4444-4444-8444-444444444444',
      sourceMember: 'founder-control-room',
      targetMember: 'chief-ai-machine',
    };

    const first = await successorProofCookieV3({
      ...common,
      chainId: '22222222-2222-4222-8222-222222222222',
    });
    const second = await successorProofCookieV3({
      ...common,
      chainId: '99999999-9999-4999-8999-999999999999',
    });

    expect(first).toMatch(/^Q4R:v3:[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
  });

  it('requires strict unpadded base64url and exactly 64 Ed25519 signature bytes', () => {
    expect(() => decodeBase64UrlStrictV3('abc+def')).toThrowError(
      new RelayErrorV3('relay_signature_base64url_invalid'),
    );
    expect(() => decodeBase64UrlStrictV3('abc=')).toThrowError(
      new RelayErrorV3('relay_signature_base64url_invalid'),
    );

    const sixtyFourBytes = new Uint8Array(64);
    const raw = String.fromCharCode(...sixtyFourBytes);
    const base64url = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    expect(decodeEd25519SignatureStrictV3(base64url)).toHaveLength(64);

    const short = btoa(String.fromCharCode(...new Uint8Array(63)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    expect(() => decodeEd25519SignatureStrictV3(short)).toThrowError(
      new RelayErrorV3('relay_signature_length_invalid'),
    );
  });

  it('requires v3 migration/reconciliation roots to start a new chain at genesis', () => {
    expect(() => assertV3RootStartsNewChain(rootEnvelope())).not.toThrow();

    const continued = rootEnvelope();
    continued.replyToMessageId = '66666666-6666-4666-8666-666666666666';
    continued.ordering.predecessorMessageId = continued.replyToMessageId;
    continued.ordering.chainPosition = 1;
    continued.predecessorProofCookie = `Q4R:v2:${'e'.repeat(64)}`;

    expect(() => assertV3RootStartsNewChain(continued)).toThrowError(
      new RelayErrorV3('relay_v3_root_must_start_new_chain'),
    );
  });

  it('maps database deadlock and serialization conflicts to retryable transport errors', () => {
    expect(() => mapRelayPostgresErrorV3({ code: '40P01' })).toThrowError(
      new RelayTransientErrorV3('relay_deadlock_retry'),
    );
    expect(() => mapRelayPostgresErrorV3({ code: '40001' })).toThrowError(
      new RelayTransientErrorV3('relay_serialization_retry'),
    );

    const original = new Error('constraint failure');
    expect(() => mapRelayPostgresErrorV3(original)).toThrow(original);
  });
});
