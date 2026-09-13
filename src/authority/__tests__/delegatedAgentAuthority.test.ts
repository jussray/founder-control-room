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

describe('delegated agent authority', () => {
  it('grants exact merge authority to authenticated Codex Chat', () => {
    expect(evaluateDelegatedAgentAuthority(base(), now)).toMatchObject({
      ok: true,
      principalId: 'codex-chat',
      merge_authority: true,
      deploy_authority: false,
      executionAuthorized: true,
    });
  });

  it('grants deploy authority to authenticated Claude only on exact current main with aligned migrations', () => {
    const result = evaluateDelegatedAgentAuthority(base({
      principal: {
        id: 'claude',
        authenticatedBy: 'registered-adapter-attestation',
        adapterRef: 'anthropic:claude:v1',
        attestationVerified: true,
      },
      action: 'deploy',
      actionTarget: { environment: 'production' },
      headSha: shaB,
      currentMainSha: shaB,
      reviewerPrincipalId: 'deterministic-witness',
      idempotency: {
        key: 'fcr:delegated:deploy:production:0001',
        reservationState: 'reserved',
        reservedForAction: 'deploy',
        reservedForTarget: 'deploy:jussray/founder-control-room:production',
        reservedForBaseSha: shaA,
        reservedForHeadSha: shaB,
      },
    }), now);
    expect(result).toMatchObject({ ok: true, principalId: 'claude', deploy_authority: true });
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

  it('does not inherit migrations or other restricted capabilities', () => {
    for (const capability of DELEGATED_AGENT_AUTHORITY.deniedCapabilities) {
      expect(evaluateDelegatedAgentAuthority(base({ restrictedCapabilities: [capability] }), now))
        .toMatchObject({ ok: false, reason: 'restricted_capability_requested' });
    }
    expect(evaluateDelegatedAgentAuthority(base({
      action: 'deploy',
      actionTarget: { environment: 'production' },
      headSha: shaB,
      currentMainSha: shaB,
      migrationState: 'pending',
      idempotency: {
        key: 'fcr:delegated:deploy:production:0002',
        reservationState: 'reserved',
        reservedForAction: 'deploy',
        reservedForTarget: 'deploy:jussray/founder-control-room:production',
        reservedForBaseSha: shaA,
        reservedForHeadSha: shaB,
      },
    }), now)).toMatchObject({ ok: false, reason: 'migration_authority_not_delegated' });
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
    const deploy = base({
      action: 'deploy',
      actionTarget: { environment: 'production' },
      headSha: shaB,
      currentMainSha: shaB,
      reviewerPrincipalId: 'claude',
      idempotency: {
        key: 'fcr:delegated:deploy:production:0003',
        reservationState: 'reserved',
        reservedForAction: 'deploy',
        reservedForTarget: 'deploy:jussray/founder-control-room:production',
        reservedForBaseSha: shaA,
        reservedForHeadSha: shaB,
      },
      postActionOutcomeVerified: false,
    });
    expect(evaluateDelegatedAgentAuthority(deploy, now)).toMatchObject({ ok: true, deploy_authority: true, completionClaimAllowed: false });
    expect(evaluateDelegatedAgentAuthority({ ...deploy, postActionOutcomeVerified: true }, now))
      .toMatchObject({ ok: true, completionClaimAllowed: true });
  });
});
