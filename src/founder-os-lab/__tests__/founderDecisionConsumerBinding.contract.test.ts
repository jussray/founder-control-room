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
  computeCapabilityReceiptDigest,
  type CapabilityReceiptV1,
  type CapabilityRequestV1,
} from '../capabilityExecutionContracts.js';
import { normalizeCapabilityReceiptEvidence } from '../evidenceScaleGate.js';

const HEAD = 'a'.repeat(40);
const HASH = 'b'.repeat(64);
const NOW = Date.parse('2026-08-24T23:58:00.000Z');
const FOUNDER: AuthenticatedFounderContextV0 = {
  founderId: 'jussray',
  source: 'trusted-session',
  sourceRef: 'supabase-session:user-123',
};

function request(): CapabilityRequestV1 {
  return {
    contract: CAPABILITY_REQUEST_CONTRACT,
    goalId: 'goal-authority-consumer',
    runId: 'run-authority-consumer',
    attemptId: 'attempt-authority-consumer',
    traceId: 'trace-authority-consumer',
    expectedHeadSha: HEAD,
    capability: 'test.focused',
    capabilityVersion: '1.0.0',
    capabilityPlanHash: HASH,
    registryHash: 'c'.repeat(64),
    policyDecisionId: 'pending-founder-decision',
    policyVersion: 'founder-decision-v0',
    idempotencyKey: 'idem-authority-consumer',
    retryOwner: 'workflow',
    timeoutMs: 30_000,
    args: { projectSlug: 'founder-control-room', test: 'authority' },
  };
}

function decision(req: CapabilityRequestV1) {
  return createFounderDecisionReceipt({
    actor: { type: 'founder', id: FOUNDER.founderId },
    decision: 'authorize',
    action: 'merge-code',
    capabilityPlanHash: req.capabilityPlanHash,
    expectedHeadSha: req.expectedHeadSha,
    requestDigest: computeCapabilityRequestAuthorityDigest(req),
    evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
    createdAt: '2026-08-24T23:55:00.000Z',
    expiresAt: '2026-08-25T00:25:00.000Z',
  }, NOW);
}

function receipt(req: CapabilityRequestV1): CapabilityReceiptV1 {
  const value: CapabilityReceiptV1 = {
    contract: 'fcr/capability-receipt@v1',
    runId: req.runId,
    attemptId: req.attemptId,
    traceId: req.traceId,
    capability: req.capability,
    requestedHeadSha: req.expectedHeadSha,
    observedHeadSha: req.expectedHeadSha,
    execution: 'COMPLETED',
    evidence: [{
      evidenceId: 'authority-consumer-proof',
      kind: 'test',
      verdict: 'PASS',
      digest: 'd'.repeat(64),
      mediaType: 'application/json',
      size: 1,
      requestedHeadSha: req.expectedHeadSha,
      observedHeadSha: req.expectedHeadSha,
      observedAt: '2026-08-24T23:56:00.000Z',
    }],
    observations: [],
    inferences: [],
    startedAt: '2026-08-24T23:55:30.000Z',
    completedAt: '2026-08-24T23:56:00.000Z',
    receiptDigest: '0'.repeat(64),
  };
  value.receiptDigest = computeCapabilityReceiptDigest(value);
  return value;
}

describe('merged founder-decision authority gaps', () => {
  it('requires founder decision validation at the evidence normalization consumer', () => {
    const req = request();
    const capReceipt = receipt(req);
    const normalized = normalizeCapabilityReceiptEvidence({
      projectSlug: 'founder-control-room',
      request: req,
      receipt: capReceipt,
    });
    expect(normalized.evidence).toEqual([]);
    expect(normalized.integrityFailures.join(' ')).toMatch(/founder decision|authorization|policy/i);
  });

  it('rejects reuse of an authorization when the exact capability request surface changes', () => {
    const original = request();
    const auth = decision(original);
    original.policyDecisionId = auth.receiptId;
    const mutated: CapabilityRequestV1 = {
      ...original,
      capability: 'dependency.inspect',
      capabilityVersion: '9.9.9',
      registryHash: 'e'.repeat(64),
      idempotencyKey: 'idem-attacker',
      args: { projectSlug: 'founder-control-room', destructive: true },
    };
    expect(validateCapabilityRequestDecisionBinding(mutated, auth, NOW, FOUNDER)).toContain('capability request digest does not match founder decision receipt');
  });

  it('fails closed instead of throwing when a decoded receipt has no actor object', () => {
    const malformed = { ...decision(request()), actor: null } as unknown as FounderDecisionReceiptV0;
    malformed.receiptId = computeFounderDecisionReceiptId(malformed);
    expect(() => validateFounderDecisionReceipt(malformed, NOW)).not.toThrow();
    expect(validateFounderDecisionReceipt(malformed, NOW).join(' ')).toMatch(/actor/i);
  });
});
