import type { OperatorRelayResponseV1, RelayStatus } from './operatorRelay.js';
import type { CapabilityObservation, CapabilityTaskClass } from './modelCapabilityMarket.js';

/**
 * Folds operator relay receipts into one proof-weighted capability observation.
 *
 * This is the feed side of the model capability market: the market ranks operators from
 * `CapabilityObservation` records, and relay responses are the receipts FCR already holds for
 * work an operator actually performed. The fold is pure and deterministic so the resulting
 * observation can itself be receipted.
 *
 * Boundaries:
 * - Task classification is upstream. The caller names the task class; this fold does not infer it.
 * - `accepted` receipts are in-flight, not outcomes, and are excluded from the sample.
 * - Receipts answered by a different operator are ignored, never re-attributed.
 * - No cost or duration is invented: the relay receipt does not carry them, so they stay undefined.
 * - A `completed` receipt with zero evidence references is a false green even if it bypassed the
 *   relay validator; an `authorityRequested` value other than `none` is an authority violation.
 * - The observation carries no selection or execution authority. It is evidence for routing only.
 */

const OUTCOME_STATUSES: ReadonlySet<RelayStatus> = new Set<RelayStatus>(['completed', 'blocked', 'failed']);

export interface RelayReceiptFoldInput {
  operatorId: string;
  taskClass: CapabilityTaskClass;
  receipts: readonly OperatorRelayResponseV1[];
}

export interface RelayReceiptFoldSummary {
  observation: CapabilityObservation | null;
  consideredReceipts: number;
  ignoredForeignOperator: number;
  ignoredInFlight: number;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function hasEvidence(receipt: OperatorRelayResponseV1): boolean {
  return Array.isArray(receipt.evidenceRefs) && receipt.evidenceRefs.some((ref) => typeof ref === 'string' && ref.trim().length > 0);
}

function requestsAuthority(receipt: OperatorRelayResponseV1): boolean {
  // The contract types this field as the literal 'none'. Read the runtime value so a hand-built or
  // forged receipt that bypassed validation is still counted as a violation rather than trusted.
  return String((receipt as { authorityRequested?: unknown }).authorityRequested) !== 'none';
}

function latestCompletedAt(receipts: readonly OperatorRelayResponseV1[]): string {
  let latest = '';
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const receipt of receipts) {
    const ms = Date.parse(receipt.completedAt);
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
      latest = receipt.completedAt;
    }
  }
  return latest;
}

export function foldRelayReceiptsIntoCapabilityObservation(input: RelayReceiptFoldInput): RelayReceiptFoldSummary {
  const own = input.receipts.filter((receipt) => receipt.fromOperator === input.operatorId);
  const ignoredForeignOperator = input.receipts.length - own.length;
  const outcomes = own.filter((receipt) => OUTCOME_STATUSES.has(receipt.status));
  const ignoredInFlight = own.length - outcomes.length;

  if (outcomes.length === 0) {
    return { observation: null, consideredReceipts: 0, ignoredForeignOperator, ignoredInFlight };
  }

  const completed = outcomes.filter((receipt) => receipt.status === 'completed');
  const proven = outcomes.filter(hasEvidence);
  const falseGreen = completed.filter((receipt) => !hasEvidence(receipt));
  const authorityViolations = outcomes.filter(requestsAuthority);
  const evidenceRefs = [...new Set(outcomes.flatMap((receipt) => receipt.evidenceRefs ?? []).filter((ref) => typeof ref === 'string' && ref.trim().length > 0))].sort();

  const observation: CapabilityObservation = {
    operatorId: input.operatorId,
    taskClass: input.taskClass,
    observedAt: latestCompletedAt(outcomes),
    sampleSize: outcomes.length,
    successRate: rate(completed.length, outcomes.length),
    proofRate: rate(proven.length, outcomes.length),
    falseGreenRate: rate(falseGreen.length, outcomes.length),
    authorityViolationRate: rate(authorityViolations.length, outcomes.length),
    evidenceRefs,
  };

  return { observation, consideredReceipts: outcomes.length, ignoredForeignOperator, ignoredInFlight };
}
