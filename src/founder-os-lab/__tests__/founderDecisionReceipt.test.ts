import { describe, expect, it } from 'vitest';
import {
  computeCapabilityRequestAuthorityDigest,
  computeFounderDecisionReceiptId,
  createFounderDecisionReceipt,
  validateCapabilityRequestDecisionBinding,
  validateFounderDecisionReceipt,
  type AuthenticatedFounderContextV0,
  type FounderDecisionReceiptV0,
} from '../founderDecisionReceipt.js';
import {
  CAPABILITY_REQUEST_CONTRACT,
  type CapabilityRequestV1,
} from '../capabilityExecutionContracts.js';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const HASH = 'c'.repeat(64);
const NOW = Date.parse('2026-08-24T23:00:00.000Z');
const FOUNDER_CONTEXT: AuthenticatedFounderContextV0 = {
  founderId: 'jussray',
  source: 'registered-adapter',
  sourceRef: 'chatgpt-adapter:v1:decision-1',
};

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

function decision() {
  return createFounderDecisionReceipt({
    actor: { type: 'founder', id: 'jussray' },
    decision: 'authorize',
    action: 'merge-code',
    capabilityPlanHash: HASH,
    expectedHeadSha: SHA,
    requestDigest: computeCapabilityRequestAuthorityDigest(request('pending-founder-decision')),
    evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
    createdAt: '2026-08-24T22:55:00.000Z',
    expiresAt: '2026-08-24T23:30:00.000Z',
  }, NOW);
}

