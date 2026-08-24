import { describe, expect, it } from 'vitest';
import {
  createFounderDecisionReceipt,
  validateCapabilityRequestDecisionBinding,
  validateFounderDecisionReceipt,
} from '../founderDecisionReceipt.js';
import {
  CAPABILITY_REQUEST_CONTRACT,
  type CapabilityRequestV1,
} from '../capabilityExecutionContracts.js';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const HASH = 'c'.repeat(64);
const NOW = Date.parse('2026-08-24T23:00:00.000Z');

function decision() {
  return createFounderDecisionReceipt({
    actor: { type: 'founder', id: 'jussray' },
    decision: 'authorize',
    action: 'merge-code',
    capabilityPlanHash: HASH,
    expectedHeadSha: SHA,
    evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
    createdAt: '2026-08-24T22:55:00.000Z',
    expiresAt: '2099-08-24T23:55:00.000Z',
  }, NOW);
}

function request(policyDecisionId: string): CapabilityRequestV1 {
  return {
    contract: CAPABILITY_REQUEST_CONTRACT,
    goalId: 'goal-authority-1',
    runId: 'run-authority-1',
    attemptId: 'attempt-authority-1',
    traceId: 'trace-authority-1',
    expectedHeadSha: SHA,
    capability: 'repo.inspect',
    capabilityVersion: 'v1',
    capabilityPlanHash: HASH,
    registryHash: HASH,
    policyDecisionId,
    policyVersion: 'founder-decision-v0',
    idempotencyKey: 'idem-authority-1',
    retryOwner: 'workflow',
    timeoutMs: 30_000,
    args: {},
  };
}

describe('FounderDecisionReceiptV0', () => {
  it('creates a canonical founder authority receipt bound to exact state', () => {
    const receipt = decision();
    expect(receipt.actor).toEqual({ type: 'founder', id: 'jussray' });
    expect(receipt.expectedHeadSha).toBe(SHA);
    expect(receipt.capabilityPlanHash).toBe(HASH);
    expect(receipt.receiptId).toMatch(/^fcr-founder-decision-v0:[0-9a-f]{64}$/);
    expect(validateFounderDecisionReceipt(receipt, NOW)).toEqual([]);
  });

  it('requires evidence for mutation authorization', () => {
    expect(() => createFounderDecisionReceipt({
      actor: { type: 'founder', id: 'jussray' },
      decision: 'authorize',
      action: 'deploy-code',
      capabilityPlanHash: HASH,
      expectedHeadSha: SHA,
      evidenceUrls: [],
      createdAt: '2026-08-24T22:55:00.000Z',
    }, NOW)).toThrow('mutation decisions require evidence URLs');
  });

  it('binds a capability request to the exact founder decision receipt', () => {
    const receipt = decision();
    expect(validateCapabilityRequestDecisionBinding(request(receipt.receiptId), receipt, NOW)).toEqual([]);
  });

  it('rejects a capability request pointed at another head SHA', () => {
    const receipt = decision();
    const candidate = { ...request(receipt.receiptId), expectedHeadSha: OTHER_SHA };
    expect(validateCapabilityRequestDecisionBinding(candidate, receipt, NOW)).toContain(
      'capability request head SHA does not match founder decision receipt',
    );
  });

  it('rejects execution after a founder rejection', () => {
    const rejected = createFounderDecisionReceipt({
      actor: { type: 'founder', id: 'jussray' },
      decision: 'reject',
      action: 'merge-code',
      capabilityPlanHash: HASH,
      expectedHeadSha: SHA,
      evidenceUrls: [],
      createdAt: '2026-08-24T22:55:00.000Z',
      expiresAt: '2099-08-24T23:55:00.000Z',
    }, NOW);
    expect(validateCapabilityRequestDecisionBinding(request(rejected.receiptId), rejected, NOW)).toContain(
      'rejected founder decision cannot authorize capability execution',
    );
  });

  it('rejects a forged canonical receipt id', () => {
    const receipt = decision();
    const forged = { ...receipt, actor: { ...receipt.actor, id: 'someone-else' } };
    expect(validateFounderDecisionReceipt(forged, NOW)).toContain(
      'receiptId does not match canonical founder decision content',
    );
  });

  it('rejects an expired decision using caller-supplied time', () => {
    const receipt = createFounderDecisionReceipt({
      actor: { type: 'founder', id: 'jussray' },
      decision: 'authorize',
      action: 'merge-code',
      capabilityPlanHash: HASH,
      expectedHeadSha: SHA,
      evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
      createdAt: '2026-08-24T22:00:00.000Z',
      expiresAt: '2026-08-24T23:30:00.000Z',
    }, NOW);
    expect(validateFounderDecisionReceipt(receipt, Date.parse('2026-08-25T00:00:00.000Z'))).toContain(
      'founder decision receipt is expired',
    );
  });
});
