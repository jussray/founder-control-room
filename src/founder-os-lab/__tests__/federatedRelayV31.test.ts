import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FEDERATED_AGENT_RELAY_V31,
  GENESIS_PROOF_COOKIE_V31,
  RelayV31Error,
  type FederatedAgentRelayEnvelopeV31,
  type RelayLedgerAcceptInputV31,
  type RelayLedgerV31,
  type StoredRelayDeliveryV31,
} from '../federatedRelay/v31-types.js';
import { canonicalizeRelayJcsV31 } from '../federatedRelay/jcs.js';
import {
  assertFederatedRelayEnvelopeV31,
  validateRelayFreshnessV31,
} from '../federatedRelay/validation.js';
import {
  decodeBase64UrlV31,
  relaySuccessorProofCookieV31,
  sha256HexV31,
} from '../federatedRelay/crypto.js';
import { acceptFederatedRelayV31 } from '../federatedRelay/accept.js';
import { generateRelayAttack6000V31 } from '../federatedRelay/redteam.js';

const FCR_SHA = 'a'.repeat(40);
const CHIEF_SHA = 'b'.repeat(40);
const NOW = Date.parse('2026-09-13T15:01:00.000Z');
const VALID_SIGNATURE = Buffer.alloc(64).toString('base64url');

function envelope(overrides: Partial<FederatedAgentRelayEnvelopeV31> = {}): FederatedAgentRelayEnvelopeV31 {
  const body = '{"note":"hello"}';
  return {
    contract: FEDERATED_AGENT_RELAY_V31,
    messageId: '11111111-1111-4111-8111-111111111111',
    ordering: {
      chainId: '33333333-3333-4333-8333-333333333333',
      sourceSequence: 0,
      chainPosition: 0,
      logicalOperationId: '44444444-4444-4444-8444-444444444444',
      relation: { type: 'root' },
    },
    source: {
      member: 'founder-control-room',
      repository: 'jussray/founder-control-room',
      branch: 'main',
      headSha: FCR_SHA,
    },
    target: {
      member: 'chief-ai-machine',
      repository: 'jussray/chief-ai-machine',
      branch: 'main',
      headSha: CHIEF_SHA,
    },
    issuedAt: '2026-09-13T15:00:00.000Z',
    expiresAt: '2026-09-13T15:04:00.000Z',
    nonce: '22222222-2222-4222-8222-222222222222',
    disposition: 'observe',
    subject: 'v3.1 evidence handoff',
    payload: {
      contentType: 'application/json',
      body,
      sha256: sha256HexV31(body),
    },
    contextFingerprint: 'c'.repeat(64),
    predecessorProofCookie: GENESIS_PROOF_COOKIE_V31,
    evidence: [
      {
        locator: { provider: 'github', ref: `jussray/founder-control-room@${FCR_SHA}` },
        state: 'verified',
      },
    ],
    supersedesMessageIds: [],
    signature: {
      algorithm: 'Ed25519',
      keyId: 'fcr-ed25519-2026-09',
      valueBase64Url: VALID_SIGNATURE,
    },
    ...overrides,
  };
}

class MemoryLedger implements RelayLedgerV31 {
  stored: StoredRelayDeliveryV31 | null = null;
  acceptCalls = 0;

  async findByMessageId(messageId: string): Promise<StoredRelayDeliveryV31 | null> {
    return this.stored?.messageId === messageId ? this.stored : null;
  }

  async accept(input: RelayLedgerAcceptInputV31) {
    this.acceptCalls += 1;
    if (!this.stored) {
      this.stored = {
        messageId: input.envelope.messageId,
        semanticFingerprint: input.semanticFingerprint,
        deliveryFingerprint: input.deliveryFingerprint,
        receipt: input.receipt,
        currentState: 'accepted',
        supersededByMessageId: null,
      };
      return {
        outcome: 'accepted' as const,
        receipt: input.receipt,
        currentState: 'accepted' as const,
        supersededByMessageId: null,
      };
    }
    return {
      outcome: 'duplicate' as const,
      receipt: this.stored.receipt,
      currentState: this.stored.currentState,
      supersededByMessageId: this.stored.supersededByMessageId,
    };
  }
}

