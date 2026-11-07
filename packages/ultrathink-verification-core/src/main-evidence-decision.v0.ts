import type { Sha256 } from './witness-policy.v0.js';

export type MainEvidenceStateV0 = 'VERIFIED' | 'STALE' | 'UNKNOWN' | 'BLOCKED';

export type MainEvidenceReasonV0 =
  | 'RECOVERY_COMPLETE'
  | 'MAIN_SHA_CHANGED'
  | 'REQUIRED_WITNESS_MISSING'
  | 'WITNESS_SHA_MISMATCH'
  | 'WITNESS_FAILED'
  | 'WITNESS_UNRESOLVABLE'
  | 'INVALID_WITNESS_EVIDENCE'
  | 'INVALID_WITNESS_POLICY'
  | 'EVIDENCE_EXPIRED'
  | 'POLICY_CHANGED'
  | 'SCENARIO_MISMATCH'
  | 'SOURCE_AUTHORITY_UNRESOLVED';

export type MainEvidenceDecisionV0 = {
  kind: 'main-evidence-decision.v0';
  repo: string;
  branch: 'main';
  authoritativeSha?: string;
  lastVerifiedSha?: string;
  state: MainEvidenceStateV0;
  reason: MainEvidenceReasonV0;
  policyHash: Sha256;
  missingWitnessIds: readonly string[];
  evaluatedAt: string;
  correlationId: string;
};
