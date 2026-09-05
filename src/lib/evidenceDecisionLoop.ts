export const EVIDENCE_DECISION_LOOP_CONTRACT = 'juss/evidence-decision-loop@v1' as const;

export type EvidencePlane = 'source' | 'execution' | 'outcome';
export type ClaimState = 'VERIFIED' | 'OBSERVED' | 'INFERRED' | 'UNKNOWN' | 'BLOCKED';
export type SignalState = 'improved' | 'unchanged' | 'degraded' | 'unknown';

export interface EvidenceItem {
  plane: EvidencePlane;
  state: ClaimState;
  ref?: string;
  stale?: boolean;
}

export interface EvidenceDecisionInput {
  subjectFingerprint: string;
  expectedFingerprint?: string;
  evidence?: EvidenceItem[];
  signals?: {
    primary?: SignalState;
    secondary?: SignalState;
  };
  consequentialAction?: boolean;
}

export interface EvidenceDecisionResult {
  contract: typeof EVIDENCE_DECISION_LOOP_CONTRACT;
  subjectChanged: boolean;
  staleEvidence: boolean;
  executionVerified: boolean;
  outcomeVerified: boolean;
  claimState: ClaimState;
  winnerAllowed: boolean;
  recommendation: 'HOLD' | 'REOBSERVE' | 'MEASURE' | 'REVIEW' | 'PROPOSE_KEEP' | 'PROPOSE_TUNE';
  selfAuthorize: false;
  founderReviewRequired: boolean;
}

function hasVerifiedPlane(evidence: EvidenceItem[], plane: EvidencePlane): boolean {
  return evidence.some((item) => item.plane === plane && item.state === 'VERIFIED' && Boolean(item.ref));
}

function fallbackState(evidence: EvidenceItem[]): ClaimState {
  if (evidence.some((item) => item.state === 'BLOCKED')) return 'BLOCKED';
  if (evidence.some((item) => item.state === 'OBSERVED')) return 'OBSERVED';
  if (evidence.some((item) => item.state === 'INFERRED')) return 'INFERRED';
  return 'UNKNOWN';
}

export function evaluateEvidenceDecision(input: EvidenceDecisionInput): EvidenceDecisionResult {
  if (!input.subjectFingerprint.trim()) {
    throw new Error('subjectFingerprint is required');
  }

  const evidence = input.evidence ?? [];
  const subjectChanged = Boolean(
    input.expectedFingerprint && input.expectedFingerprint !== input.subjectFingerprint,
  );
  const staleEvidence = evidence.some((item) => item.stale === true);
  const executionVerified = hasVerifiedPlane(evidence, 'execution');
  const outcomeVerified = hasVerifiedPlane(evidence, 'outcome');
  const primary = input.signals?.primary ?? 'unknown';

  const winnerAllowed = !subjectChanged
    && !staleEvidence
    && outcomeVerified
    && primary === 'improved';

  let claimState: ClaimState;
  if (subjectChanged || staleEvidence) claimState = 'UNKNOWN';
  else if (outcomeVerified) claimState = 'VERIFIED';
  else if (executionVerified) claimState = 'OBSERVED';
  else claimState = fallbackState(evidence);

  let recommendation: EvidenceDecisionResult['recommendation'] = 'HOLD';
  if (subjectChanged || staleEvidence) recommendation = 'REOBSERVE';
  else if (winnerAllowed) recommendation = 'PROPOSE_KEEP';
  else if (outcomeVerified && primary === 'degraded') recommendation = 'PROPOSE_TUNE';
  else if (outcomeVerified && primary === 'unchanged') recommendation = 'REVIEW';
  else if (executionVerified && !outcomeVerified) recommendation = 'MEASURE';
  else if (input.signals?.secondary === 'improved') recommendation = 'MEASURE';

  return {
    contract: EVIDENCE_DECISION_LOOP_CONTRACT,
    subjectChanged,
    staleEvidence,
    executionVerified,
    outcomeVerified,
    claimState,
    winnerAllowed,
    recommendation,
    selfAuthorize: false,
    founderReviewRequired: input.consequentialAction ?? true,
  };
}
