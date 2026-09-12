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

  it('grants exact deploy authority to authenticated Claude only on exact current main with aligned migrations', () => {
    const result = evaluateDelegatedAgentAuthority(base({
      principal: {
        id: 'claude',
        authenticatedBy: 'registered-adapter-attestation',
        adapterRef: 'anthropic:claude:v1',
        attestationVerified: true,
      },
      action: 'deploy',
      baseSha: shaA,
      headSha: shaB,
      currentMainSha: shaB,
      reviewerPrincipalId: 'deterministic-witness',
      reviewAttestationVerified: true,
    }), now);
    expect(result).toMatchObject({ ok: true, principalId: 'claude', deploy_authority: true });
  });

  it('rejects caller-asserted principal identity', () => {
    expect(evaluateDelegatedAgentAuthority(base({
      principal: {
        id: 'codex-chat',
        authenticatedBy: 'caller-assertion',
        adapterRef: 'claimed',
        attestationVerified: false,
      },
    }), now)).toMatchObject({ ok: false, reason: 'principal_not_authenticated' });
  });

  it('rejects unknown principals and cross-repository scope bleed', () => {
    expect(evaluateDelegatedAgentAuthority(base({ principal: { id: 'other-agent', authenticatedBy: 'registered-adapter-attestation', adapterRef: 'x', attestationVerified: true } }), now))
      .toMatchObject({ ok: false, reason: 'principal_not_registered' });
    expect(evaluateDelegatedAgentAuthority(base({ repository: 'jussray/other-repo' }), now))
      .toMatchObject({ ok: false, reason: 'repository_out_of_scope' });
  });

  it('rejects stale evidence and stale candidates', () => {
    expect(evaluateDelegatedAgentAuthority(base({ evidenceCheckedAt: '2026-09-12T22:00:00.000Z' }), now))
      .toMatchObject({ ok: false, reason: 'stale_evidence' });
    expect(evaluateDelegatedAgentAuthority(base({ currentMainSha: 'c'.repeat(40) }), now))
      .toMatchObject({ ok: false, reason: 'candidate_not_current' });
  });

  it('rejects untrusted review identities and unverified review attestations', () => {
    expect(evaluateDelegatedAgentAuthority(base({ reviewerPrincipalId: 'random-agent' }), now))
      .toMatchObject({ ok: false, reason: 'review_not_trusted' });
    expect(evaluateDelegatedAgentAuthority(base({ reviewAttestationVerified: false }), now))
      .toMatchObject({ ok: false, reason: 'review_not_trusted' });
  });

  it('rejects self-review, unresolved blockers, and missing rollback', () => {
    expect(evaluateDelegatedAgentAuthority(base({ reviewerPrincipalId: 'codex-chat' }), now))
      .toMatchObject({ ok: false, reason: 'self_review_forbidden' });
    expect(evaluateDelegatedAgentAuthority(base({ unresolvedBlockingFindings: 1 }), now))
      .toMatchObject({ ok: false, reason: 'blocking_findings_present' });
    expect(evaluateDelegatedAgentAuthority(base({ rollbackReady: false }), now))
      .toMatchObject({ ok: false, reason: 'rollback_missing' });
  });

  it('does not inherit migration, secrets, auth, billing, publication, or destructive authority', () => {
    for (const capability of DELEGATED_AGENT_AUTHORITY.deniedCapabilities) {
      expect(evaluateDelegatedAgentAuthority(base({ restrictedCapabilities: [capability] }), now))
        .toMatchObject({ ok: false, reason: 'restricted_capability_requested' });
    }
    expect(evaluateDelegatedAgentAuthority(base({
      action: 'deploy',
      headSha: shaB,
      currentMainSha: shaB,
      migrationState: 'pending',
    }), now)).toMatchObject({ ok: false, reason: 'migration_authority_not_delegated' });
  });

  it('keeps execution authority separate from outcome truth', () => {
    const accepted = evaluateDelegatedAgentAuthority(base({
      action: 'deploy',
      headSha: shaB,
      currentMainSha: shaB,
      reviewerPrincipalId: 'claude',
      postActionOutcomeVerified: false,
    }), now);
    expect(accepted).toMatchObject({ ok: true, deploy_authority: true, completionClaimAllowed: false });

    const verified = evaluateDelegatedAgentAuthority(base({
      action: 'deploy',
      headSha: shaB,
      currentMainSha: shaB,
      reviewerPrincipalId: 'claude',
      postActionOutcomeVerified: true,
    }), now);
    expect(verified).toMatchObject({ ok: true, completionClaimAllowed: true });
  });
});
