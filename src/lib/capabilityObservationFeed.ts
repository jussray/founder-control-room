import type { OperatorRelayResponseV1, RelayOperatorId, RelayStatus } from './operatorRelay.js';
import type { CapabilityObservation, CapabilityTaskClass } from './modelCapabilityMarket.js';

/**
 * Folds operator relay receipts into one proof-weighted capability observation.
 *
 * This is the feed side of the model capability market: the market ranks operators from
 * `CapabilityObservation` records, and relay responses are the per-run receipts the relay
 * contract produces for work an operator actually performed. The fold is pure and deterministic
 * so the resulting observation can itself be receipted.
 *
 * Boundaries:
 * - Task classification is upstream. The caller names the task class; this fold does not infer it.
 *   The response carries no `capability`, so the caller must also join receipts with their requests
 *   if it needs to prove the receipts belong to the named task class.
 * - `accepted` receipts are in-flight, not outcomes, and are excluded from the sample.
 * - Receipts answered by a different operator are ignored, never re-attributed.
 * - Exact duplicate receipts (same `responseHash`) count once. When one `relayId` has several
 *   outcome receipts, only the latest `completedAt` counts; earlier ones are superseded.
 * - Freshness: with a `window`, receipts completed before `now - maxAgeMs` are excluded so stale
 *   evidence cannot ride on one fresh receipt. A receipt whose `completedAt` does not parse is
 *   always excluded as stale; it cannot be placed in time.
 * - Proof: a provider answering is not outcome proof. Only receipts whose `relayId` is in
 *   `verifiedRelayIds` (confirmed by an independent verifier) contribute to `proofRate` and to
 *   `evidenceRefs`. With no verifier the observation carries no evidence references, and the market's
 *   own eligibility gate keeps the operator in trial. This is deliberate: adapter-proven is not
 *   provider-outcome-proven.
 * - False green is a contract violation, not merely unverified: a `completed` receipt with zero
 *   evidence references, even if it bypassed the relay validator.
 * - Any runtime `authorityRequested` other than the exact string `'none'` (including a missing or
 *   non-string value) is an authority violation. Fail closed.
 * - `blocked` is an honest authority stop, not a failure: it stays in `sampleSize` but is excluded from
 *   the `successRate` denominator so stopping correctly never lowers an operator's score.
 * - No cost or duration is invented: the relay receipt does not carry them, so they stay undefined.
 * - `evidenceRefs` are copied into the observation and from there into every ranked candidate.
 *   Treat them as Sauce-Guard-private routing evidence, never as public content.
 * - The observation carries no selection or execution authority. It is evidence for routing only.
 */

const OUTCOME_STATUSES: ReadonlySet<RelayStatus> = new Set<RelayStatus>(['completed', 'blocked', 'failed']);

export interface RelayReceiptFoldWindow {
  now: Date;
  maxAgeMs: number;
}

export interface RelayReceiptFoldInput {
  operatorId: RelayOperatorId;
  taskClass: CapabilityTaskClass;
  receipts: readonly OperatorRelayResponseV1[];
  /** Relay ids whose outcome an independent verifier confirmed. Only these contribute proof. */
  verifiedRelayIds?: ReadonlySet<string>;
  /** Receipts completed before `now - maxAgeMs` are excluded as stale. */
  window?: RelayReceiptFoldWindow;
}

