import { operatorContinuityDimensionFingerprint } from './operatorContinuity.js';

export const REVENUE_PROOF_OS_CONTRACT = 'fcr/revenue-proof-os@v1' as const;

export const REVENUE_PROOF_PLANES = [
  'DISCOVER',
  'QUALIFY',
  'ENGAGE',
  'CLOSE',
  'DELIVER',
  'COMPOUND',
] as const;

export type RevenueProofPlane = (typeof REVENUE_PROOF_PLANES)[number];

export const REVENUE_TRUTH_STATES = [
  'IDENTIFIED',
  'CONTACTABLE',
  'ENGAGED',
  'QUALIFIED',
  'PROPOSAL_READY',
  'PROPOSAL_SENT',
  'NEGOTIATING',
  'SIGNED',
  'INVOICED',
  'CASH_COLLECTED',
  'FULFILLED',
  'CUSTOMER_VALUE_VERIFIED',
] as const;

export type RevenueTruthState = (typeof REVENUE_TRUTH_STATES)[number];
export type RevenueFinding = 'CONTROL' | 'HOLD' | 'KILL';

export interface RevenueTransitionGate {
  evidenceRefs: readonly string[];
  freshness: 'current' | 'stale' | 'historical' | 'unknown';
  gateSatisfied: boolean;
  materialFindings: readonly RevenueFinding[];
  rollback: string;
  nextGate: string;
}

/**
 * The six planes are an operating model, not a replacement for the commercial truth state machine.
 * In particular, QUALIFY may screen fit before outreach, but formal QUALIFIED promotion still requires
 * ENGAGED -> QUALIFIED buyer evidence. A pre-contact hypothesis can never become qualified pipeline.
 */
export function canAdvanceRevenueTruth(
  current: RevenueTruthState,
  next: RevenueTruthState,
  gate: RevenueTransitionGate,
): boolean {
  const currentIndex = REVENUE_TRUTH_STATES.indexOf(current);
  const nextIndex = REVENUE_TRUTH_STATES.indexOf(next);
  if (currentIndex < 0 || nextIndex !== currentIndex + 1) return false;
  if (!gate.gateSatisfied) return false;
  if (gate.freshness !== 'current') return false;
  if (gate.evidenceRefs.length === 0) return false;
  if (!gate.rollback.trim() || !gate.nextGate.trim()) return false;
  if (gate.materialFindings.includes('HOLD') || gate.materialFindings.includes('KILL')) return false;
  return true;
}

export interface RevenueSendLeaseInput {
  prospectFingerprint: string;
  recipientFingerprint: string;
  messageFingerprint: string;
  offerFingerprint: string;
  approvalFingerprint: string;
}

export interface RevenueSendLease {
  contract: typeof REVENUE_PROOF_OS_CONTRACT;
  prospectFingerprint: string;
  recipientFingerprint: string;
  messageFingerprint: string;
  offerFingerprint: string;
  approvalFingerprint: string;
  sendAttempt: 0 | 1;
  sendLease: 'OPEN' | 'CONSUMED';
  providerReceiptFingerprint: string | null;
  browserCookie: false;
  authorizing: false;
  approvalCarryForward: false;
  founderDecisionRequired: true;
}

export function openRevenueSendLease(input: RevenueSendLeaseInput): RevenueSendLease {
  for (const [key, value] of Object.entries(input)) {
    if (!value.trim()) throw new Error(`missing ${key}`);
  }

  return {
    contract: REVENUE_PROOF_OS_CONTRACT,
    ...input,
    sendAttempt: 0,
    sendLease: 'OPEN',
    providerReceiptFingerprint: null,
    browserCookie: false,
    authorizing: false,
    approvalCarryForward: false,
    founderDecisionRequired: true,
  };
}

export interface RevenueProviderReceipt {
  messageId: string;
  threadId?: string | null;
  status: string;
}

/**
 * A provider receipt consumes the outbound lease exactly once. Verification after this point must be read-only.
 */
export function consumeRevenueSendLease(
  lease: RevenueSendLease,
  receipt: RevenueProviderReceipt,
): RevenueSendLease {
  if (lease.sendLease !== 'OPEN' || lease.sendAttempt !== 0) {
    throw new Error('send lease already consumed');
  }
  if (!receipt.messageId.trim() || !receipt.status.trim()) {
    throw new Error('provider receipt is incomplete');
  }

  return {
    ...lease,
    sendAttempt: 1,
    sendLease: 'CONSUMED',
    providerReceiptFingerprint: operatorContinuityDimensionFingerprint({
      messageId: receipt.messageId,
      threadId: receipt.threadId ?? null,
      status: receipt.status,
    }),
  };
}

export interface RevenueContinuityDimensions {
  icpState: unknown;
  prospectState: unknown;
  offerState: unknown;
  pipelineState: unknown;
  proofState: unknown;
  sourceCoverageState: unknown;
  authorityState: unknown;
  sendLeaseState: unknown;
  contractPaymentState: unknown;
  deliveryState: unknown;
  customerValueState: unknown;
}

/** Minimized deterministic fingerprints for the existing operator-continuity membrane. */
export function revenueContinuityFingerprints(value: RevenueContinuityDimensions) {
  return {
    icpFingerprint: operatorContinuityDimensionFingerprint(value.icpState),
    prospectFingerprint: operatorContinuityDimensionFingerprint(value.prospectState),
    offerFingerprint: operatorContinuityDimensionFingerprint(value.offerState),
    pipelineFingerprint: operatorContinuityDimensionFingerprint(value.pipelineState),
    proofFingerprint: operatorContinuityDimensionFingerprint(value.proofState),
    sourceCoverageFingerprint: operatorContinuityDimensionFingerprint(value.sourceCoverageState),
    authorityFingerprint: operatorContinuityDimensionFingerprint(value.authorityState),
    sendLeaseFingerprint: operatorContinuityDimensionFingerprint(value.sendLeaseState),
    contractPaymentFingerprint: operatorContinuityDimensionFingerprint(value.contractPaymentState),
    deliveryFingerprint: operatorContinuityDimensionFingerprint(value.deliveryState),
    customerValueFingerprint: operatorContinuityDimensionFingerprint(value.customerValueState),
  } as const;
}
