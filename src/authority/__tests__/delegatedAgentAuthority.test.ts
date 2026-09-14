import { describe, expect, it } from 'vitest';
import {
  DELEGATED_AGENT_AUTHORITY,
  evaluateDelegatedAgentPolicyEligibility,
  type DelegatedAgentAction,
  type DelegatedAgentPolicyInput,
} from '../delegatedAgentAuthority.js';

const shaA = 'a'.repeat(40);
const shaB = 'b'.repeat(40);
const now = new Date('2026-09-12T23:10:00.000Z');

function base(overrides: Partial<DelegatedAgentPolicyInput> = {}): DelegatedAgentPolicyInput {
  return {
    principal: {
      id: 'codex-chat',
      authenticatedBy: 'registered-adapter-attestation',
      adapterRef: 'openai:codex-chat:v1',
      attestationVerified: true,
    },
    action: 'merge',
    actionTarget: { pullRequestNumber: 797 },
    repository: 'jussray/founder-control-room',
    baseSha: shaA,
    headSha: shaB,
    currentMainSha: shaA,
    evidenceCheckedAt: '2026-09-12T23:05:00.000Z',
    exactHeadChecksPassed: true,
    independentReviewPassed: true,
    reviewerPrincipalId: 'claude',
    reviewAttestationVerified: true,
    unresolvedBlockingFindings: 0,
    rollbackReady: true,
    migrationState: 'aligned',
    restrictedCapabilities: [],
    founderApproval: {
      verified: true,
      decisionRef: 'founder:merge:797:0001',
      approvedAction: 'merge',
      approvedTarget: 'merge:jussray/founder-control-room#797',
      approvedRepository: 'jussray/founder-control-room',
      approvedBaseSha: shaA,
      approvedHeadSha: shaB,
      approvedAt: '2026-09-12T23:06:00.000Z',
    },
    idempotency: {
      key: 'fcr:delegated:merge:797:0001',
      reservationState: 'reserved',
      reservedForAction: 'merge',
      reservedForTarget: 'merge:jussray/founder-control-room#797',
      reservedForBaseSha: shaA,
      reservedForHeadSha: shaB,
    },
    ...overrides,
  };
}

function deploy(overrides: Partial<DelegatedAgentPolicyInput> = {}): DelegatedAgentPolicyInput {
  return base({
    action: 'deploy',
    actionTarget: { environment: 'production' },
    headSha: shaB,
    currentMainSha: shaB,
    reviewerPrincipalId: 'deterministic-witness',
    founderApproval: {
      verified: true,
      decisionRef: 'founder:deploy:production:0001',
      approvedAction: 'deploy',
      approvedTarget: 'deploy:jussray/founder-control-room:production',
      approvedRepository: 'jussray/founder-control-room',
      approvedBaseSha: shaA,
      approvedHeadSha: shaB,
      approvedAt: '2026-09-12T23:06:00.000Z',
    },
    idempotency: {
      key: 'fcr:delegated:deploy:production:0001',
      reservationState: 'reserved',
      reservedForAction: 'deploy',
      reservedForTarget: 'deploy:jussray/founder-control-room:production',
      reservedForBaseSha: shaA,
      reservedForHeadSha: shaB,
    },
    ...overrides,
  });
}