export interface RelayReceiptFoldSummary {
  observation: CapabilityObservation | null;
  consideredReceipts: number;
  ignoredForeignOperator: number;
  ignoredInFlight: number;
  ignoredDuplicate: number;
  supersededByLaterOutcome: number;
  ignoredStale: number;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function normalizedEvidenceRefs(receipt: OperatorRelayResponseV1): string[] {
  const raw: unknown = (receipt as { evidenceRefs?: unknown }).evidenceRefs;
  if (!Array.isArray(raw)) return [];
  return raw.filter((ref): ref is string => typeof ref === 'string').map((ref) => ref.trim()).filter((ref) => ref.length > 0);
}

function hasEvidence(receipt: OperatorRelayResponseV1): boolean {
  return normalizedEvidenceRefs(receipt).length > 0;
}

function requestsAuthority(receipt: OperatorRelayResponseV1): boolean {
  // The contract types this field as the literal 'none'. Compare the runtime value strictly so a
  // hand-built, forged, or malformed receipt that bypassed validation is counted, never trusted.
  return (receipt as { authorityRequested?: unknown }).authorityRequested !== 'none';
}

function completedAtMs(receipt: OperatorRelayResponseV1): number {
  const value: unknown = (receipt as { completedAt?: unknown }).completedAt;
  return typeof value === 'string' ? Date.parse(value) : Number.NaN;
}

function byCompletedAtThenHash(a: OperatorRelayResponseV1, b: OperatorRelayResponseV1): number {
  const delta = completedAtMs(a) - completedAtMs(b);
  if (delta !== 0) return delta;
  return a.responseHash < b.responseHash ? -1 : a.responseHash > b.responseHash ? 1 : 0;
}

export function foldRelayReceiptsIntoCapabilityObservation(input: RelayReceiptFoldInput): RelayReceiptFoldSummary {
  const own = input.receipts.filter((receipt) => receipt.fromOperator === input.operatorId);
  const ignoredForeignOperator = input.receipts.length - own.length;

  const outcomeCandidates = own.filter((receipt) => OUTCOME_STATUSES.has(receipt.status));
  const ignoredInFlight = own.length - outcomeCandidates.length;

  const seenHashes = new Set<string>();
  const distinct: OperatorRelayResponseV1[] = [];
  for (const receipt of outcomeCandidates) {
    if (seenHashes.has(receipt.responseHash)) continue;
    seenHashes.add(receipt.responseHash);
    distinct.push(receipt);
  }
  const ignoredDuplicate = outcomeCandidates.length - distinct.length;

  let ignoredStale = 0;
  const placeable = distinct.filter((receipt) => {
    const ms = completedAtMs(receipt);
    if (!Number.isFinite(ms)) {
      ignoredStale += 1;
      return false;
    }
    if (input.window && ms < input.window.now.getTime() - input.window.maxAgeMs) {
      ignoredStale += 1;
      return false;
    }
    return true;
  });

  const latestByRelayId = new Map<string, OperatorRelayResponseV1>();
  for (const receipt of [...placeable].sort(byCompletedAtThenHash)) {
    latestByRelayId.set(receipt.relayId, receipt);
  }
  const outcomes = [...latestByRelayId.values()].sort(byCompletedAtThenHash);
  const supersededByLaterOutcome = placeable.length - outcomes.length;

  const summaryBase = { consideredReceipts: outcomes.length, ignoredForeignOperator, ignoredInFlight, ignoredDuplicate, supersededByLaterOutcome, ignoredStale };
  if (outcomes.length === 0) {
    return { observation: null, ...summaryBase };
  }

  const verifiedIds = input.verifiedRelayIds ?? new Set<string>();
  const completed = outcomes.filter((receipt) => receipt.status === 'completed');
  const failed = outcomes.filter((receipt) => receipt.status === 'failed');
  const verified = outcomes.filter((receipt) => verifiedIds.has(receipt.relayId) && hasEvidence(receipt));
  const falseGreen = completed.filter((receipt) => !hasEvidence(receipt));
  const authorityViolations = outcomes.filter(requestsAuthority);
  const evidenceRefs = [...new Set(verified.flatMap(normalizedEvidenceRefs))].sort();
  const latest = outcomes[outcomes.length - 1]!;

  const observation: CapabilityObservation = {
    operatorId: input.operatorId,
    taskClass: input.taskClass,
    observedAt: latest.completedAt,
    sampleSize: outcomes.length,
    successRate: rate(completed.length, completed.length + failed.length),
    proofRate: rate(verified.length, outcomes.length),
    falseGreenRate: rate(falseGreen.length, outcomes.length),
    authorityViolationRate: rate(authorityViolations.length, outcomes.length),
    evidenceRefs,
  };

  return { observation, ...summaryBase };
}
