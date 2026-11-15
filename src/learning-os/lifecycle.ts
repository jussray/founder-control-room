import type { LearningPhase } from './learningOs.js';

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

/**
 * Explicit compatibility between the append-only study kernel and the SQL
 * operational ledger. This is an observation-only translation, not a state
 * transition, an authority claim, or proof of a provider outcome.
 *
 * Important:
 * - A study "learned" phase is only a hypothesis/candidate until independently
 *   proven future reuse. It is not a separate database execution status.
 * - SQL REVISED is an *application review*, NOT a revised hypothesis.
 * - Challenged/revised study branches have no SQL representation in v1.
 *   Those must HOLD instead of silently being projected as RETAINED/REVISED.
 */
export type StudyLedgerProjection =
  | { status: 'supported'; studyPhase: LearningPhase; ledgerState: LearningState; demonstratedByPhase: false; explanation: string }
  | { status: 'unsupported'; studyPhase: LearningPhase; ledgerState: null; demonstratedByPhase: false; explanation: string };

const PHASE_TO_LEDGER: Readonly<Record<LearningPhase, LearningState | null>> = Object.freeze({
  observed: 'OUTCOME_RECORDED',
  interpreted: 'INTERPRETED', // Requires independently captured signal and hypothesis.
  learned: 'INTERPRETED', // Candidate only, never proof of application.
  retained: 'RETAINED',
  applied: 'APPLIED',
  improved: 'REVISED', // SQL REVIEW result; improvement needs distinct measured evidence.
  challenged: null, // No SQL challenge event exists yet.
  revised: null, // SQL REVISED does NOT mean study hypothesis revision.
});

export function projectLearningStudyPhase(phase: LearningPhase): StudyLedgerProjection {
  // Reject unknown/poisoned phases rather than defaulting to RETAINED.
  if (!Object.hasOwn(PHASE_TO_LEDGER, phase)) throw new Error('LEARNING_UNKNOWN_STUDY_PHASE');
  const ledgerState = PHASE_TO_LEDGER[phase];
  if (ledgerState === null) return {
    status: 'unsupported', studyPhase: phase, ledgerState: null, demonstratedByPhase: false,
    explanation: 'No durable SQL phase for challenge/reinterpretation; hold until an independently verified knowledge transition is persisted.',
  };
  return {
    status: 'supported', studyPhase: phase, ledgerState, demonstratedByPhase: false,
    explanation: phase === 'learned'
      ? 'A studied hypothesis is not demonstrated reuse or improvement.'
      : phase === 'improved'
        ? 'REVISED in SQL is an application review, not proof of measured improvement. Verify downstream outcome and metrics.'
        : 'A phase mapping alone is not evidence and grants no authority.',
  };
}

export function compareStudyToLedger(phase: LearningPhase, persistedState: LearningState): {
  aligned: boolean;
  status: 'matched_vocabulary' | 'unrepresented_phase' | 'different_state';
  authorizesExecution: false;
  learningDemonstrated: false;
  improved: false;
  nextGate: string;
} {
  const mapping = projectLearningStudyPhase(phase);
  const aligned = mapping.status === 'supported' && mapping.ledgerState === persistedState;
  const status = mapping.status === 'unsupported' ? 'unrepresented_phase'
    : aligned ? 'matched_vocabulary' : 'different_state';
  return {
    aligned,
    status,
    authorizesExecution: false,
    learningDemonstrated: false,
    improved: false,
    nextGate: aligned
      ? 'Verify independent source, cross-mission application, and outcome receipts before asserting demonstrated learning.'
      : mapping.explanation,
  };
}

/**
 * This deterministic projection accepts evidence flags only from a trusted
 * receipt verifier. It is NOT an evidence verifier or a mutation gate itself.
 * Missing proof blocks rather than guessing the ledger state. In particular,
 * study "learned" means candidate interpretation, not demonstrated reuse.
 */
export const LEARNING_STUDY_PHASES = Object.freeze([
  'observed', 'interpreted', 'learned', 'retained',
  'applied', 'improved', 'challenged', 'revised',
] as const satisfies readonly LearningPhase[]);

export interface LearningReceiptChain {
  originOutcomeVerified: boolean;
  originExecutionVerified: boolean;
  signalVerified: boolean;
  interpretationVerified: boolean;
  retentionVerified: boolean;
  downstreamExecutionVerified: boolean;
  downstreamOutcomeVerified: boolean;
  distinctMissionVerified: boolean;
  sameDomain: boolean;
  crossDomainFounderPermissionVerified: boolean;
  reviewVerified: boolean;
  baselineMeasurementVerified: boolean;
  currentMeasurementVerified: boolean;
  directionalImprovementVerified: boolean;
}

export function expectedLedgerStateFromProofChain(
  phase: LearningPhase,
  proofs: Readonly<LearningReceiptChain>,
): {
  state: LearningState | null;
  eligibleForReconciliation: boolean;
  missing: readonly (keyof LearningReceiptChain)[];
  authorizesExecution: false;
  learningDemonstrated: false;
  improved: false;
} {
  const mapping = projectLearningStudyPhase(phase);
  if (mapping.status === 'unsupported') {
    return {
      state: null, eligibleForReconciliation: false, missing: [],
      authorizesExecution: false, learningDemonstrated: false, improved: false,
    };
  }
  const required: (keyof LearningReceiptChain)[] = [
    'originOutcomeVerified', 'originExecutionVerified',
  ];
  if (['interpreted', 'learned', 'retained', 'applied', 'improved'].includes(phase)) {
    required.push('signalVerified', 'interpretationVerified');
  }
  if (['retained', 'applied', 'improved'].includes(phase)) {
    required.push('retentionVerified');
  }
  if (phase === 'applied' || phase === 'improved') {
    required.push('downstreamExecutionVerified', 'downstreamOutcomeVerified', 'distinctMissionVerified');
    if (!proofs.sameDomain) required.push('crossDomainFounderPermissionVerified');
  }
  if (phase === 'improved') {
    required.push('reviewVerified', 'baselineMeasurementVerified',
      'currentMeasurementVerified', 'directionalImprovementVerified');
  }
  const missing = required.filter((key) => proofs[key] !== true);
  return {
    state: missing.length === 0 ? mapping.ledgerState : null,
    eligibleForReconciliation: missing.length === 0,
    missing,
    authorizesExecution: false,
    // A pure evidence summary is never a substitute for persisted provider receipts.
    learningDemonstrated: false,
    improved: false,
  };
}