function dependencies(ledger: MemoryLedger, counters: { verify: number; sign: number }, reachable = true) {
  return {
    localIdentity: {
      member: 'chief-ai-machine' as const,
      repository: 'jussray/chief-ai-machine',
      branch: 'main',
      currentHeadSha: CHIEF_SHA,
    },
    sourceEvidence: {
      commitExists: async () => true,
      isCommitReachableFromBranch: async () => reachable,
    },
    signatureVerifier: {
      verify: async (input: { signature: Uint8Array }) => {
        counters.verify += 1;
        if (input.signature.some((byte) => byte !== 0)) throw new RelayV31Error('relay_signature_invalid');
        return {
          member: 'founder-control-room' as const,
          keyId: 'fcr-ed25519-2026-09',
          state: 'active' as const,
          validFrom: '2026-09-01T00:00:00.000Z',
          validUntil: null,
        };
      },
    },
    receiptSigner: {
      sign: async () => {
        counters.sign += 1;
        return {
          algorithm: 'Ed25519' as const,
          keyId: 'chief-ed25519-2026-09',
          valueBase64Url: VALID_SIGNATURE,
        };
      },
    },
    ledger,
    now: NOW,
  };
}

describe('federated relay v3.1 canonicalization', () => {
  it('matches the RFC 8785 primitive ordering and number vectors used by the relay', () => {
    expect(canonicalizeRelayJcsV31({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
    expect(canonicalizeRelayJcsV31({
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 1e-27],
    })).toBe('{"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}');
    expect(canonicalizeRelayJcsV31('€')).toBe('"€"');
    expect(canonicalizeRelayJcsV31('e\u0301')).not.toBe(canonicalizeRelayJcsV31('é'));
  });

  it('rejects inputs that are not safe JCS/I-JSON values', () => {
    expect(() => canonicalizeRelayJcsV31('\ud800')).toThrowError(/relay_jcs_lone_surrogate/);
    expect(() => canonicalizeRelayJcsV31(Number.NaN)).toThrowError(/relay_jcs_nonfinite/);
    expect(() => canonicalizeRelayJcsV31(Number.POSITIVE_INFINITY)).toThrowError(/relay_jcs_nonfinite/);
    expect(() => canonicalizeRelayJcsV31(new Date())).toThrowError(/relay_jcs_nonplain_object/);
    expect(() => canonicalizeRelayJcsV31({ bad: undefined })).toThrowError(/relay_jcs_undefined_prop/);
  });
});

describe('federated relay v3.1 validation', () => {
  it('accepts the strict UUID/root shape and inert authority-like JSON data', () => {
    const candidate = envelope({
      payload: {
        contentType: 'application/json',
        body: '{"approval":true,"execute":true,"ignore_previous_rules":true}',
        sha256: sha256HexV31('{"approval":true,"execute":true,"ignore_previous_rules":true}'),
      },
    });
    expect(() => assertFederatedRelayEnvelopeV31(candidate)).not.toThrow();
  });

  it('rejects UUID mismatches, non-genesis roots, invalid JSON, and bad signature length', () => {
    expect(() => assertFederatedRelayEnvelopeV31(envelope({ messageId: 'not-a-uuid' }))).toThrowError(/relay_message_id/);
    expect(() => assertFederatedRelayEnvelopeV31(envelope({ predecessorProofCookie: 'Q4R:v3.1:not-genesis' }))).toThrowError(/relay_root_cookie_not_genesis/);
    const invalidJson = envelope({
      payload: { contentType: 'application/json', body: '{', sha256: sha256HexV31('{') },
    });
    expect(() => assertFederatedRelayEnvelopeV31(invalidJson)).toThrowError(/relay_payload_not_json/);
    expect(() => decodeBase64UrlV31('AA')).toThrowError(/relay_signature_length_invalid/);
  });

  it('keeps supersession exclusive to revision relations', () => {
    const invalid = envelope({
      supersedesMessageIds: ['55555555-5555-4555-8555-555555555555'],
    });
    expect(() => assertFederatedRelayEnvelopeV31(invalid)).toThrowError(/relay_supersession_requires_revision/);
  });
});

describe('federated relay v3.1 acceptance', () => {
  it('authenticates exact retries but signs and persists only the original receipt', async () => {
    const ledger = new MemoryLedger();
    const counters = { verify: 0, sign: 0 };
    const first = await acceptFederatedRelayV31(envelope(), dependencies(ledger, counters));
    expect(first.outcome).toBe('accepted');
    expect(counters).toEqual({ verify: 1, sign: 1 });

    if (!ledger.stored) throw new Error('missing stored relay');
    const originalReceiptId = ledger.stored.receipt.receiptId;
    ledger.stored.currentState = 'superseded';
    ledger.stored.supersededByMessageId = '55555555-5555-4555-8555-555555555555';

    const duplicate = await acceptFederatedRelayV31(envelope(), dependencies(ledger, counters));
    expect(duplicate.outcome).toBe('duplicate');
    expect(duplicate.receipt.receiptId).toBe(originalReceiptId);
    expect(duplicate.currentState).toBe('superseded');
    expect(duplicate.supersededByMessageId).toBe('55555555-5555-4555-8555-555555555555');
    expect('currentState' in duplicate.receipt).toBe(false);
    expect(counters).toEqual({ verify: 2, sign: 1 });
    expect(ledger.acceptCalls).toBe(1);
  });

  it('rejects a forged retry before returning the stored receipt', async () => {
    const ledger = new MemoryLedger();
    const counters = { verify: 0, sign: 0 };
    await acceptFederatedRelayV31(envelope(), dependencies(ledger, counters));
    const forged = envelope({
      signature: {
        algorithm: 'Ed25519',
        keyId: 'fcr-ed25519-2026-09',
        valueBase64Url: Buffer.alloc(64, 1).toString('base64url'),
      },
    });
    await expect(acceptFederatedRelayV31(forged, dependencies(ledger, counters))).rejects.toThrowError(/relay_signature_invalid/);
  });

  it('records a historical source commit that exists but is no longer branch-reachable', async () => {
    const ledger = new MemoryLedger();
    const counters = { verify: 0, sign: 0 };
    const result = await acceptFederatedRelayV31(envelope(), dependencies(ledger, counters, false));
    expect(result.receipt.sourceCommitEvidence.state).toBe('exists_not_currently_reachable');
  });

  it('domain-separates successor cookies by chain and full signed delivery', () => {
    const base = {
      predecessorProofCookie: GENESIS_PROOF_COOKIE_V31,
      deliveryFingerprint: 'd'.repeat(64),
      nonce: '22222222-2222-4222-8222-222222222222',
      sourceMember: 'founder-control-room',
      targetMember: 'chief-ai-machine',
    };
    const first = relaySuccessorProofCookieV31({ ...base, chainId: '33333333-3333-4333-8333-333333333333' });
    const otherChain = relaySuccessorProofCookieV31({ ...base, chainId: '66666666-6666-4666-8666-666666666666' });
    const otherDelivery = relaySuccessorProofCookieV31({
      ...base,
      chainId: '33333333-3333-4333-8333-333333333333',
      deliveryFingerprint: 'e'.repeat(64),
    });
    expect(first).toMatch(/^Q4R:v3\.1:[0-9a-f]{64}$/);
    expect(first).not.toBe(otherChain);
    expect(first).not.toBe(otherDelivery);
  });
});

describe('federated relay v3.1 ATTACK-6000', () => {
  it('rejects 6,000 deterministic malformed/freshness permutations', () => {
    let count = 0;
    for (const attack of generateRelayAttack6000V31(envelope())) {
      count += 1;
      expect(() => {
        assertFederatedRelayEnvelopeV31(attack.envelope);
        validateRelayFreshnessV31(attack.envelope, NOW);
      }, attack.name).toThrow();
    }
    expect(count).toBe(6000);
  });
});

describe('federated relay v3.1 migration contract', () => {
  const sql = readFileSync(
    new URL('../../../supabase/migrations/20260913120000_federated_relay_v31.sql', import.meta.url),
    'utf8',
  );

  it('keeps one durable truth plane, immutable receipts, strict cursors, and service-role-only invocation', () => {
    expect(sql).toContain('create table if not exists public.federated_relay_source_cursors');
    expect(sql).toContain('create table if not exists public.federated_relay_chain_cursors');
    expect(sql).toContain('create table if not exists public.federated_relay_outbox');
    expect(sql).toContain('receipt_id uuid not null unique');
    expect(sql).toContain('unique (source_member, source_key_id, nonce)');
    expect(sql).toContain('p_source_sequence <> source_cursor.last_sequence + 1');
    expect(sql).toContain('p_chain_position <> chain_cursor.last_position + 1');
    expect(sql).toContain("security invoker\nset search_path = ''");
    expect(sql).toContain('grant execute on function public.federated_relay_accept_v31');
    expect(sql).toContain('to service_role');
  });

  it('pins source-cursor-before-chain-cursor lock order and live state outside the signed receipt', () => {
    const sourceLock = sql.indexOf('select c.* into source_cursor');
    const chainLock = sql.indexOf('select c.* into chain_cursor');
    const parentLock = sql.indexOf('select m.* into parent_record');
    expect(sourceLock).toBeGreaterThan(-1);
    expect(chainLock).toBeGreaterThan(sourceLock);
    expect(parentLock).toBeGreaterThan(chainLock);
    expect(sql).toContain('existing_record.status');
    expect(sql).toContain('existing_record.superseded_by_message_id');
  });
});
