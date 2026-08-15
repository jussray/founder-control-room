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

export interface V10ClosedLoopTruthIdentity {
  projectSlug: string;
  headSha: string;
}

export interface V10ClosedLoopOutcomeInput {
  receiptIdentity: FounderConveyorReceiptIdentity;
  executionReceiptId: string;
  truthIdentity: V10ClosedLoopTruthIdentity;
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
 * FCR re-derives the conveyor receipt from the exact execution identity and
 * also binds the verified truth context to the same project and expected head.
 * This prevents a valid receipt from being paired with fresh truth belonging
 * to another repository or commit.
 *
 * This function never promotes a capability or authorizes another mutation.
 * It only creates evidence that Chief AI may assess for the next decision.
 */
export function createV10ClosedLoopOutcome(
  input: V10ClosedLoopOutcomeInput,
): V10OutcomeObservation {
  const expectedReceiptId = founderConveyorReceiptId(input.receiptIdentity);
  if (!same(input.executionReceiptId, expectedReceiptId)) {
    throw new Error('executionReceiptId does not match the bound conveyor receipt identity');
  }
  if (!same(input.truthIdentity.projectSlug, input.receiptIdentity.projectSlug)) {
    throw new Error('truth project does not match the bound conveyor project');
  }
  if (!same(input.truthIdentity.headSha, input.receiptIdentity.expectedHeadSha)) {
    throw new Error('truth head does not match the bound conveyor expected head');
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
