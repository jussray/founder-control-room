export const DELEGATED_AGENT_AUTHORITY_CONTRACT = 'fcr/delegated-agent-authority@v1' as const;
export const DELEGATED_AGENT_ACTIVATION_STATE = 'policy-only' as const;

export const DELEGATED_AGENT_PRINCIPALS = ['codex-chat', 'claude'] as const;
export const DELEGATED_AGENT_TRUSTED_REVIEWERS = ['codex-chat', 'claude', 'deterministic-witness'] as const;
export type DelegatedAgentPrincipalId = (typeof DELEGATED_AGENT_PRINCIPALS)[number];
export type DelegatedAgentAction = 'merge' | 'deploy';

export const DELEGATED_AGENT_AUTHORITY = Object.freeze({
  contract: DELEGATED_AGENT_AUTHORITY_CONTRACT,
  activationState: DELEGATED_AGENT_ACTIVATION_STATE,
  repository: 'jussray/founder-control-room',
  principals: Object.freeze({
    'codex-chat': Object.freeze({ merge_authority: true, deploy_authority: true }),
    claude: Object.freeze({ merge_authority: true, deploy_authority: true }),
  }),
  trustedReviewers: Object.freeze(DELEGATED_AGENT_TRUSTED_REVIEWERS),
  deniedCapabilities: Object.freeze([
    'database_migration',
    'database_destructive_write',
    'credential_or_secret_mutation',
    'authentication_or_rls_policy_mutation',
    'billing_or_spend',
    'public_publication_or_external_message',
    'dns_or_provider_ownership_mutation',
    'destructive_delete',
  ]),
  maxEvidenceAgeMs: 10 * 60 * 1000,
  founderApprovalTtlMs: 15 * 60 * 1000,
  trustedActivationRequirements: Object.freeze([
    'server-owned-principal-resolution',
    'provider-resolved-pr-base-head-author-diff',
    'provider-backed-independent-review-gate',
    'validated-founder-decision-receipt',
    'server-derived-execution-path-capability-classification',
    'current-provider-preflight-receipt',
    'durable-idempotency-reservation',
    'independent-post-action-outcome-verifier',
  ]),
} as const);

export type DelegatedAgentRestrictedCapability =
  (typeof DELEGATED_AGENT_AUTHORITY.deniedCapabilities)[number];

/**
 * Policy-eligibility input only.
 *
 * IMPORTANT: this object is not a trusted execution context. Its fields may be
 * assembled from candidate/caller observations and therefore can never mint
 * provider mutation authority. The future activation layer must independently
 * derive every load-bearing identity/evidence field from server-owned kernels.
 */
export type DelegatedAgentPolicyInput = Readonly<{
  principal: Readonly<{
    id: string;
    authenticatedBy: 'registered-adapter-attestation' | 'caller-assertion';
    adapterRef: string;
    attestationVerified: boolean;
  }>;
  action: DelegatedAgentAction;
  actionTarget: Readonly<{
    pullRequestNumber?: number;
    environment?: 'production';
  }>;
  repository: string;
  baseSha: string;
  headSha: string;
  currentMainSha: string;
  evidenceCheckedAt: string;
  exactHeadChecksPassed: boolean;
  independentReviewPassed: boolean;
  reviewerPrincipalId: string;
  reviewAttestationVerified: boolean;
  unresolvedBlockingFindings: number;
  rollbackReady: boolean;
  migrationState: 'aligned' | 'pending' | 'unknown';
  restrictedCapabilities: readonly DelegatedAgentRestrictedCapability[];
  founderApproval: Readonly<{
    verified: boolean;
    decisionRef: string;
    approvedAction: DelegatedAgentAction;
    approvedTarget: string;
    approvedRepository: string;
    approvedBaseSha: string;
    approvedHeadSha: string;
    approvedAt: string;
  }>;
  idempotency: Readonly<{
    key: string;
    reservationState: 'reserved' | 'consumed' | 'missing';
    reservedForAction: DelegatedAgentAction;
    reservedForTarget: string;
    reservedForBaseSha: string;
    reservedForHeadSha: string;
  }>;
}>;