describe('FounderDecisionReceiptV0', () => {
  it('creates a canonical founder authority receipt bound to exact state', () => {
    const receipt = decision();
    expect(receipt.actor).toEqual({ type: 'founder', id: 'jussray' });
    expect(receipt.expectedHeadSha).toBe(SHA);
    expect(receipt.capabilityPlanHash).toBe(HASH);
    expect(receipt.requestDigest).toBe(computeCapabilityRequestAuthorityDigest(request('anything')));
    expect(receipt.receiptId).toMatch(/^fcr-founder-decision-v0:[0-9a-f]{64}$/);
    expect(validateFounderDecisionReceipt(receipt, NOW)).toEqual([]);
  });

  it('requires evidence for state-changing authorization', () => {
    expect(() => createFounderDecisionReceipt({
      actor: { type: 'founder', id: 'jussray' },
      decision: 'authorize',
      action: 'deploy-code',
      capabilityPlanHash: HASH,
      expectedHeadSha: SHA,
      requestDigest: computeCapabilityRequestAuthorityDigest(request('pending')),
      evidenceUrls: [],
      createdAt: '2026-08-24T22:55:00.000Z',
      expiresAt: '2026-08-24T23:30:00.000Z',
    }, NOW)).toThrow('state-changing decisions require evidence URLs');
  });

  it('binds a capability request to the exact founder decision receipt and authenticated founder', () => {
    const receipt = decision();
    expect(validateCapabilityRequestDecisionBinding(request(receipt.receiptId), receipt, NOW, FOUNDER_CONTEXT)).toEqual([]);
  });

  it('rejects a capability request pointed at another head SHA', () => {
    const receipt = decision();
    const candidate = { ...request(receipt.receiptId), expectedHeadSha: OTHER_SHA };
    expect(validateCapabilityRequestDecisionBinding(candidate, receipt, NOW, FOUNDER_CONTEXT)).toContain('capability request head SHA does not match founder decision receipt');
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
    }, NOW);
    expect(validateCapabilityRequestDecisionBinding(request(rejected.receiptId), rejected, NOW, FOUNDER_CONTEXT)).toContain('capability execution requires an explicit founder authorization');
  });

  it('rejects an approval receipt as execution authority', () => {
    const approved = createFounderDecisionReceipt({
      actor: { type: 'founder', id: 'jussray' },
      decision: 'approve',
      action: 'inspect',
      capabilityPlanHash: HASH,
      expectedHeadSha: SHA,
      evidenceUrls: [],
      createdAt: '2026-08-24T22:55:00.000Z',
    }, NOW);
    expect(validateCapabilityRequestDecisionBinding(request(approved.receiptId), approved, NOW, FOUNDER_CONTEXT)).toContain('capability execution requires an explicit founder authorization');
  });

  it('rejects automation-minted execution authority', () => {
    expect(() => createFounderDecisionReceipt({
      actor: { type: 'automation', id: 'workflow-bot' },
      decision: 'authorize',
      action: 'merge-code',
      capabilityPlanHash: HASH,
      expectedHeadSha: SHA,
      requestDigest: computeCapabilityRequestAuthorityDigest(request('pending')),
      evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
      createdAt: '2026-08-24T22:55:00.000Z',
      expiresAt: '2026-08-24T23:30:00.000Z',
    }, NOW)).toThrow('only a founder actor can issue an execution authorization');
  });

  it('rejects a spoofed founder even when the attacker recomputes the canonical receipt id', () => {
    const forged = { ...decision(), actor: { type: 'founder', id: 'someone-else' } } satisfies FounderDecisionReceiptV0;
    forged.receiptId = computeFounderDecisionReceiptId(forged);
    expect(validateFounderDecisionReceipt(forged, NOW)).toEqual([]);
    expect(validateCapabilityRequestDecisionBinding(request(forged.receiptId), forged, NOW, FOUNDER_CONTEXT)).toContain('founder decision receipt does not match authenticated founder identity');
  });

  it('fails closed when trusted founder context is malformed', () => {
    const receipt = decision();
    const malformedContext = { founderId: '', source: 'untrusted-chat', sourceRef: '' } as unknown as AuthenticatedFounderContextV0;
    const reasons = validateCapabilityRequestDecisionBinding(request(receipt.receiptId), receipt, NOW, malformedContext);
    expect(reasons).toContain('authenticated founder id is required');
    expect(reasons).toContain('founder authority must come from a trusted session or registered adapter');
    expect(reasons).toContain('trusted founder source reference is required');
  });

  it('requires an explicit bounded expiry for execution authorization', () => {
    expect(() => createFounderDecisionReceipt({
      actor: { type: 'founder', id: 'jussray' },
      decision: 'authorize',
      action: 'merge-code',
      capabilityPlanHash: HASH,
      expectedHeadSha: SHA,
      requestDigest: computeCapabilityRequestAuthorityDigest(request('pending')),
      evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
      createdAt: '2026-08-24T22:55:00.000Z',
    }, NOW)).toThrow('execution authorization requires an explicit expiry');

    expect(() => createFounderDecisionReceipt({
      actor: { type: 'founder', id: 'jussray' },
      decision: 'authorize',
      action: 'merge-code',
      capabilityPlanHash: HASH,
      expectedHeadSha: SHA,
      requestDigest: computeCapabilityRequestAuthorityDigest(request('pending')),
      evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
      createdAt: '2026-08-24T22:00:00.000Z',
      expiresAt: '2026-08-25T00:00:01.000Z',
    }, NOW)).toThrow('execution authorization lifetime may not exceed 60 minutes');
  });

  it('rejects a future-dated founder decision', () => {
    expect(() => createFounderDecisionReceipt({
      actor: { type: 'founder', id: 'jussray' },
      decision: 'authorize',
      action: 'merge-code',
      capabilityPlanHash: HASH,
      expectedHeadSha: SHA,
      requestDigest: computeCapabilityRequestAuthorityDigest(request('pending')),
      evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
      createdAt: '2026-08-24T23:05:00.000Z',
      expiresAt: '2026-08-24T23:30:00.000Z',
    }, NOW)).toThrow('founder decision receipt cannot be future-dated');
  });

  it('rejects a forged canonical receipt id', () => {
    const receipt = decision();
    const forged = { ...receipt, actor: { ...receipt.actor, id: 'someone-else' } };
    expect(validateFounderDecisionReceipt(forged, NOW)).toContain('receiptId does not match canonical founder decision content');
  });

  it('rejects an unknown runtime action even when the attacker recomputes the digest', () => {
    const receipt = decision();
    const forged = { ...receipt, action: 'drop-database' } as unknown as FounderDecisionReceiptV0;
    forged.receiptId = computeFounderDecisionReceiptId(forged);
    expect(validateFounderDecisionReceipt(forged, NOW)).toContain('unsupported founder action');
  });

  it('fails closed instead of throwing when evidenceUrls is malformed at runtime', () => {
    const malformed = { ...decision(), evidenceUrls: null } as unknown as FounderDecisionReceiptV0;
    expect(() => validateFounderDecisionReceipt(malformed, NOW)).not.toThrow();
    expect(validateFounderDecisionReceipt(malformed, NOW)).toContain('evidenceUrls must be an array');
  });

  it('rejects an expired decision using caller-supplied time', () => {
    const receipt = createFounderDecisionReceipt({
      actor: { type: 'founder', id: 'jussray' },
      decision: 'authorize',
      action: 'merge-code',
      capabilityPlanHash: HASH,
      expectedHeadSha: SHA,
      requestDigest: computeCapabilityRequestAuthorityDigest(request('pending')),
      evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
      createdAt: '2026-08-24T22:30:00.000Z',
      expiresAt: '2026-08-24T23:30:00.000Z',
    }, NOW);
    expect(validateFounderDecisionReceipt(receipt, Date.parse('2026-08-25T00:00:00.000Z'))).toContain('founder decision receipt is expired');
  });
});
