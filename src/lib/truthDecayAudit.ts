import {
  evaluateTruthLeaseAtUse,
  toTruthLeaseViewModel,
  type TruthDependencyObservation,
  type TruthLease,
  type TruthLeaseEvaluation,
  type TruthUseBoundary,
} from './truthLease.js';

export const TRUTH_DECAY_AUDIT_CONTRACT = 'fcr/truth-decay-audit@v1' as const;

export type TruthDecayCause =
  | 'lease-integrity'
  | 'lease-expired'
  | 'evidence-missing'
  | 'evidence-ambiguous'
  | 'authority-changed'
  | 'dependency-changed'
  | 'observation-invalid'
  | 'observation-future-dated'
  | 'observation-preverification'
  | 'observation-stale'
  | 'verification-future-dated';

export type TruthDecayHistoricalStatus =
  | 'current'
  | 'historical-verified'
  | 'untrusted';

export interface TruthDecayAuditReport {
  contract: typeof TRUTH_DECAY_AUDIT_CONTRACT;
  state: TruthLeaseEvaluation['state'];
  mayUseCurrentClaim: boolean;
  historicalStatus: TruthDecayHistoricalStatus;
  currentWording: 'current-allowed' | 'historical-only' | 'hold';
  useBoundary: TruthUseBoundary;
  observedAt: string;
  causeClasses: TruthDecayCause[];
  reasons: string[];
  dependencyCount: number;
  staleDependencyCount: number;
  invalidatedDependencyCount: number;
  unknownDependencyCount: number;
  productState: ReturnType<typeof toTruthLeaseViewModel>;
  nextGate: ReturnType<typeof toTruthLeaseViewModel>['nextGate'];
}

export interface TruthDecayTelemetry {
  event: 'fcr:truth-decay-audited';
  state: TruthLeaseEvaluation['state'];
  useBoundary: TruthUseBoundary;
  historicalStatus: TruthDecayHistoricalStatus;
  causeClasses: TruthDecayCause[];
  dependencyCount: number;
  staleDependencyCount: number;
  invalidatedDependencyCount: number;
  unknownDependencyCount: number;
  mayUseCurrentClaim: boolean;
}

const CAUSE_RULES: readonly [RegExp, TruthDecayCause][] = [
  [/contract identity is invalid|lease identity has been mutated/i, 'lease-integrity'],
  [/truth lease expired before use/i, 'lease-expired'],
  [/has no at-use observation/i, 'evidence-missing'],
  [/ambiguous duplicate at-use observations/i, 'evidence-ambiguous'],
  [/authority changed/i, 'authority-changed'],
  [/no longer matches verified truth/i, 'dependency-changed'],
  [/observation digest is invalid|observation time is invalid/i, 'observation-invalid'],
  [/observation is future-dated/i, 'observation-future-dated'],
  [/was not re-observed after the lease verification point/i, 'observation-preverification'],
  [/observation is stale at use time/i, 'observation-stale'],
  [/truth lease verification is future-dated/i, 'verification-future-dated'],
] as const;

function classifyCauses(reasons: readonly string[]): TruthDecayCause[] {
  const causes: TruthDecayCause[] = [];
  for (const reason of reasons) {
    for (const [pattern, cause] of CAUSE_RULES) {
      if (pattern.test(reason) && !causes.includes(cause)) causes.push(cause);
    }
  }
  return causes;
}

function historicalStatus(
  evaluation: TruthLeaseEvaluation,
  causeClasses: readonly TruthDecayCause[],
): TruthDecayHistoricalStatus {
  if (evaluation.state === 'current') return 'current';

  if (
    causeClasses.includes('lease-integrity')
    || causeClasses.includes('verification-future-dated')
  ) {
    return 'untrusted';
  }

  return 'historical-verified';
}

/**
 * Explain why a claim that was once lease-attested is no longer safe to use as
 * present-tense truth. This function never renews evidence, authorizes an
 * action, or performs provider reads. Callers must supply fresh authoritative
 * observations for the actual use boundary.
 */
export function auditTruthDecay({
  lease,
  observations,
  useBoundary,
  now,
}: {
  lease: TruthLease;
  observations: TruthDependencyObservation[];
  useBoundary: TruthUseBoundary;
  now: string;
}): TruthDecayAuditReport {
  const evaluation = evaluateTruthLeaseAtUse({ lease, observations, useBoundary, now });
  const productState = toTruthLeaseViewModel(evaluation);
  const causeClasses = classifyCauses(evaluation.reasons);
  const priorStatus = historicalStatus(evaluation, causeClasses);
  const currentWording = evaluation.mayUseClaim
    ? 'current-allowed'
    : priorStatus === 'historical-verified'
      ? 'historical-only'
      : 'hold';

  return Object.freeze({
    contract: TRUTH_DECAY_AUDIT_CONTRACT,
    state: evaluation.state,
    mayUseCurrentClaim: evaluation.mayUseClaim,
    historicalStatus: priorStatus,
    currentWording,
    useBoundary,
    observedAt: evaluation.observedAt,
    causeClasses: Object.freeze([...causeClasses]) as unknown as TruthDecayCause[],
    reasons: Object.freeze([...evaluation.reasons]) as unknown as string[],
    dependencyCount: evaluation.dependencyCount,
    staleDependencyCount: evaluation.staleDependencyCount,
    invalidatedDependencyCount: evaluation.invalidatedDependencyCount,
    unknownDependencyCount: evaluation.unknownDependencyCount,
    productState,
    nextGate: productState.nextGate,
  });
}

/**
 * Sanitized analytics projection. Deliberately excludes claim text, evidence
 * digests, dependency keys, provider payloads, proof references, and reasons.
 */
export function buildTruthDecayTelemetry(report: TruthDecayAuditReport): TruthDecayTelemetry {
  return Object.freeze({
    event: 'fcr:truth-decay-audited',
    state: report.state,
    useBoundary: report.useBoundary,
    historicalStatus: report.historicalStatus,
    causeClasses: Object.freeze([...report.causeClasses]) as unknown as TruthDecayCause[],
    dependencyCount: report.dependencyCount,
    staleDependencyCount: report.staleDependencyCount,
    invalidatedDependencyCount: report.invalidatedDependencyCount,
    unknownDependencyCount: report.unknownDependencyCount,
    mayUseCurrentClaim: report.mayUseCurrentClaim,
  });
}
