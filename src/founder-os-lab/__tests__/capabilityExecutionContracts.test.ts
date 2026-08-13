import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_RECEIPT_CONTRACT,
  CAPABILITY_REQUEST_CONTRACT,
  computeCapabilityReceiptDigest,
  type CapabilityReceiptV1,
  type CapabilityRequestV1,
  validateCapabilityReceipt,
  validateCapabilityRequest,
} from '../capabilityExecutionContracts';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const HASH = 'c'.repeat(64);
const PYTHON_CANONICAL_DIGEST = 'f46f055852fa833babdd93f46431884d4ad896d4ea58c0b77ce37a006242404e';

function request(): CapabilityRequestV1 {
  return {
    contract: CAPABILITY_REQUEST_CONTRACT,
    goalId: 'goal-1',
    runId: 'run-1',
    attemptId: 'attempt-1',
    traceId: 'trace-1',
    expectedHeadSha: SHA,
    capability: 'repo.inspect',
    capabilityVersion: 'v1',
    capabilityPlanHash: HASH,
    registryHash: HASH,
    policyDecisionId: 'policy-1',
    policyVersion: 'v1',
    idempotencyKey: 'idem-1',
    retryOwner: 'workflow',
    timeoutMs: 30_000,
    args: {},
  };
}

function receipt(): CapabilityReceiptV1 {
  const candidate: CapabilityReceiptV1 = {
    contract: CAPABILITY_RECEIPT_CONTRACT,
    runId: 'run-1',
    attemptId: 'attempt-1',
    traceId: 'trace-1',
    capability: 'repo.inspect',
    requestedHeadSha: SHA,
    observedHeadSha: SHA,
    execution: 'COMPLETED',
    evidence: [{
      evidenceId: 'evidence-1',
      kind: 'artifact',
      verdict: 'PASS',
      digest: HASH,
      mediaType: 'application/json',
      size: 12,
      requestedHeadSha: SHA,
      observedHeadSha: SHA,
      observedAt: '2026-08-13T00:00:00.000Z',
    }],
    observations: ['nested receipt parity'],
    inferences: [],
    startedAt: '2026-08-13T00:00:00.000Z',
    completedAt: '2026-08-13T00:00:01.000Z',
    receiptDigest: HASH,
  };
  candidate.receiptDigest = computeCapabilityReceiptDigest(candidate);
  return candidate;
}

describe('capability execution contracts', () => {
  it('accepts a bounded exact-head request', () => {
    expect(validateCapabilityRequest(request())).toEqual([]);
  });

  it('rejects a retry owner other than the durable workflow', () => {
    const candidate = { ...request(), retryOwner: 'worker' as never };
    expect(validateCapabilityRequest(candidate)).toContain('retryOwner must be workflow');
  });

  it('matches the Python recursively sorted canonical receipt digest', () => {
    expect(receipt().receiptDigest).toBe(PYTHON_CANONICAL_DIGEST);
  });

  it('rejects a forged receipt digest', () => {
    const candidate = { ...receipt(), receiptDigest: HASH };
    expect(validateCapabilityReceipt(request(), candidate)).toContain(
      'receiptDigest does not match canonical receipt content',
    );
  });

  it('rejects a completed receipt observed on a different SHA', () => {
    const candidate = { ...receipt(), observedHeadSha: OTHER_SHA };
    expect(validateCapabilityReceipt(request(), candidate)).toContain(
      'completed receipt must bind to the exact requested head SHA',
    );
  });

  it('rejects stale PASS evidence even when the receipt itself is blocked', () => {
    const candidate = receipt();
    candidate.execution = 'BLOCKED';
    candidate.evidence = [{ ...candidate.evidence[0], observedHeadSha: OTHER_SHA }];
    candidate.receiptDigest = computeCapabilityReceiptDigest(candidate);
    expect(validateCapabilityReceipt(request(), candidate)).toContain(
      'PASS evidence must bind to the exact requested head SHA',
    );
  });

  it('rejects evidence borrowed from a different requested SHA', () => {
    const candidate = receipt();
    candidate.evidence = [{ ...candidate.evidence[0], requestedHeadSha: OTHER_SHA }];
    candidate.receiptDigest = computeCapabilityReceiptDigest(candidate);
    expect(validateCapabilityReceipt(request(), candidate)).toContain(
      'evidence requestedHeadSha does not match request',
    );
  });

  it('rejects a receipt from another run', () => {
    const candidate = { ...receipt(), runId: 'run-2' };
    expect(validateCapabilityReceipt(request(), candidate)).toContain(
      'receipt runId does not match request',
    );
  });

  it('rejects a receipt from another attempt', () => {
    const candidate = { ...receipt(), attemptId: 'attempt-2' };
    expect(validateCapabilityReceipt(request(), candidate)).toContain(
      'receipt attemptId does not match request',
    );
  });
});
