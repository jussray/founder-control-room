export type EvidenceState =
  | 'evidence_complete'
  | 'evidence_incomplete'
  | 'evidence_conflicted';

export type CheckKind = 'check_run' | 'commit_status';

export type RequiredCheckIdentity = {
  kind: CheckKind;
  context: string;
  appId?: number;
};

export type CheckIdentity = RequiredCheckIdentity & {
  headSha: string;
};

export type RequiredCheckDiscoveryFinding =
  | 'required_check_visibility_incomplete'
  | 'required_check_discovery_truncated'
  | 'required_check_discovery_access_denied'
  | 'required_check_discovery_rate_limited'
  | 'required_check_discovery_timeout'
  | 'required_check_discovery_response_malformed';

export type RequiredCheckDiscovery =
  | {
      state: 'complete';
      source: 'branch_protection' | 'ruleset' | 'fcr_policy';
      requiredChecks: RequiredCheckIdentity[];
      observedAt: string;
      findings: [];
    }
  | {
      state: 'partial';
      source: 'branch_protection' | 'ruleset' | 'fcr_policy' | null;
      requiredChecks: RequiredCheckIdentity[];
      observedAt: string;
      findings: RequiredCheckDiscoveryFinding[];
    }
  | {
      state: 'unavailable';
      source: null;
      requiredChecks: [];
      observedAt: string;
      findings: RequiredCheckDiscoveryFinding[];
    };

export type NormalizedCheck = {
  kind: CheckKind;
  context: string;
  appId?: number;
  headSha: string | null;
  observedAt: string | null;
  status: string | null;
  conclusion: string | null;
  providerRunId?: string;
};

export type AuditFinding =
  | 'pr_not_open'
  | 'pr_identity_changed_during_collection'
  | 'pr_head_changed_during_collection'
  | 'pr_head_sha_malformed'
  | 'pr_observation_stale'
  | 'pr_observation_time_unknown'
  | 'required_check_visibility_incomplete'
  | 'required_check_discovery_truncated'
  | 'required_check_discovery_access_denied'
  | 'required_check_discovery_rate_limited'
  | 'required_check_discovery_timeout'
  | 'required_check_discovery_response_malformed'
  | 'required_check_discovery_stale'
  | 'required_check_discovery_time_unknown'
  | 'required_check_missing'
  | 'required_check_failed'
  | 'required_check_cancelled'
  | 'required_check_neutral'
  | 'required_check_skipped'
  | 'required_check_pending'
  | 'required_check_unknown'
  | 'ci_stale_for_head_sha'
  | 'ci_head_sha_malformed'
  | 'ci_observation_stale'
  | 'ci_observation_time_unknown'
  | 'duplicate_current_head_check_conflict'
  | 'collection_truncated'
  | 'provider_timeout'
  | 'provider_rate_limited'
  | 'provider_access_denied'
  | 'provider_response_malformed'
  | 'invalid_audit_time'
  | 'invalid_freshness_window';

export type PullRequestObservation = {
  number: number;
  state: 'open' | 'closed' | 'merged' | 'unknown';
  headSha: string | null;
  observedAt: string | null;
};

export type EvaluatePrAuditEvidenceInput = {
  initialPr: PullRequestObservation;
  finalPr: PullRequestObservation;
  requiredChecks: RequiredCheckDiscovery;
  checks: readonly NormalizedCheck[];
  findings?: readonly AuditFinding[];
  auditedAt: string;
  freshnessWindowMs?: number;
  emptyRequiredSetPolicy?: 'allow' | 'require_observation';
};

export type PrAuditEvaluation = {
  state: EvidenceState;
  currentHeadSha: string | null;
  requiredCheckCoverage: 'complete' | 'incomplete';
  findings: AuditFinding[];
};

export type ParallelFixAuditSnapshot = {
  repository: string;
  targetBranch: string;
  baseSha: string | null;
  headSha: string | null;
  prNumber: number | null;
  /** Lowercase or uppercase 64-hex SHA-256 of the canonical diff/scope representation. */
  diffFingerprint: string | null;
  evidenceState: EvidenceState;
  observedAt: string | null;
  /** Identity supplied by a trusted runtime/provider boundary, never model text alone. */
  actorId: string;
  actorIdentityState: 'verified' | 'unverified';
};

export type ParallelFixAuditFinding =
  | 'parallel_audit_not_independent'
  | 'parallel_audit_actor_identity_unverified'
  | 'parallel_audit_repository_mismatch'
  | 'parallel_audit_target_mismatch'
  | 'parallel_audit_pr_mismatch'
  | 'parallel_audit_base_moved'
  | 'parallel_audit_head_moved'
  | 'parallel_audit_diff_moved'
  | 'parallel_audit_fingerprint_malformed'
  | 'parallel_audit_evidence_incomplete'
  | 'parallel_audit_evidence_conflicted'
  | 'parallel_audit_observation_stale'
  | 'parallel_audit_observation_time_unknown'
  | 'parallel_audit_older_than_builder'
  | 'parallel_audit_invalid_audit_time'
  | 'parallel_audit_invalid_freshness_window';

