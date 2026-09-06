import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import {
  buildFounderContentIssuedApproval,
  issueFounderContentApproval,
  type FounderContentApprovalRepository,
} from '../founderContentApprovalStore.js';

const require = createRequire(import.meta.url);
const { canonicalChiefIdentity, hashPublicPayload } = require('../../../tools/zapier/founder-content-authorization-contract.cjs') as {
  canonicalChiefIdentity: (proposal: Record<string, unknown>) => Record<string, any>;
  hashPublicPayload: (value: unknown) => string;
};

const SOURCE_SHA = 'a'.repeat(40);
const EVIDENCE_REF = `github:founder-control-room@${SOURCE_SHA}#truth-decay-contract`;

function proposal() {
  const value: Record<string, any> = {
    version: 1,
    kind: 'chief-ai/founder-content-proposal',
    source: { repo: 'jussray/founder-control-room', commit_sha: SOURCE_SHA },
    freshness: {
      issued_at: '2026-08-19T07:00:00.000Z',
      expires_at: '2026-08-19T08:00:00.000Z',
    },
    public_payload: {
      platform: 'linkedin',
      story_type: 'founder-progress',
      draft_text: 'The product can distinguish a historically verified fact from a claim that is still safe to use now.',
      public_claims: [{
        claim_id: 'truth-decay-boundary',
        text: 'The product distinguishes historical verification from current claim authority.',
        truth_state: 'verified',
        public_safe: true,
        evidence_ref: EVIDENCE_REF,
        evidence_scope: 'truth-decay-boundary',
        temporal_class: 'historical_version',
        temporal_version: SOURCE_SHA,
      }],
      proof_link: null,
      proof_link_policy: 'editorial_optional',
    },
    internal_evidence: {
      verified: true,
      ref: EVIDENCE_REF,
      kind: 'github-exact-head-contract',
      digest: 'b'.repeat(64),
      not_for_publication: true,
      source_repo: 'jussray/founder-control-room',
      source_commit_sha: SOURCE_SHA,
      proves: ['truth-decay-boundary'],
      does_not_prove: ['provider-publication', 'engagement-outcomes'],
    },
    sauce_guard: {
      scanner_version: 'sauce-guard-v1',
      private_implementation_removed: true,
      secret_material_removed: true,
      raw_diff_removed: true,
      private_metrics_removed: true,
      unreleased_roadmap_removed: true,
      customer_private_data_removed: true,
      security_sensitive_details_removed: true,
      public_claims_only: true,
      independent_scan_passed: true,
      blocked_categories: [],
      withheld_categories: ['private-implementation'],
    },
    authority: {
      proposal_only: true,
      publish_authorized: false,
      current_you_source: 'current_authenticated_founder',
      current_you_intent_id: 'founder-post-intent-9',
      current_you_intent_version: 9,
      current_you_observed_at: '2026-08-19T07:20:00.000Z',
      proposal_evaluated_at: '2026-08-19T07:21:00.000Z',
      future_you_advisory_only: true,
      historical_content_intent_authoritative: false,
      analytics_can_authorize_publish: false,
      external_feedback_trusted_for_authority: false,
    },
  };
  value.proposal_hash = hashPublicPayload(canonicalChiefIdentity(value));
  return value;
}

function repository(issueResult = true): FounderContentApprovalRepository {
  return {
    issue: vi.fn(async () => issueResult),
    claim: vi.fn(async () => ({
      ok: false as const,
      code: 'APPROVAL_NOT_FOUND' as const,
      reason: 'not used in issuance tests',
    })),
  };
}

function emptyEditorialHistory() {
  return {
    recentLinkedIn: vi.fn(async () => []),
  };
}

describe('authoritative founder-content approval issuance', () => {
  it('server-issues an exact founder/proposal/copy/source-bound approval with a bounded TTL', () => {
    const proposalValue = proposal();
    const issued = buildFounderContentIssuedApproval({
      proposal: proposalValue,
      founderUserId: 'founder-user-1',
      now: '2026-08-19T07:30:00.000Z',
    });
    const identity = canonicalChiefIdentity(proposalValue);

    expect(issued.approvalId).toMatch(/^fca:/);
    expect(issued.proposalHash).toBe(proposalValue.proposal_hash);
    expect(issued.publicPayloadHash).toBe(hashPublicPayload(identity.public_payload));
    expect(issued.authorizationHash).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.platform).toBe('linkedin');
    expect(issued.sourceRepo).toBe('jussray/founder-control-room');
    expect(issued.sourceCommitSha).toBe(SOURCE_SHA);
    expect(issued.approvedAt).toBe('2026-08-19T07:30:00.000Z');
    expect(issued.expiresAt).toBe('2026-08-19T08:00:00.000Z');
    expect(issued.approval).toMatchObject({
      approval_id: issued.approvalId,
      proposal_hash: proposalValue.proposal_hash,
      public_payload_hash: issued.publicPayloadHash,
      current_you: {
        authenticated: true,
        source: 'current_authenticated_founder',
        intent_id: 'founder-post-intent-9',
        intent_version: 9,
        observed_at: '2026-08-19T07:30:00.000Z',
        supersedes_stale_content_intent: true,
      },
      channels: ['linkedin'],
      revoked: false,
      used: false,
      approved_at: '2026-08-19T07:30:00.000Z',
      expires_at: '2026-08-19T08:00:00.000Z',
    });
  });

  it('caps approval lifetime at thirty minutes when the proposal remains valid longer', () => {
    const proposalValue = proposal();
    proposalValue.freshness.expires_at = '2026-08-19T09:00:00.000Z';
    proposalValue.proposal_hash = hashPublicPayload(canonicalChiefIdentity(proposalValue));

    const issued = buildFounderContentIssuedApproval({
      proposal: proposalValue,
      founderUserId: 'founder-user-1',
      now: '2026-08-19T07:30:00.000Z',
    });

    expect(issued.expiresAt).toBe('2026-08-19T08:00:00.000Z');
  });

  it('rejects an already expired proposal instead of minting fresh authority from stale truth', () => {
    const proposalValue = proposal();

    expect(() => buildFounderContentIssuedApproval({
      proposal: proposalValue,
      founderUserId: 'founder-user-1',
      now: '2026-08-19T08:01:00.000Z',
    })).toThrow(/proposal is already expired/);
  });

  it('rejects a proposal changed after its canonical hash was issued', () => {
    const proposalValue = proposal();
    proposalValue.public_payload.draft_text = 'Changed after the proposal hash was issued.';

    expect(() => buildFounderContentIssuedApproval({
      proposal: proposalValue,
      founderUserId: 'founder-user-1',
      now: '2026-08-19T07:30:00.000Z',
    })).toThrow(/proposal_hash does not match canonical Chief v1 proposal identity/);
  });

  it('does not return authority when the authoritative repository cannot persist it', async () => {
    const store = repository(false);

    await expect(issueFounderContentApproval({
      proposal: proposal(),
      founderUserId: 'founder-user-1',
      now: '2026-08-19T07:30:00.000Z',
      repository: store,
      historyRepository: emptyEditorialHistory(),
    })).rejects.toThrow(/could not be persisted/);
    expect(store.issue).toHaveBeenCalledTimes(1);
  });
});
