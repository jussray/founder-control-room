import {
  createV10OutcomeObservation,
  type V10OutcomeMetric,
  type V10OutcomeObservation,
} from '../founder-os-lab/outcomeObservation.js';
import {
  founderConveyorReceiptId,
  type FounderConveyorReceiptIdentity,
} from './founderConveyorReceipt.js';
import type { RepositoryTruthAssessment } from './repositoryTruthAssessment.js';

export interface V10ClosedLoopOutcomeInput {
  receiptIdentity: FounderConveyorReceiptIdentity;
  executionReceiptId: string;
  truth: RepositoryTruthAssessment;
  observedAt: string;
  goalSucceeded: boolean | null;
  founderOverride: boolean;
  rollbackUsed: boolean;
  retries: number;
  outcomeSignals: string[];
  evidenceUrls?: string[];
  metrics?: V10OutcomeMetric[];
}

function same(value: string, expected: string): boolean {
  return value.trim().toLowerCase() === expected.trim().toLowerCase();
}

function uniqueEvidenceUrls(
  receiptEvidence: readonly string[],
  providerEvidence: readonly string[] = [],
): string[] {
  return [...new Set([...receiptEvidence, ...providerEvidence].map((value) => value.trim()).filter(Boolean))].sort();
}

/**
 * Seal one bounded execution into the canonical V10 outcome contract.
 *
 * The caller does not get to assert execution identity: FCR re-derives the
 * conveyor receipt from the exact project/head/plan/registry/stage/evidence
 * identity and rejects a mismatched receipt. Repository truth may mark the
 * observation verified only while it is both verified and fresh.
 *
 * This function never promotes a capability or authorizes another mutation.
 * It only creates evidence that Chief AI may assess for the next decision.
 */
export function createV10ClosedLoopOutcome(
  input: V10ClosedLoopOutcomeInput,
): V10OutcomeObservation {
  if (!same(input.receiptIdentity.capabilityPlanHash, input.receiptIdentity.capabilityPlanHash.toLowerCase())) {
    throw new Error('capabilityPlanHash must be normalized before outcome sealing');
  }

  const expectedReceiptId = founderConveyorReceiptId(input.receiptIdentity);
  if (!same(input.executionReceiptId, expectedReceiptId)) {
    throw new Error('executionReceiptId does not match the bound conveyor receipt identity');
  }

  const verified = input.truth.state === 'verified' && input.truth.freshness === 'fresh';
  const evidenceUrls = uniqueEvidenceUrls(
    input.receiptIdentity.evidenceUrls,
    input.evidenceUrls ?? [],
  );

  return createV10OutcomeObservation({
    capabilityPlanHash: input.receiptIdentity.capabilityPlanHash,
    executionReceiptId: expectedReceiptId,
    observedAt: input.observedAt,
    verified,
    goalSucceeded: input.goalSucceeded,
    founderOverride: input.founderOverride,
    rollbackUsed: input.rollbackUsed,
    retries: input.retries,
    evidenceCompleteness: input.truth.evidenceCompleteness,
    outcomeSignals: input.outcomeSignals,
    evidenceUrls,
    metrics: input.metrics,
  });
}