export type EvaluateParallelFixAuditInput = {
  builder: ParallelFixAuditSnapshot;
  auditor: ParallelFixAuditSnapshot;
  auditedAt: string;
  freshnessWindowMs?: number;
};

export type ParallelFixAuditEvaluation = {
  state: EvidenceState;
  currentRepository: string | null;
  currentTargetBranch: string | null;
  currentBaseSha: string | null;
  currentHeadSha: string | null;
  currentPrNumber: number | null;
  currentDiffFingerprint: string | null;
  dependentProof: 'current' | 'stale';
  findings: ParallelFixAuditFinding[];
};

/**
 * Only derived truth material may be physically cleared by the stale-deletion pass.
 * Source history, audit logs, and security evidence stay preserved even after supersession.
 */
export type TruthArtifactClass =
  | 'derived_truth_artifact'
  | 'source_history'
  | 'audit_log'
  | 'security_evidence'
  | 'unknown';

export type StaleTruthArtifact = {
  artifactId: string;
  artifactClass: TruthArtifactClass;
  /** SHA-256 of the exact stale artifact payload being considered for deletion. */
  fingerprint: string | null;
};

/**
 * Continuity/proof cookie. This is an execution receipt, not an HTTP/session cookie.
 * It binds one stale artifact fingerprint to one independently observed replacement truth.
 */
export type SupersessionProofCookie = {
  /** Stable SHA-256 identity for this proof receipt, minted by a trusted runtime/provider boundary. */
  cookieId: string;
  state: 'proven' | 'proposed' | 'revoked';
  repository: string;
  targetBranch: string;
  baseSha: string | null;
  headSha: string | null;
  prNumber: number | null;
  replacementDiffFingerprint: string | null;
  supersededArtifactFingerprint: string | null;
  observedAt: string | null;
  actorId: string;
  actorIdentityState: 'verified' | 'unverified';
};

export type StaleTruthDeletionFinding =
  | 'stale_deletion_parallel_truth_not_current'
  | 'stale_deletion_parallel_identity_mismatch'
  | 'stale_deletion_current_snapshot_malformed'
  | 'stale_deletion_current_evidence_not_complete'
  | 'stale_deletion_current_actor_unverified'
  | 'stale_deletion_current_observation_stale'
  | 'stale_deletion_current_observation_time_unknown'
  | 'stale_deletion_artifact_not_trusted'
  | 'stale_deletion_artifact_integrity_mismatch'
  | 'stale_deletion_artifact_not_deletable'
  | 'stale_deletion_artifact_fingerprint_malformed'
  | 'stale_deletion_cookie_id_malformed'
  | 'stale_deletion_cookie_not_trusted'
  | 'stale_deletion_cookie_integrity_mismatch'
  | 'stale_deletion_cookie_identity_malformed'
  | 'stale_deletion_cookie_not_proven'
  | 'stale_deletion_cookie_actor_unverified'
  | 'stale_deletion_cookie_actor_mismatch'
  | 'stale_deletion_cookie_repository_mismatch'
  | 'stale_deletion_cookie_target_mismatch'
  | 'stale_deletion_cookie_pr_mismatch'
  | 'stale_deletion_cookie_base_mismatch'
  | 'stale_deletion_cookie_head_mismatch'
  | 'stale_deletion_cookie_diff_mismatch'
  | 'stale_deletion_cookie_supersession_mismatch'
  | 'stale_deletion_current_truth_targeted'
  | 'stale_deletion_cookie_observation_stale'
  | 'stale_deletion_cookie_observation_time_unknown'
  | 'stale_deletion_cookie_older_than_current'
  | 'stale_deletion_invalid_audit_time'
  | 'stale_deletion_invalid_freshness_window';

export type EvaluateStaleTruthDeletionInput = {
  parallelAudit: ParallelFixAuditEvaluation;
  /** Fresh independent auditor snapshot that represents what is true now. */
  current: ParallelFixAuditSnapshot;
  /** Caller proposal. Authority is derived only after exact lookup in trustedArtifactIndex. */
  staleArtifact: StaleTruthArtifact;
  /** Caller proposal. Authority is derived only after exact lookup in trustedProofCookieIndex. */
  proofCookie: SupersessionProofCookie;
  trustedArtifactIndex: ReadonlyMap<string, StaleTruthArtifact>;
  trustedProofCookieIndex: ReadonlyMap<string, SupersessionProofCookie>;
  auditedAt: string;
  freshnessWindowMs?: number;
};

export type StaleTruthDeletionEvaluation = {
  state: EvidenceState;
  deletionAuthority: 'authorized' | 'denied';
  staleArtifactFingerprint: string | null;
  replacementHeadSha: string | null;
  replacementDiffFingerprint: string | null;
  proofCookieId: string | null;
  findings: StaleTruthDeletionFinding[];
};