describe('delegated agent policy eligibility', () => {
  it('records merge capability but never authorizes provider mutation', () => {
    expect(evaluateDelegatedAgentPolicyEligibility(base(), now)).toMatchObject({
      eligibleForTrustedResolver: true,
      activationState: 'policy-only',
      principalId: 'codex-chat',
      founderDecisionRef: 'founder:merge:797:0001',
      merge_authority: true,
      deploy_authority: false,
      executionAuthorized: false,
      completionClaimAllowed: false,
      activationRequired: true,
    });
  });

  it('records deploy capability but remains non-authorizing until a trusted activation layer exists', () => {
    expect(evaluateDelegatedAgentPolicyEligibility(deploy({
      principal: {
        id: 'claude',
        authenticatedBy: 'registered-adapter-attestation',
        adapterRef: 'anthropic:claude:v1',
        attestationVerified: true,
      },
    }), now)).toMatchObject({
      eligibleForTrustedResolver: true,
      activationState: 'policy-only',
      principalId: 'claude',
      deploy_authority: true,
      executionAuthorized: false,
      completionClaimAllowed: false,
    });
  });

  it('rejects unknown runtime actions before any eligibility result', () => {
    const untypedAction = 'public_publication_or_external_message' as unknown as DelegatedAgentAction;
    expect(evaluateDelegatedAgentPolicyEligibility(base({ action: untypedAction }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'unsupported_action', executionAuthorized: false });
  });

  it('rejects self-asserted identity, unknown principals, and cross-repository scope', () => {
    expect(evaluateDelegatedAgentPolicyEligibility(base({ principal: { id: 'codex-chat', authenticatedBy: 'caller-assertion', adapterRef: 'claimed', attestationVerified: false } }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'principal_not_authenticated' });
    expect(evaluateDelegatedAgentPolicyEligibility(base({ principal: { id: 'other-agent', authenticatedBy: 'registered-adapter-attestation', adapterRef: 'x', attestationVerified: true } }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'principal_not_registered' });
    expect(evaluateDelegatedAgentPolicyEligibility(base({ repository: 'jussray/other-repo' }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'repository_out_of_scope' });
  });

  it('rejects stale proof, stale candidates, and malformed action targets', () => {
    expect(evaluateDelegatedAgentPolicyEligibility(base({ evidenceCheckedAt: '2026-09-12T22:00:00.000Z' }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'stale_evidence' });
    expect(evaluateDelegatedAgentPolicyEligibility(base({ currentMainSha: 'c'.repeat(40) }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'candidate_not_current' });
    expect(evaluateDelegatedAgentPolicyEligibility(base({ actionTarget: { environment: 'production' } }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'invalid_action_target' });
  });

  it('rejects untrusted or self review and unresolved blockers at the policy preflight', () => {
    expect(evaluateDelegatedAgentPolicyEligibility(base({ reviewerPrincipalId: 'random-agent' }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'review_not_trusted' });
    expect(evaluateDelegatedAgentPolicyEligibility(base({ reviewAttestationVerified: false }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'review_not_trusted' });
    expect(evaluateDelegatedAgentPolicyEligibility(base({ reviewerPrincipalId: 'codex-chat' }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'self_review_forbidden' });
    expect(evaluateDelegatedAgentPolicyEligibility(base({ unresolvedBlockingFindings: 1 }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'blocking_findings_present' });
    expect(evaluateDelegatedAgentPolicyEligibility(base({ rollbackReady: false }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'rollback_missing' });
  });

  it('requires fresh exact founder approval before a request can even reach the trusted resolver', () => {
    expect(evaluateDelegatedAgentPolicyEligibility(base({ founderApproval: { ...base().founderApproval, verified: false } }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'founder_approval_missing' });
    expect(evaluateDelegatedAgentPolicyEligibility(base({ founderApproval: { ...base().founderApproval, approvedAt: '2026-09-12T22:00:00.000Z' } }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'founder_approval_stale' });
    expect(evaluateDelegatedAgentPolicyEligibility(base({ founderApproval: { ...base().founderApproval, approvedHeadSha: 'c'.repeat(40) } }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'founder_approval_mismatch' });
  });

  it('does not inherit migrations or other restricted capabilities', () => {
    for (const capability of DELEGATED_AGENT_AUTHORITY.deniedCapabilities) {
      expect(evaluateDelegatedAgentPolicyEligibility(base({ restrictedCapabilities: [capability] }), now))
        .toMatchObject({ eligibleForTrustedResolver: false, reason: 'restricted_capability_requested' });
    }
    expect(evaluateDelegatedAgentPolicyEligibility(deploy({ migrationState: 'pending' }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'migration_authority_not_delegated' });
  });

  it('rejects missing, consumed, or mismatched execution reservations', () => {
    expect(evaluateDelegatedAgentPolicyEligibility(base({ idempotency: { ...base().idempotency, reservationState: 'missing' } }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'idempotency_reservation_missing' });
    expect(evaluateDelegatedAgentPolicyEligibility(base({ idempotency: { ...base().idempotency, reservationState: 'consumed' } }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'idempotency_already_consumed' });
    expect(evaluateDelegatedAgentPolicyEligibility(base({ idempotency: { ...base().idempotency, reservedForHeadSha: 'c'.repeat(40) } }), now))
      .toMatchObject({ eligibleForTrustedResolver: false, reason: 'idempotency_mismatch' });
  });

  it('cannot promote any policy-eligibility packet into a completion claim', () => {
    const eligible = evaluateDelegatedAgentPolicyEligibility(deploy(), now);
    expect(eligible).toMatchObject({
      eligibleForTrustedResolver: true,
      executionAuthorized: false,
      completionClaimAllowed: false,
      activationRequired: true,
    });
  });
});
