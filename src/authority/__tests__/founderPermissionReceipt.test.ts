import { describe, expect, it } from 'vitest';

import { AUTHORITY_RECEIPT_V2_CONTRACT, type AuthorityReceiptV2ConsumptionStore } from '../authorityReceiptV2.js';
import {
  FOUNDER_PERMISSION_RECEIPT_CONTRACT,
  consumeFounderPermissionReceipt,
  validateFounderPermissionReceipt,
  type FounderPermissionDecisionSnapshot,
  type FounderPermissionReceipt,
} from '../founderPermissionReceipt.js';

const HEAD = '1'.repeat(40);
const BASE = '2'.repeat(40);
const DIGEST = `sha256:${'a'.repeat(64)}` as const;
const NOW = new Date('2026-08-25T03:55:00.000Z');

function receipt(overrides: Partial<FounderPermissionReceipt> = {}): FounderPermissionReceipt {
  return {
    contract: AUTHORITY_RECEIPT_V2_CONTRACT,
    permissionContract: FOUNDER_PERMISSION_RECEIPT_CONTRACT,
    id: 'founder-permission-1',
    subject: { repo: 'jussray/founder-control-room', headSha: HEAD, baseSha: BASE },
    issuer: { type: 'human', id: 'founder' },
    scope: ['merge:founder-control-room'],
    action: { type: 'merge', target: 'jussray/founder-control-room#999', digest: DIGEST },
    evidence: [
      { ref: `github:commit:${HEAD}`, class: 'repository' },
      { ref: 'fcr:founder-decision:decision-1', class: 'human-approval' },
    ],
    issuedAt: '2026-08-25T03:50:00.000Z',
    checkedAt: '2026-08-25T03:50:00.000Z',
    expiresAt: '2026-08-25T04:20:00.000Z',
    status: 'active',
    ...overrides,
  };
}

function decision(overrides: Partial<FounderPermissionDecisionSnapshot> = {}): FounderPermissionDecisionSnapshot {
  return {
    decisionId: 'decision-1',
    founderId: 'founder',
    subject: { repo: 'jussray/founder-control-room', headSha: HEAD, baseSha: BASE },
    scope: ['merge:founder-control-room'],
    action: { type: 'merge', target: 'jussray/founder-control-room#999', digest: DIGEST },
    expiresAt: '2026-08-25T04:20:00.000Z',
    decision: 'approved',
    ...overrides,
  };
}

class MemoryStore implements AuthorityReceiptV2ConsumptionStore {
  private readonly consumed = new Set<string>();
  claim(receiptId: string): boolean {
    if (this.consumed.has(receiptId)) return false;
    this.consumed.add(receiptId);
    return true;
  }
}

describe('FounderPermissionReceipt', () => {
  it('accepts only an explicit human founder receipt with human-approval evidence', () => {
    expect(validateFounderPermissionReceipt(receipt(), NOW).ok).toBe(true);
  });

  it('rejects an agent impersonating founder authority', () => {
    const forged = receipt({ issuer: { type: 'agent', id: 'founder' } as never });
    expect(validateFounderPermissionReceipt(forged, NOW)).toEqual({ ok: false, reason: 'invalid_founder_issuer' });
  });

  it('rejects a structurally valid receipt with no human-approval evidence', () => {
    const forged = receipt({ evidence: [{ ref: `github:commit:${HEAD}`, class: 'repository' }] });
    expect(validateFounderPermissionReceipt(forged, NOW)).toEqual({ ok: false, reason: 'missing_human_approval_evidence' });
  });

  it('requires exact authoritative founder-decision readback before one-time consumption', async () => {
    const store = new MemoryStore();
    const candidate = receipt();

    expect(await consumeFounderPermissionReceipt({
      receipt: candidate,
      currentAuthority: { readDecision: () => null },
      store,
      now: NOW,
    })).toEqual({ ok: false, reason: 'current_authority_rejected' });

    expect(await consumeFounderPermissionReceipt({
      receipt: candidate,
      currentAuthority: { readDecision: () => decision({ decisionId: 'forged-decision' }) },
      store,
      now: NOW,
    })).toEqual({ ok: false, reason: 'current_authority_rejected' });

    expect(await consumeFounderPermissionReceipt({
      receipt: candidate,
      currentAuthority: { readDecision: () => decision({ scope: ['merge:other-project'] }) },
      store,
      now: NOW,
    })).toEqual({ ok: false, reason: 'current_authority_rejected' });

    expect(await consumeFounderPermissionReceipt({
      receipt: candidate,
      currentAuthority: { readDecision: () => decision({
        subject: { repo: 'jussray/founder-control-room', headSha: '3'.repeat(40), baseSha: BASE },
      }) },
      store,
      now: NOW,
    })).toEqual({ ok: false, reason: 'current_authority_rejected' });

    expect(await consumeFounderPermissionReceipt({
      receipt: candidate,
      currentAuthority: { readDecision: () => decision({
        action: { type: 'merge', target: 'jussray/founder-control-room#999', digest: `sha256:${'b'.repeat(64)}` },
      }) },
      store,
      now: NOW,
    })).toEqual({ ok: false, reason: 'current_authority_rejected' });

    await expect(consumeFounderPermissionReceipt({
      receipt: candidate,
      currentAuthority: {
        readDecision: () => ({
          decisionId: 'decision-1',
          founderId: 'founder',
          subject: null,
          scope: ['merge:founder-control-room'],
          action: null,
          expiresAt: '2026-08-25T04:20:00.000Z',
          decision: 'approved',
        } as unknown as FounderPermissionDecisionSnapshot),
      },
      store,
      now: NOW,
    })).resolves.toEqual({ ok: false, reason: 'current_authority_rejected' });

    expect((await consumeFounderPermissionReceipt({
      receipt: candidate,
      currentAuthority: { readDecision: () => decision() },
      store,
      now: NOW,
    })).ok).toBe(true);

    expect(await consumeFounderPermissionReceipt({
      receipt: candidate,
      currentAuthority: { readDecision: () => decision() },
      store,
      now: NOW,
    })).toEqual({ ok: false, reason: 'already_consumed' });
  });
});