export type DelegatedAgentPolicyFailure =
  | 'unsupported_action'
  | 'principal_not_registered'
  | 'principal_not_authenticated'
  | 'repository_out_of_scope'
  | 'invalid_sha'
  | 'invalid_action_target'
  | 'stale_evidence'
  | 'candidate_not_current'
  | 'required_checks_missing'
  | 'independent_review_missing'
  | 'review_not_trusted'
  | 'self_review_forbidden'
  | 'blocking_findings_present'
  | 'rollback_missing'
  | 'restricted_capability_requested'
  | 'migration_authority_not_delegated'
  | 'founder_approval_missing'
  | 'founder_approval_stale'
  | 'founder_approval_mismatch'
  | 'idempotency_reservation_missing'
  | 'idempotency_already_consumed'
  | 'idempotency_mismatch';

export type DelegatedAgentPolicyDecision =
  | Readonly<{
      eligibleForTrustedResolver: true;
      activationState: typeof DELEGATED_AGENT_ACTIVATION_STATE;
      principalId: DelegatedAgentPrincipalId;
      founderDecisionRef: string;
      merge_authority: boolean;
      deploy_authority: boolean;
      executionAuthorized: false;
      completionClaimAllowed: false;
      activationRequired: true;
    }>
  | Readonly<{
      eligibleForTrustedResolver: false;
      activationState: typeof DELEGATED_AGENT_ACTIVATION_STATE;
      reason: DelegatedAgentPolicyFailure;
      merge_authority: false;
      deploy_authority: false;
      executionAuthorized: false;
      completionClaimAllowed: false;
      activationRequired: true;
    }>;

const FULL_SHA = /^[0-9a-f]{40}$/;
const AUDIT_REF = /^[A-Za-z0-9._:-]{8,200}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,200}$/;
const ACTIONS = new Set<string>(['merge', 'deploy']);
const PRINCIPALS = new Set<string>(DELEGATED_AGENT_PRINCIPALS);
const TRUSTED_REVIEWERS = new Set<string>(DELEGATED_AGENT_TRUSTED_REVIEWERS);

function deny(reason: DelegatedAgentPolicyFailure): DelegatedAgentPolicyDecision {
  return Object.freeze({
    eligibleForTrustedResolver: false,
    activationState: DELEGATED_AGENT_ACTIVATION_STATE,
    reason,
    merge_authority: false,
    deploy_authority: false,
    executionAuthorized: false,
    completionClaimAllowed: false,
    activationRequired: true,
  });
}

function expectedActionTarget(input: DelegatedAgentPolicyInput): string | null {
  if (input.action === 'merge') {
    if (
      !Number.isInteger(input.actionTarget.pullRequestNumber)
      || Number(input.actionTarget.pullRequestNumber) <= 0
      || input.actionTarget.environment !== undefined
    ) return null;
    return `merge:${input.repository}#${input.actionTarget.pullRequestNumber}`;
  }
  if (input.action !== 'deploy') return null;
  if (input.actionTarget.environment !== 'production' || input.actionTarget.pullRequestNumber !== undefined) {
    return null;
  }
  return `deploy:${input.repository}:production`;
}

/**
 * Evaluates whether an observed request is even eligible to enter the future
 * trusted resolver. It NEVER authorizes provider mutation.
 */
