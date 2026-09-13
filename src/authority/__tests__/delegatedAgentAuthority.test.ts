import { describe, expect, it } from 'vitest';
import {
  DELEGATED_AGENT_AUTHORITY,
  evaluateDelegatedAgentAuthority,
  type DelegatedAgentAuthorityInput,
} from '../delegatedAgentAuthority.js';

const shaA = 'a'.repeat(40);
const shaB = 'b'.repeat(40);
const now = new Date('2026-09-12T23:10:00.000Z');

function base(overrides: Partial<DelegatedAgentAuthorityInput> = {}): DelegatedAgentAuthorityInput {
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

function deploy(overrides: Partial<DelegatedAgentAuthorityInput> = {}): DelegatedAgentAuthorityInput {
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

describe('delegated agent authority', () => {
  it('grants exact merge execution only with authenticated principal and exact founder approval', () => {
    expect(evaluateDelegatedAgentAuthority(base(), now)).toMatchObject({
      ok: true,
      principalId: 'codex-chat',
      founderDecisionRef: 'founder:merge:797:0001',
      merge_authority: true,
      deploy_authority: false,
      executionAuthorized: true,
    });
  });

  it('grants exact production deploy execution only with exact founder approval and aligned migrations', () => {
    expect(evaluateDelegatedAgentAuthority(deploy({
      principal: {
        id: 'claude',
        authenticatedBy: 'registered-adapter-attestation',
        adapterRef: 'anthropic:claude:v1',
        attestationVerified: true,
      },
    }), now)).toMatchObject({
      ok: true,
      principalId: 'claude',
      founderDecisionRef: 'founder:deploy:production:0001',
      deploy_authority: true,
    });
  });

  it('rejects self-asserted identity, unknown principals, and cross-repository scope', () => {
    expect(evaluateDelegatedAgentAuthority(base({ principal: { id: 'codex-chat', authenticatedBy: 'caller-assertion', adapterRef: 'claimed', attestationVerified: false } }), now))
      .toMatchObject({ ok: false, reason: 'principal_not_authenticated' });
    expect(evaluateDelegatedAgentAuthority(base({ principal: { id: 'other-agent', authenticatedBy: 'registered-adapter-attestation', adapterRef: 'x', attestationVerified: true } }), now))
      .toMatchObject({ ok: false, reason: 'principal_not_registered' });
    expect(evaluateDelegatedAgentAuthority(base({ repository: 'jussray/other-repo' }), now))
      .toMatchObject({ ok: false, reason: 'repository_out_of_scope' });
  });

  it('rejects stale proof, stale candidates, and malformed action targets', () => {
    expect(evaluateDelegatedAgentAuthority(base({ evidenceCheckedAt: '2026-09-12T22:00:00.000Z' }), now))
      .toMatchObject({ ok: false, reason: 'stale_evidence' });
    expect(evaluateDelegatedAgentAuthority(base({ currentMainSha: 'c'.repeat(40) }), now))
      .toMatchObject({ ok: false, reason: 'candidate_not_current' });
    expect(evaluateDelegatedAgentAuthority(base({ actionTarget: { environment: 'production' } }), now))
      .toMatchObject({ ok: false, reason: 'invalid_action_target' });
  });

  it('rejects untrusted or self review and unresolved blockers', () => {
    expect(evaluateDelegatedAgentAuthority(base({ reviewerPrincipalId: 'random-agent' }), now))
      .toMatchObject({ ok: false, reason: 'review_not_trusted' });
    expect(evaluateDelegatedAgentAuthority(base({ reviewAttestationVerified: false }), now))
      .toMatchObject({ ok: false, reason: 'review_not_trusted' });
    expect(evaluateDelegatedAgentAuthority(base({ reviewerPrincipalId: 'codex-chat' }), now))
      .toMatchObject({ ok: false, reason: 'self_review_forbidden' });
    expect(evaluateDelegatedAgentAuthority(base({ unresolvedBlockingFindings: 1 }), now))
      .toMatchObject({ ok: false, reason: 'blocking_findings_present' });
    expect(evaluateDelegatedAgentAuthority(base({ rollbackReady: false }), now))
      .toMatchObject({ ok: false, reason: 'rollback_missing' });
  });

  it('requires fresh exact founder approval for every merge or deploy', () => {
    expect(evaluateDelegatedAgentAuthority(base({ founderApproval: { ...base().founderApproval, verified: false } }), now))
      .toMatchObject({ ok: false, reason: 'founder_approval_missing' });
    expect(evaluateDelegatedAgentAuthority(base({ founderApproval: { ...base().founderApproval, decisionRef: '' } }), now))
      .toMatchObject({ ok: false, reason: 'founder_approval_missing' });
    expect(evaluateDelegatedAgentAuthority(base({ founderApproval: { ...base().founderApproval, approvedAt: '2026-09-12T22:00:00.000Z' } }), now))
      .toMatchObject({ ok: false, reason: 'founder_approval_stale' });
    expect(evaluateDelegatedAgentAuthority(base({ founderApproval: { ...base().founderApproval, approvedHeadSha: 'c'.repeat(40) } }), now))
      .toMatchObject({ ok: false, reason: 'founder_approval_mismatch' });
    expect(evaluateDelegatedAgentAuthority(base({ founderApproval: { ...base().founderApproval, approvedTarget: 'merge:jussray/founder-control-room#798' } }), now))
      .toMatchObject({ ok: false, reason: 'founder_approval_mismatch' });
  });

  it('does not inherit migrations or other restricted capabilities', () => {
    for (const capability of DELEGATED_AGENT_AUTHORITY.deniedCapabilities) {
      expect(evaluateDelegatedAgentAuthority(base({ restrictedCapabilities: [capability] }), now))
        .toMatchObject({ ok: false, reason: 'restricted_capability_requested' });
    }
    expect(evaluateDelegatedAgentAuthority(deploy({ migrationState: 'pending' }), now))
      .toMatchObject({ ok: false, reason: 'migration_authority_not_delegated' });
  });

  it('rejects missing, consumed, or mismatched execution reservations', () => {
    expect(evaluateDelegatedAgentAuthority(base({ idempotency: { ...base().idempotency, reservationState: 'missing' } }), now))
      .toMatchObject({ ok: false, reason: 'idempotency_reservation_missing' });
    expect(evaluateDelegatedAgentAuthority(base({ idempotency: { ...base().idempotency, reservationState: 'consumed' } }), now))
      .toMatchObject({ ok: false, reason: 'idempotency_already_consumed' });
    expect(evaluateDelegatedAgentAuthority(base({ idempotency: { ...base().idempotency, reservedForHeadSha: 'c'.repeat(40) } }), now))
      .toMatchObject({ ok: false, reason: 'idempotency_mismatch' });
    expect(evaluateDelegatedAgentAuthority(base({ idempotency: { ...base().idempotency, reservedForTarget: 'merge:jussray/founder-control-room#999' } }), now))
      .toMatchObject({ ok: false, reason: 'idempotency_mismatch' });
  });

  it('keeps execution authority separate from outcome truth', () => {
    const accepted = deploy({ postActionOutcomeVerified: false });
    expect(evaluateDelegatedAgentAuthority(accepted, now)).toMatchObject({
      ok: true,
      deploy_authority: true,
      completionClaimAllowed: false,
    });
    expect(evaluateDelegatedAgentAuthority({ ...accepted, postActionOutcomeVerified: true }, now))
      .toMatchObject({ ok: true, completionClaimAllowed: true });
  });
});
