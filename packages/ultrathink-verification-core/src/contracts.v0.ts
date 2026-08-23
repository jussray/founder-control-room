export type Sha256 = `sha256:${string}`;
export type MainEvidenceState = 'VERIFIED' | 'STALE' | 'UNKNOWN' | 'BLOCKED';

export type SourceAuthorityV0 = {
  kind: 'source-authority.v0';
  repo: string;
  branch: 'main';
  authoritativeSha: string;
  observedAt: string;
  source: string;
  correlationId: string;
};

export type WitnessRequirementV0 = {
  id: string;
  class: 'code' | 'runtime' | 'product';
  exactShaRequired: true;
  freshnessWindowSeconds?: number;
  contractVersion?: string;
  scenarioFingerprint?: Sha256;
};

export type WitnessPolicyV0 = {
  kind: 'witness-policy.v0';
  policyVersion: string;
  policyHash: Sha256;
  repo: string;
  requiredWitnesses: readonly WitnessRequirementV0[];
};

export type WitnessResultStateV0 = 'PASS' | 'FAIL' | 'MISSING' | 'STALE' | 'UNRESOLVABLE';

export type WitnessResultV0 = {
  kind: 'witness-result.v0';
  witnessId: string;
  state: WitnessResultStateV0;
  evaluatedSha?: string;
  policyHash: Sha256;
  scenarioFingerprint?: Sha256;
  evidenceRef?: string;
  evidenceHash?: Sha256;
  observedAt?: string;
  expiresAt?: string;
  correlationId: string;
};

export type MainEvidenceReasonV0 =
  | 'RECOVERY_COMPLETE'
  | 'MAIN_SHA_CHANGED'
  | 'REQUIRED_WITNESS_MISSING'
  | 'WITNESS_SHA_MISMATCH'
  | 'WITNESS_FAILED'
  | 'WITNESS_UNRESOLVABLE'
  | 'EVIDENCE_EXPIRED'
  | 'POLICY_CHANGED'
  | 'SCENARIO_MISMATCH'
  | 'INVALID_WITNESS_EVIDENCE'
  | 'SOURCE_AUTHORITY_UNRESOLVED';

export type RecoveryActionV0 =
  | 'REACQUIRE_REQUIRED_WITNESSES'
  | 'RESOLVE_SOURCE_AUTHORITY'
  | 'RETRY_FAILED_WITNESS'
  | 'RESOLVE_WITNESS_EVIDENCE'
  | 'INVESTIGATE_SHA_MISMATCH'
  | 'REVIEW_POLICY_CHANGE'
  | 'NO_ACTION_REQUIRED';

export type MainEvidenceDecisionV0 = {
  kind: 'main-evidence-decision.v0';
  repo: string;
  branch: 'main';
  authoritativeSha?: string;
  lastVerifiedSha?: string;
  state: MainEvidenceState;
  reason: MainEvidenceReasonV0;
  policyHash: Sha256;
  missingWitnessIds: readonly string[];
  failedWitnessIds: readonly string[];
  staleWitnessIds: readonly string[];
  mismatchedWitnessIds: readonly string[];
  unresolvableWitnessIds: readonly string[];
  nextRequiredAction: RecoveryActionV0;
  evaluatedAt: string;
  correlationId: string;
};

export type ContinuityTransitionV0 = {
  kind: 'continuity-transition.v0';
  repo: string;
  branch: 'main';
  from?: MainEvidenceState;
  to: MainEvidenceState;
  reason: MainEvidenceReasonV0;
  authoritativeSha?: string;
  lastVerifiedSha?: string;
  policyHash: Sha256;
  evidenceFingerprint?: Sha256;
  priorTransitionId?: string;
  occurredAt: string;
  correlationId: string;
};

export type VerificationProjectionV0 = {
  kind: 'verification-projection.v0';
  repo: string;
  authoritativeSha?: string;
  lastVerifiedSha?: string;
  state: MainEvidenceState;
  reason: MainEvidenceReasonV0;
  nextRequiredAction: RecoveryActionV0;
  missingWitnessIds: readonly string[];
  blockingConditions: readonly string[];
  policyHash: Sha256;
  evaluatedAt: string;
};
