export const DELEGATED_AGENT_AUTHORITY_CONTRACT = 'fcr/delegated-agent-authority@v1' as const;

export const DELEGATED_AGENT_PRINCIPALS = ['codex-chat', 'claude'] as const;
export const DELEGATED_AGENT_TRUSTED_REVIEWERS = ['codex-chat', 'claude', 'deterministic-witness'] as const;
export type DelegatedAgentPrincipalId = (typeof DELEGATED_AGENT_PRINCIPALS)[number];
export type DelegatedAgentAction = 'merge' | 'deploy';

export const DELEGATED_AGENT_AUTHORITY = Object.freeze({
  contract: DELEGATED_AGENT_AUTHORITY_CONTRACT,
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
} as const);

export type DelegatedAgentRestrictedCapability =
  (typeof DELEGATED_AGENT_AUTHORITY.deniedCapabilities)[number];

export type DelegatedAgentAuthorityInput = Readonly<{
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
  idempotency: Readonly<{
    key: string;
    reservationState: 'reserved' | 'consumed' | 'missing';
    reservedForAction: DelegatedAgentAction;
    reservedForTarget: string;
    reservedForBaseSha: string;
    reservedForHeadSha: string;
  }>;
  postActionOutcomeVerified?: boolean;
}>;

export type DelegatedAgentAuthorityFailure =
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
  | 'idempotency_reservation_missing'
  | 'idempotency_already_consumed'
  | 'idempotency_mismatch';

export type DelegatedAgentAuthorityDecision =
  | Readonly<{
      ok: true;
      principalId: DelegatedAgentPrincipalId;
      merge_authority: boolean;
      deploy_authority: boolean;
      executionAuthorized: true;
      completionClaimAllowed: boolean;
    }>
  | Readonly<{
      ok: false;
      reason: DelegatedAgentAuthorityFailure;
      merge_authority: false;
      deploy_authority: false;
      executionAuthorized: false;
      completionClaimAllowed: false;
    }>;

const FULL_SHA = /^[0-9a-f]{40}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,200}$/;
const PRINCIPALS = new Set<string>(DELEGATED_AGENT_PRINCIPALS);
const TRUSTED_REVIEWERS = new Set<string>(DELEGATED_AGENT_TRUSTED_REVIEWERS);

function deny(reason: DelegatedAgentAuthorityFailure): DelegatedAgentAuthorityDecision {
  return Object.freeze({
    ok: false,
    reason,
    merge_authority: false,
    deploy_authority: false,
    executionAuthorized: false,
    completionClaimAllowed: false,
  });
}

function expectedActionTarget(input: DelegatedAgentAuthorityInput): string | null {
  if (input.action === 'merge') {
    if (
      !Number.isInteger(input.actionTarget.pullRequestNumber)
      || Number(input.actionTarget.pullRequestNumber) <= 0
      || input.actionTarget.environment !== undefined
    ) return null;
    return `merge:${input.repository}#${input.actionTarget.pullRequestNumber}`;
  }
  if (input.actionTarget.environment !== 'production' || input.actionTarget.pullRequestNumber !== undefined) {
    return null;
  }
  return `deploy:${input.repository}:production`;
}

export function evaluateDelegatedAgentAuthority(
  input: DelegatedAgentAuthorityInput,
  now = new Date(),
): DelegatedAgentAuthorityDecision {
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
    ok: true,
    principalId,
    merge_authority: input.action === 'merge' && grant.merge_authority,
    deploy_authority: input.action === 'deploy' && grant.deploy_authority,
    executionAuthorized: true,
    completionClaimAllowed: input.action === 'deploy' && input.postActionOutcomeVerified === true,
  });
}