export function evaluateDelegatedAgentPolicyEligibility(
  input: DelegatedAgentPolicyInput,
  now = new Date(),
): DelegatedAgentPolicyDecision {
  if (!ACTIONS.has(input.action as string)) return deny('unsupported_action');
  if (!PRINCIPALS.has(input.principal.id)) return deny('principal_not_registered');
  if (
    input.principal.authenticatedBy !== 'registered-adapter-attestation'
    || !input.principal.attestationVerified
    || !input.principal.adapterRef.trim()
  ) {
    return deny('principal_not_authenticated');
  }

  if (input.repository !== DELEGATED_AGENT_AUTHORITY.repository) {
    return deny('repository_out_of_scope');
  }

  if (!FULL_SHA.test(input.baseSha) || !FULL_SHA.test(input.headSha) || !FULL_SHA.test(input.currentMainSha)) {
    return deny('invalid_sha');
  }

  const actionTarget = expectedActionTarget(input);
  if (!actionTarget) return deny('invalid_action_target');

  const checkedAtMs = Date.parse(input.evidenceCheckedAt);
  const ageMs = now.getTime() - checkedAtMs;
  if (!Number.isFinite(checkedAtMs) || ageMs < 0 || ageMs > DELEGATED_AGENT_AUTHORITY.maxEvidenceAgeMs) {
    return deny('stale_evidence');
  }

  const candidateIsCurrent = input.action === 'merge'
    ? input.baseSha === input.currentMainSha
    : input.headSha === input.currentMainSha;
  if (!candidateIsCurrent) return deny('candidate_not_current');

  if (!input.exactHeadChecksPassed) return deny('required_checks_missing');
  if (!input.independentReviewPassed) return deny('independent_review_missing');
  if (!input.reviewAttestationVerified || !TRUSTED_REVIEWERS.has(input.reviewerPrincipalId)) {
    return deny('review_not_trusted');
  }
  if (input.reviewerPrincipalId === input.principal.id) return deny('self_review_forbidden');
  if (input.unresolvedBlockingFindings !== 0) return deny('blocking_findings_present');
  if (!input.rollbackReady) return deny('rollback_missing');
  if (input.restrictedCapabilities.length > 0) return deny('restricted_capability_requested');

  if (input.action === 'deploy' && input.migrationState !== 'aligned') {
    return deny('migration_authority_not_delegated');
  }

  if (!input.founderApproval.verified || !AUDIT_REF.test(input.founderApproval.decisionRef)) {
    return deny('founder_approval_missing');
  }
  const approvedAtMs = Date.parse(input.founderApproval.approvedAt);
  const approvalAgeMs = now.getTime() - approvedAtMs;
  if (
    !Number.isFinite(approvedAtMs)
    || approvalAgeMs < 0
    || approvalAgeMs > DELEGATED_AGENT_AUTHORITY.founderApprovalTtlMs
  ) {
    return deny('founder_approval_stale');
  }
  if (
    input.founderApproval.approvedAction !== input.action
    || input.founderApproval.approvedTarget !== actionTarget
    || input.founderApproval.approvedRepository !== input.repository
    || input.founderApproval.approvedBaseSha !== input.baseSha
    || input.founderApproval.approvedHeadSha !== input.headSha
  ) {
    return deny('founder_approval_mismatch');
  }

  if (input.idempotency.reservationState === 'missing' || !IDEMPOTENCY_KEY.test(input.idempotency.key)) {
    return deny('idempotency_reservation_missing');
  }
  if (input.idempotency.reservationState === 'consumed') {
    return deny('idempotency_already_consumed');
  }
  if (
    input.idempotency.reservedForAction !== input.action
    || input.idempotency.reservedForTarget !== actionTarget
    || input.idempotency.reservedForBaseSha !== input.baseSha
    || input.idempotency.reservedForHeadSha !== input.headSha
  ) {
    return deny('idempotency_mismatch');
  }

  const principalId = input.principal.id as DelegatedAgentPrincipalId;
  const grant = DELEGATED_AGENT_AUTHORITY.principals[principalId];
  return Object.freeze({
    eligibleForTrustedResolver: true,
    activationState: DELEGATED_AGENT_ACTIVATION_STATE,
    principalId,
    founderDecisionRef: input.founderApproval.decisionRef,
    merge_authority: input.action === 'merge' && grant.merge_authority,
    deploy_authority: input.action === 'deploy' && grant.deploy_authority,
    executionAuthorized: false,
    completionClaimAllowed: false,
    activationRequired: true,
  });
}
