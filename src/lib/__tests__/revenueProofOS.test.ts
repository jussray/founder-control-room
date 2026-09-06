import { describe, expect, it } from 'vitest';
import {
  canAdvanceRevenueTruth,
  consumeRevenueSendLease,
  openRevenueSendLease,
  revenueContinuityFingerprints,
} from '../revenueProofOS.js';

const cleanGate = {
  evidenceRefs: ['gmail:buyer-reply'],
  freshness: 'current' as const,
  gateSatisfied: true,
  materialFindings: [] as const,
  rollback: 'return to ENGAGED if buyer evidence is contradicted',
  nextGate: 'founder approval for proposal preparation',
};

describe('Revenue Proof OS', () => {
  it('requires adjacent state movement and fresh evidence', () => {
    expect(canAdvanceRevenueTruth('ENGAGED', 'QUALIFIED', cleanGate)).toBe(true);
    expect(canAdvanceRevenueTruth('CONTACTABLE', 'QUALIFIED', cleanGate)).toBe(false);
    expect(canAdvanceRevenueTruth('ENGAGED', 'QUALIFIED', {...cleanGate, evidenceRefs: []})).toBe(false);
    expect(canAdvanceRevenueTruth('ENGAGED', 'QUALIFIED', {...cleanGate, freshness: 'stale'})).toBe(false);
  });

  it('blocks promotion while material HOLD or KILL findings remain', () => {
    expect(canAdvanceRevenueTruth('ENGAGED', 'QUALIFIED', {
      ...cleanGate,
      materialFindings: ['HOLD'],
    })).toBe(false);
    expect(canAdvanceRevenueTruth('ENGAGED', 'QUALIFIED', {
      ...cleanGate,
      materialFindings: ['KILL'],
    })).toBe(false);
  });

  it('consumes an outbound send lease exactly once', () => {
    const lease = openRevenueSendLease({
      prospectFingerprint: 'prospect-fp',
      recipientFingerprint: 'recipient-fp',
      messageFingerprint: 'message-fp',
      offerFingerprint: 'offer-fp',
      approvalFingerprint: 'approval-fp',
    });

    const consumed = consumeRevenueSendLease(lease, {
      messageId: 'gmail-message-1',
      threadId: 'gmail-thread-1',
      status: 'SENT',
    });

    expect(consumed.sendAttempt).toBe(1);
    expect(consumed.sendLease).toBe('CONSUMED');
    expect(consumed.providerReceiptFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(consumed.authorizing).toBe(false);
    expect(consumed.approvalCarryForward).toBe(false);
    expect(() => consumeRevenueSendLease(consumed, {
      messageId: 'gmail-message-2',
      status: 'SENT',
    })).toThrow('send lease already consumed');
  });

  it('fingerprints commercial dimensions independently so movement expires only dependent continuity', () => {
    const base = revenueContinuityFingerprints({
      icpState: {segment: 'agent-governance'},
      prospectState: {id: 'buyer-1', state: 'CONTACTABLE'},
      offerState: {id: 'execution-truth-audit', version: 1},
      pipelineState: [{id: 'buyer-1', state: 'CONTACTABLE'}],
      proofState: {repo: 'founder-control-room', sha: 'a'.repeat(40)},
      sourceCoverageState: {gmail: 'current', hubspot: 'current'},
      authorityState: {outreach: 'approved-once'},
      sendLeaseState: {state: 'OPEN', attempt: 0},
      contractPaymentState: {contract: 'NONE', payment: 'NONE'},
      deliveryState: {state: 'NOT_STARTED'},
      customerValueState: {state: 'UNKNOWN'},
    });

    const moved = revenueContinuityFingerprints({
      icpState: {segment: 'agent-governance'},
      prospectState: {id: 'buyer-1', state: 'ENGAGED'},
      offerState: {id: 'execution-truth-audit', version: 1},
      pipelineState: [{id: 'buyer-1', state: 'ENGAGED'}],
      proofState: {repo: 'founder-control-room', sha: 'a'.repeat(40)},
      sourceCoverageState: {gmail: 'current', hubspot: 'current'},
      authorityState: {outreach: 'approved-once'},
      sendLeaseState: {state: 'CONSUMED', attempt: 1},
      contractPaymentState: {contract: 'NONE', payment: 'NONE'},
      deliveryState: {state: 'NOT_STARTED'},
      customerValueState: {state: 'UNKNOWN'},
    });

    expect(moved.prospectFingerprint).not.toBe(base.prospectFingerprint);
    expect(moved.pipelineFingerprint).not.toBe(base.pipelineFingerprint);
    expect(moved.sendLeaseFingerprint).not.toBe(base.sendLeaseFingerprint);
    expect(moved.offerFingerprint).toBe(base.offerFingerprint);
    expect(moved.proofFingerprint).toBe(base.proofFingerprint);
  });
});
