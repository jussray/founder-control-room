/**
 * Learning OS is a peer knowledge domain, not an FCR execution authority.
 * The DB persists authoritative transitions; this pure policy rejects invalid proposals early.
 */
export const LEARNING_OS_CONTRACT = 'juss/learning-os@v1' as const;
export type LearningState =
  | 'OUTCOME_RECORDED' | 'SIGNAL_EXTRACTED' | 'INTERPRETED'
  | 'RETAINED' | 'APPLIED' | 'REVISED' | 'RETIRED';
export type LearningOutcome = 'held' | 'failed' | 'partial';

const EDGES: Readonly<Record<LearningState, readonly LearningState[]>> = {
  OUTCOME_RECORDED: ['SIGNAL_EXTRACTED', 'RETIRED'],
  SIGNAL_EXTRACTED: ['INTERPRETED', 'RETIRED'],
  INTERPRETED: ['RETAINED', 'RETIRED'],
  RETAINED: ['APPLIED', 'RETIRED'],
  APPLIED: ['REVISED', 'RETIRED'],
  REVISED: ['RETIRED'],
  RETIRED: [],
};

export function assertLearningTransition(from: LearningState, to: LearningState): void {
  if (!EDGES[from]?.includes(to)) {
    throw new Error(`LEARNING_ILLEGAL_TRANSITION: ${from} -> ${to}`);
  }
}

export function assertCrossMissionApplication(input: {
  originMissionId: string;
  targetMissionId: string;
  originDomain: string;
  targetDomain: string;
  crossDomainReason?: string | null;
}): void {
  if (!input.originMissionId || !input.targetMissionId
    || input.originMissionId === input.targetMissionId) {
    throw new Error('LEARNING_SELF_CITATION_DENIED');
  }
  if (!input.originDomain.trim() || !input.targetDomain.trim()) {
    throw new Error('LEARNING_DOMAIN_REQUIRED');
  }
  if (input.originDomain !== input.targetDomain
    && (!input.crossDomainReason?.trim() || input.crossDomainReason.trim().length < 12)) {
    throw new Error('LEARNING_CROSS_DOMAIN_REASON_REQUIRED');
  }
}

export function canClaimLearningImproved(input: {
  state: LearningState;
  observedApplicationOutcome: LearningOutcome | null;
  demonstratedImprovement: boolean;
  distinctEvidenceRefs: readonly string[];
}): boolean {
  return input.state === 'REVISED'
    && input.observedApplicationOutcome === 'held'
    && input.demonstratedImprovement
    && new Set(input.distinctEvidenceRefs.filter(Boolean)).size > 0;
}

/** Expiry creates a revalidation gate; it never deletes historical learning. */
export function lessonUsableAt(expiresAt: string, now: string): boolean {
  const until = Date.parse(expiresAt);
  const current = Date.parse(now);
  return Number.isFinite(until) && Number.isFinite(current) && until > current;
}
