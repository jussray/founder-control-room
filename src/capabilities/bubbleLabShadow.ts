import { createHash } from 'node:crypto';

export const BUBBLE_LAB_SHADOW_CONTRACT = 'fcr/bubble-lab-shadow@v1' as const;
export const BUBBLE_LAB_TAKE_PROFIT_PCT = 0.5;
export const BUBBLE_LAB_STOP_LOSS_PCT = -0.15;

export type ShadowExitDecision = 'HOLD' | 'SHADOW_TAKE_PROFIT' | 'SHADOW_STOP_LOSS';

export interface ShadowPositionObservation {
  assetId: string;
  entryPrice: number;
  observedPrice: number;
  observedAt: string;
  evidenceRef: string;
}

export interface ShadowFailureReceipt {
  id: string;
  classification: 'INVALID_OBSERVATION';
  status: 'BLOCKED';
  evidenceRef: string;
  reason: string;
}

export interface ShadowDecisionReceipt {
  contract: typeof BUBBLE_LAB_SHADOW_CONTRACT;
  assetId: string;
  entryPrice: number;
  observedPrice: number;
  pnlPct: number;
  decision: ShadowExitDecision;
  observedAt: string;
  evidenceRef: string;
  fingerprint: string;
  simulatedOnly: true;
  transactionSignerPresent: false;
  privateKeyAccepted: false;
  liveOrderAllowed: false;
  failureReceipts: ShadowFailureReceipt[];
}

export interface ShadowSettlementReceipt {
  contract: typeof BUBBLE_LAB_SHADOW_CONTRACT;
  decisionFingerprint: string;
  startingShadowBalance: number;
  simulatedStake: number;
  simulatedPnl: number;
  endingShadowBalance: number;
  settled: boolean;
  simulatedOnly: true;
  externalTransferAttempted: false;
  connectedAccountCredited: false;
  liveFundsMoved: false;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function evaluateShadowExit(observation: ShadowPositionObservation): ShadowDecisionReceipt {
  const failureReceipts: ShadowFailureReceipt[] = [];

  if (!observation.assetId.trim()) {
    failureReceipts.push({
      id: 'asset-id-missing',
      classification: 'INVALID_OBSERVATION',
      status: 'BLOCKED',
      evidenceRef: observation.evidenceRef,
      reason: 'assetId is required',
    });
  }

  if (!finitePositive(observation.entryPrice)) {
    failureReceipts.push({
      id: 'entry-price-invalid',
      classification: 'INVALID_OBSERVATION',
      status: 'BLOCKED',
      evidenceRef: observation.evidenceRef,
      reason: 'entryPrice must be a finite positive number',
    });
  }

  if (!finitePositive(observation.observedPrice)) {
    failureReceipts.push({
      id: 'observed-price-invalid',
      classification: 'INVALID_OBSERVATION',
      status: 'BLOCKED',
      evidenceRef: observation.evidenceRef,
      reason: 'observedPrice must be a finite positive number',
    });
  }

  if (!observation.evidenceRef.trim()) {
    failureReceipts.push({
      id: 'evidence-ref-missing',
      classification: 'INVALID_OBSERVATION',
      status: 'BLOCKED',
      evidenceRef: observation.evidenceRef,
      reason: 'evidenceRef is required',
    });
  }

  if (!Number.isFinite(Date.parse(observation.observedAt))) {
    failureReceipts.push({
      id: 'observed-at-invalid',
      classification: 'INVALID_OBSERVATION',
      status: 'BLOCKED',
      evidenceRef: observation.evidenceRef,
      reason: 'observedAt must be an ISO-compatible timestamp',
    });
  }

  const pnlPct = failureReceipts.length === 0
    ? (observation.observedPrice - observation.entryPrice) / observation.entryPrice
    : 0;

  const decision: ShadowExitDecision = failureReceipts.length > 0
    ? 'HOLD'
    : pnlPct >= BUBBLE_LAB_TAKE_PROFIT_PCT
      ? 'SHADOW_TAKE_PROFIT'
      : pnlPct <= BUBBLE_LAB_STOP_LOSS_PCT
        ? 'SHADOW_STOP_LOSS'
        : 'HOLD';

  return {
    contract: BUBBLE_LAB_SHADOW_CONTRACT,
    assetId: observation.assetId.trim(),
    entryPrice: observation.entryPrice,
    observedPrice: observation.observedPrice,
    pnlPct,
    decision,
    observedAt: observation.observedAt,
    evidenceRef: observation.evidenceRef,
    fingerprint: fingerprint([
      BUBBLE_LAB_SHADOW_CONTRACT,
      observation.assetId.trim(),
      observation.entryPrice,
      observation.observedPrice,
      observation.observedAt,
      observation.evidenceRef,
      decision,
      failureReceipts,
    ]),
    simulatedOnly: true,
    transactionSignerPresent: false,
    privateKeyAccepted: false,
    liveOrderAllowed: false,
    failureReceipts,
  };
}

export function settleShadowDecision(
  receipt: ShadowDecisionReceipt,
  startingShadowBalance: number,
  simulatedStake: number,
): ShadowSettlementReceipt {
  if (!Number.isFinite(startingShadowBalance) || startingShadowBalance < 0) {
    throw new Error('startingShadowBalance must be a finite non-negative number');
  }
  if (!finitePositive(simulatedStake) || simulatedStake > startingShadowBalance) {
    throw new Error('simulatedStake must be positive and no greater than the shadow balance');
  }

  const settled = receipt.failureReceipts.length === 0 && receipt.decision !== 'HOLD';
  const simulatedPnl = settled ? simulatedStake * receipt.pnlPct : 0;

  return {
    contract: BUBBLE_LAB_SHADOW_CONTRACT,
    decisionFingerprint: receipt.fingerprint,
    startingShadowBalance,
    simulatedStake,
    simulatedPnl,
    endingShadowBalance: startingShadowBalance + simulatedPnl,
    settled,
    simulatedOnly: true,
    externalTransferAttempted: false,
    connectedAccountCredited: false,
    liveFundsMoved: false,
  };
}
