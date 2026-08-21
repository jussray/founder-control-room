import { describe, expect, it } from 'vitest';

import {
  MAX_FOUNDER_RECEIPT_TTL_MS,
  consumeFounderReceipt,
  issueFounderReceipt,
  verifyFounderReceipt,
  type FounderReceiptConsumptionLedger,
  type FounderReceiptVerificationContext,
} from './founderReceiptKernel.js';

const SIGNING_KEY = 'test-founder-receipt-signing-key-32-bytes-minimum';
const HEAD_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const SCOPE_HASH = '1'.repeat(64);
const OTHER_SCOPE_HASH = '2'.repeat(64);
const EVIDENCE_REFS = ['evidence:independent-review', 'evidence:ci'];
const ISSUED_AT = '2026-08-21T06:00:00.000Z';
const EXPIRES_AT = '2026-08-21T06:15:00.000Z';
const NOW = '2026-08-21T06:05:00.000Z';

function receipt() {
  return issueFounderReceipt(
    {
      receiptId: 'receipt-001',
      decisionId: 'decision-001',
      founderIdentity: 'founder@example.com',
      action: 'merge',
      resource: 'jussray/founder-control-room#577',
      targetSha: HEAD_SHA,
      scopeHash: SCOPE_HASH,
      evidenceRefs: EVIDENCE_REFS,
      keyId: 'fcr-founder-receipt-test-key',
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    },
    SIGNING_KEY,
  );
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

class MemoryLedger implements FounderReceiptConsumptionLedger {
  private readonly consumed = new Set<string>();

  claim(receiptId: string): boolean {
    if (this.consumed.has(receiptId)) return false;
    this.consumed.add(receiptId);
    return true;
  }
}

describe('FounderReceiptKernel v1', () => {
  it('accepts and consumes one exact FCR-issued receipt', async () => {
    const ledger = new MemoryLedger();
    const result = await consumeFounderReceipt(receipt(), context(), SIGNING_KEY, ledger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt.action).toBe('merge');
      expect(result.receipt.targetSha).toBe(HEAD_SHA);
    }
  });

  it('rejects a forged or tampered receipt', () => {
    const forged = { ...receipt(), founderIdentity: 'attacker@example.com' };
    const result = verifyFounderReceipt(forged, context({ founderIdentity: 'attacker@example.com' }), SIGNING_KEY);

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_SIGNATURE_INVALID' });
  });

  it('rejects a receipt against a different exact target SHA', () => {
    const result = verifyFounderReceipt(receipt(), context({ targetSha: OTHER_SHA }), SIGNING_KEY);

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_SCOPE_MISMATCH' });
  });

  it('rejects action and scope escalation', () => {
    const wrongAction = verifyFounderReceipt(receipt(), context({ action: 'deploy' }), SIGNING_KEY);
    const wrongScope = verifyFounderReceipt(receipt(), context({ scopeHash: OTHER_SCOPE_HASH }), SIGNING_KEY);

    expect(wrongAction).toMatchObject({ ok: false, code: 'RECEIPT_SCOPE_MISMATCH' });
    expect(wrongScope).toMatchObject({ ok: false, code: 'RECEIPT_SCOPE_MISMATCH' });
  });

  it('rejects evidence substitution even when every other scope field matches', () => {
    const result = verifyFounderReceipt(
      receipt(),
      context({ evidenceRefs: ['evidence:ci', 'evidence:different-review'] }),
      SIGNING_KEY,
    );

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_SCOPE_MISMATCH' });
  });

  it('rejects an expired receipt', () => {
    const result = verifyFounderReceipt(
      receipt(),
      context({ now: '2026-08-21T06:15:00.000Z' }),
      SIGNING_KEY,
    );

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_EXPIRED' });
  });

  it('rejects a future-dated receipt before its issuance time', () => {
    const result = verifyFounderReceipt(
      receipt(),
      context({ now: '2026-08-21T05:59:59.000Z' }),
      SIGNING_KEY,
    );

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_NOT_YET_VALID' });
  });

  it('refuses to issue a receipt with a god-mode lifetime', () => {
    const expiresAt = new Date(Date.parse(ISSUED_AT) + MAX_FOUNDER_RECEIPT_TTL_MS + 1).toISOString();

    expect(() => issueFounderReceipt(
      {
        decisionId: 'decision-long-lived',
        founderIdentity: 'founder@example.com',
        action: 'merge',
        resource: 'jussray/founder-control-room#577',
        targetSha: HEAD_SHA,
        scopeHash: SCOPE_HASH,
        evidenceRefs: ['evidence:ci'],
        keyId: 'fcr-founder-receipt-test-key',
        issuedAt: ISSUED_AT,
        expiresAt,
      },
      SIGNING_KEY,
    )).toThrow(/no longer than/);
  });

  it('rejects replay after the first atomic claim', async () => {
    const ledger = new MemoryLedger();
    const first = await consumeFounderReceipt(receipt(), context(), SIGNING_KEY, ledger);
    const replay = await consumeFounderReceipt(receipt(), context(), SIGNING_KEY, ledger);

    expect(first.ok).toBe(true);
    expect(replay).toMatchObject({ ok: false, code: 'RECEIPT_REPLAYED' });
  });

  it('rejects unknown fields instead of accepting caller-defined authority metadata', () => {
    const attackerSupplied = { ...receipt(), approvedByAgent: 'claude' };
    const result = verifyFounderReceipt(attackerSupplied, context(), SIGNING_KEY);

    expect(result).toMatchObject({ ok: false, code: 'RECEIPT_INVALID' });
  });
});
