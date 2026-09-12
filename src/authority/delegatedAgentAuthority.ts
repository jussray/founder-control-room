export const DELEGATED_AGENT_AUTHORITY_CONTRACT = 'fcr/delegated-agent-authority@v1' as const;

export const DELEGATED_AGENT_PRINCIPALS = ['codex-chat', 'claude'] as const;
export type DelegatedAgentPrincipalId = (typeof DELEGATED_AGENT_PRINCIPALS)[number];
export type DelegatedAgentAction = 'merge' | 'deploy';

export const DELEGATED_AGENT_AUTHORITY = Object.freeze({
  contract: DELEGATED_AGENT_AUTHORITY_CONTRACT,
  repository: 'jussray/founder-control-room',
  principals: Object.freeze({
    'codex-chat': Object.freeze({ merge_authority: true, deploy_authority: true }),
    claude: Object.freeze({ merge_authority: true, deploy_authority: true }),
  }),
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
  repository: string;
  baseSha: string;
  headSha: string;
  currentMainSha: string;
  evidenceCheckedAt: string;
  exactHeadChecksPassed: boolean;
  independentReviewPassed: boolean;
  reviewerPrincipalId: string;
  unresolvedBlockingFindings: number;
  rollbackReady: boolean;
  migrationState: 'aligned' | 'pending' | 'unknown';
  restrictedCapabilities: readonly DelegatedAgentRestrictedCapability[];
  postActionOutcomeVerified?: boolean;
}>;

export type DelegatedAgentAuthorityFailure =
  | 'principal_not_registered'
  | 'principal_not_authenticated'
  | 'repository_out_of_scope'
  | 'invalid_sha'
  | 'stale_evidence'
  | 'candidate_not_current'
  | 'required_checks_missing'
  | 'independent_review_missing'
  | 'self_review_forbidden'
  | 'blocking_findings_present'
  | 'rollback_missing'
  | 'restricted_capability_requested'
  | 'migration_authority_not_delegated';

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
const PRINCIPALS = new Set<string>(DELEGATED_AGENT_PRINCIPALS);

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
  if (input.reviewerPrincipalId === input.principal.id) return deny('self_review_forbidden');
  if (input.unresolvedBlockingFindings !== 0) return deny('blocking_findings_present');
  if (!input.rollbackReady) return deny('rollback_missing');
  if (input.restrictedCapabilities.length > 0) return deny('restricted_capability_requested');

  if (input.action === 'deploy' && input.migrationState !== 'aligned') {
    return deny('migration_authority_not_delegated');
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
