import { describe, expect, it } from 'vitest';

import {
  AUTHORITY_RECEIPT_V2_CONTRACT,
  consumeAuthorityReceiptV2,
  validateAuthorityReceiptV2,
  type AuthorityReceiptV2,
  type AuthorityReceiptV2ConsumptionStore,
} from '../authorityReceiptV2.js';

const HEAD = '1'.repeat(40);
const BASE = '2'.repeat(40);
const DIGEST = `sha256:${'a'.repeat(64)}` as const;
const VALID_NOW = new Date('2026-08-23T20:30:00.000Z');

function receipt(overrides: Partial<AuthorityReceiptV2> = {}): AuthorityReceiptV2 {
  return {
    contract: AUTHORITY_RECEIPT_V2_CONTRACT,
    id: 'receipt-1',
    subject: { repo: 'jussray/founder-control-room', headSha: HEAD, baseSha: BASE },
    issuer: { type: 'human', id: 'founder' },
    scope: ['merge:founder-control-room'],
    action: { type: 'merge', target: 'jussray/founder-control-room#999', digest: DIGEST },
    evidence: [
      { ref: `github:commit:${HEAD}`, class: 'repository' },
      { ref: 'github:check:quality-gate', class: 'ci' },
    ],
    issuedAt: '2026-08-23T20:00:00.000Z',
    checkedAt: '2026-08-23T20:00:00.000Z',
    expiresAt: '2026-08-23T21:00:00.000Z',
    status: 'active',
    ...overrides,
  };
}

class MemoryStore implements AuthorityReceiptV2ConsumptionStore {
  readonly consumed = new Map<string, string>();

  claim(receiptId: string, consumedAt: string): boolean {
    if (this.consumed.has(receiptId)) return false;
    this.consumed.set(receiptId, consumedAt);
    return true;
  }
}

describe('AuthorityReceipt v2', () => {
  it('accepts a bounded active receipt for an exact repo head and base', () => {
    expect(validateAuthorityReceiptV2(receipt(), VALID_NOW).ok).toBe(true);
  });

  it('rejects expired and non-exact subject identity', () => {
    expect(validateAuthorityReceiptV2(receipt(), new Date('2026-08-23T21:00:00.000Z')))
      .toEqual({ ok: false, reason: 'expired' });
    expect(validateAuthorityReceiptV2(receipt({ subject: {
      repo: 'jussray/founder-control-room', headSha: 'not-a-sha', baseSha: BASE,
    } }), VALID_NOW)).toEqual({ ok: false, reason: 'invalid_subject' });
  });

  it('rejects receipts carrying revocation or supersession markers as active', () => {
    expect(validateAuthorityReceiptV2(receipt({ revokedAt: '2026-08-23T20:10:00.000Z' }), VALID_NOW))
      .toEqual({ ok: false, reason: 'revocation_incomplete' });
    expect(validateAuthorityReceiptV2(receipt({ supersededBy: 'receipt-2' }), VALID_NOW))
      .toEqual({ ok: false, reason: 'supersession_incomplete' });
  });

  it('revalidates current authority immediately before consumption', async () => {
    const store = new MemoryStore();
    const result = await consumeAuthorityReceiptV2({
      receipt: receipt(),
      currentAuthority: { revalidate: (candidate) => candidate.subject.headSha === HEAD },
      store,
      now: VALID_NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.receipt.status).toBe('consumed');
    expect(store.consumed.get('receipt-1')).toBe('2026-08-23T20:30:00.000Z');
  });

  it('fails closed when current authority rejects the receipt', async () => {
    expect(await consumeAuthorityReceiptV2({
      receipt: receipt(), currentAuthority: { revalidate: () => false }, store: new MemoryStore(), now: VALID_NOW,
    })).toEqual({ ok: false, reason: 'current_authority_rejected' });
  });

  it('uses an atomic store claim as the replay boundary', async () => {
    const store = new MemoryStore();
    const currentAuthority = { revalidate: () => true };
    expect((await consumeAuthorityReceiptV2({ receipt: receipt(), currentAuthority, store, now: VALID_NOW })).ok).toBe(true);
    expect(await consumeAuthorityReceiptV2({
      receipt: receipt(), currentAuthority, store, now: new Date('2026-08-23T20:31:00.000Z'),
    })).toEqual({ ok: false, reason: 'already_consumed' });
  });

  it('allows only one winner under concurrent consumption attempts', async () => {
    const store = new MemoryStore();
    const currentAuthority = { revalidate: async () => true };
    const [first, second] = await Promise.all([
      consumeAuthorityReceiptV2({ receipt: receipt(), currentAuthority, store, now: VALID_NOW }),
      consumeAuthorityReceiptV2({ receipt: receipt(), currentAuthority, store, now: VALID_NOW }),
    ]);
    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    expect([first, second].filter((result) => !result.ok && result.reason === 'already_consumed')).toHaveLength(1);
  });
});
