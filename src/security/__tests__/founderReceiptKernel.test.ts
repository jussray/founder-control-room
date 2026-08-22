import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_FOUNDER_RECEIPT_TTL_MS,
  consumeFounderReceipt,
  issueFounderReceipt,
  verifyFounderReceipt,
  type FounderReceiptAuthorityResolver,
  type FounderReceiptAuthoritySnapshot,
  type FounderReceiptConsumptionLedger,
  type FounderReceiptIssueInput,
  type FounderReceiptSigner,
  type FounderReceiptVerificationContext,
} from '../founderReceiptKernel.js';

const SIGNING_KEY = 'test-founder-receipt-signing-key-32-bytes-minimum';
const SIGNER: FounderReceiptSigner = {
  keyId: 'fcr-founder-receipt-test-key',
  signingKey: SIGNING_KEY,
};
const HEAD_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const SCOPE_HASH = '1'.repeat(64);
const OTHER_SCOPE_HASH = '2'.repeat(64);
const EVIDENCE_REFS = ['evidence:independent-review', 'evidence:ci'];
const ISSUED_AT = '2026-08-21T06:00:00.000Z';
const EXPIRES_AT = '2026-08-21T06:15:00.000Z';
const NOW = '2026-08-21T06:05:00.000Z';

function issueInput(overrides: Partial<FounderReceiptIssueInput> = {}): FounderReceiptIssueInput {
  return {
    receiptId: 'receipt-001',
    decisionId: 'decision-001',
    founderIdentity: 'founder@example.com',
    action: 'merge',
    resource: 'jussray/founder-control-room#577',
    targetSha: HEAD_SHA,
    scopeHash: SCOPE_HASH,
    evidenceRefs: EVIDENCE_REFS,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function receipt() {
  return issueFounderReceipt(issueInput(), SIGNER);
}

function context(overrides: Partial<FounderReceiptVerificationContext> = {}): FounderReceiptVerificationContext {
  return {
    decisionId: 'decision-001',
    founderIdentity: 'founder@example.com',
    action: 'merge',
    resource: 'jussray/founder-control-room#577',
    targetSha: HEAD_SHA,
    scopeHash: SCOPE_HASH,
    evidenceRefs: EVIDENCE_REFS,
    now: NOW,
    ...overrides,
  };
}

function authoritySnapshot(overrides: Partial<FounderReceiptAuthoritySnapshot> = {}): FounderReceiptAuthoritySnapshot {
  return {
    targetSha: HEAD_SHA,
    scopeHash: SCOPE_HASH,
    evidenceRefs: EVIDENCE_REFS,
    ...overrides,
  };
}

function authorityResolver(
  snapshot: FounderReceiptAuthoritySnapshot = authoritySnapshot(),
): FounderReceiptAuthorityResolver {
  return { resolve: () => snapshot };
}

class MemoryLedger implements FounderReceiptConsumptionLedger {
  private readonly consumed = new Set<string>();

  claim(receiptId: string): boolean {
    if (this.consumed.has(receiptId)) return false;
    this.consumed.add(receiptId);
    return true;
  }
}

describe('FounderReceiptKernel v1', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(ISSUED_AT));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts and consumes one exact FCR-issued receipt when live authority still matches', async () => {
    const ledger = new MemoryLedger();
    const result = await consumeFounderReceipt(receipt(), context(), SIGNER, ledger, authorityResolver());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt.action).toBe('merge');
      expect(result.receipt.targetSha).toBe(HEAD_SHA);
      expect(result.receipt.issuedAt).toBe(ISSUED_AT);
      expect(result.receipt.keyId).toBe(SIGNER.keyId);
    }
  });

  it('rejects a forged or tampered receipt', () => {
    const forged = { ...receipt(), founderIdentity: 'attacker@example.com' };
    const result = verifyFounderReceipt(forged, context({ founderIdentity: 'attacker@example.com' }), SIGNER);

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_SIGNATURE_INVALID' });
  });

  it('rejects a receipt against a different exact target SHA', () => {
    const result = verifyFounderReceipt(receipt(), context({ targetSha: OTHER_SHA }), SIGNER);

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_SCOPE_MISMATCH' });
  });

  it('rejects action and scope escalation', () => {
    const wrongAction = verifyFounderReceipt(receipt(), context({ action: 'deploy' }), SIGNER);
    const wrongScope = verifyFounderReceipt(receipt(), context({ scopeHash: OTHER_SCOPE_HASH }), SIGNER);

    expect(wrongAction).toMatchObject({ ok: false, code: 'RECEIPT_SCOPE_MISMATCH' });
    expect(wrongScope).toMatchObject({ ok: false, code: 'RECEIPT_SCOPE_MISMATCH' });
  });

  it('rejects evidence substitution even when every other scope field matches', () => {
    const result = verifyFounderReceipt(
      receipt(),
      context({ evidenceRefs: ['evidence:ci', 'evidence:different-review'] }),
      SIGNER,
    );

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_SCOPE_MISMATCH' });
  });

  it('rejects an expired receipt', () => {
    const result = verifyFounderReceipt(
      receipt(),
      context({ now: '2026-08-21T06:15:00.000Z' }),
      SIGNER,
    );

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_EXPIRED' });
  });

  it('rejects a future-dated receipt before its issuance time', () => {
    const futureDated = { ...receipt(), issuedAt: '2026-08-21T06:10:00.000Z' };
    const result = verifyFounderReceipt(futureDated, context(), SIGNER);

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_SIGNATURE_INVALID' });
  });

  it('does not let caller input choose a future issuance time', () => {
    const untrusted = {
      ...issueInput(),
      issuedAt: '2030-01-01T00:00:00.000Z',
    } as unknown as FounderReceiptIssueInput;

    const result = issueFounderReceipt(untrusted, SIGNER);

    expect(result.issuedAt).toBe(ISSUED_AT);
    expect(result.expiresAt).toBe(EXPIRES_AT);
  });

  it('refuses to issue a receipt with a god-mode lifetime', () => {
    const expiresAt = new Date(Date.parse(ISSUED_AT) + MAX_FOUNDER_RECEIPT_TTL_MS + 1).toISOString();

    expect(() => issueFounderReceipt(issueInput({
      decisionId: 'decision-long-lived',
      evidenceRefs: ['evidence:ci'],
      expiresAt,
    }), SIGNER)).toThrow(/no longer than/);
  });

  it('binds receipt key identity to the trusted signer configuration', () => {
    const wrongKeyIdentity: FounderReceiptSigner = {
      keyId: 'fcr-founder-receipt-other-key',
      signingKey: SIGNING_KEY,
    };

    const result = verifyFounderReceipt(receipt(), context(), wrongKeyIdentity);

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_KEY_MISMATCH' });
  });

  it('expires authorization when the live target moves even though the receipt remains cryptographically valid', async () => {
    const ledger = new MemoryLedger();
    const exactReceipt = receipt();

    expect(verifyFounderReceipt(exactReceipt, context(), SIGNER).ok).toBe(true);

    const stale = await consumeFounderReceipt(
      exactReceipt,
      context(),
      SIGNER,
      ledger,
      authorityResolver(authoritySnapshot({ targetSha: OTHER_SHA })),
    );
    expect(stale).toMatchObject({ ok: false, code: 'RECEIPT_AUTHORITY_EXPIRED' });

    const fresh = await consumeFounderReceipt(exactReceipt, context(), SIGNER, ledger, authorityResolver());
    expect(fresh.ok).toBe(true);
  });

  it('expires authorization when live scope or evidence authority changes', async () => {
    const changedScope = await consumeFounderReceipt(
      receipt(),
      context(),
      SIGNER,
      new MemoryLedger(),
      authorityResolver(authoritySnapshot({ scopeHash: OTHER_SCOPE_HASH })),
    );
    const changedEvidence = await consumeFounderReceipt(
      receipt(),
      context(),
      SIGNER,
      new MemoryLedger(),
      authorityResolver(authoritySnapshot({ evidenceRefs: ['evidence:ci', 'evidence:new-review'] })),
    );

    expect(changedScope).toMatchObject({ ok: false, code: 'RECEIPT_AUTHORITY_EXPIRED' });
    expect(changedEvidence).toMatchObject({ ok: false, code: 'RECEIPT_AUTHORITY_EXPIRED' });
  });

  it('fails closed when current authority cannot be resolved', async () => {
    const unavailable: FounderReceiptAuthorityResolver = {
      resolve: () => {
        throw new Error('provider unavailable');
      },
    };

    const result = await consumeFounderReceipt(receipt(), context(), SIGNER, new MemoryLedger(), unavailable);

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_AUTHORITY_UNAVAILABLE' });
  });

  it('rejects replay after the first atomic claim', async () => {
    const ledger = new MemoryLedger();
    const first = await consumeFounderReceipt(receipt(), context(), SIGNER, ledger, authorityResolver());
    const replay = await consumeFounderReceipt(receipt(), context(), SIGNER, ledger, authorityResolver());

    expect(first.ok).toBe(true);
    expect(replay).toMatchObject({ ok: false, code: 'RECEIPT_REPLAYED' });
  });

  it('rejects unknown fields instead of accepting caller-defined authority metadata', () => {
    const attackerSupplied = { ...receipt(), approvedByAgent: 'claude' };
    const result = verifyFounderReceipt(attackerSupplied, context(), SIGNER);

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_INVALID' });
  });
});
