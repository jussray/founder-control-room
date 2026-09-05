import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import {
  issueFounderContentApproval,
  type FounderContentApprovalRepository,
} from '../founderContentApprovalStore.js';
import {
  buildFounderEditorialIdentity,
  type FounderEditorialHistoryRepository,
} from '../founderEditorialNovelty.js';

const require = createRequire(import.meta.url);
const {
  canonicalChiefIdentity,
  hashPublicPayload,
} = require('../../../tools/founder-content-contracts/founder-content-authorization-contract.cjs') as {
  canonicalChiefIdentity: (proposal: Record<string, unknown>) => Record<string, unknown>;
  hashPublicPayload: (value: unknown) => string;
};

const SOURCE_SHA = 'd'.repeat(40);
const EVIDENCE_REF = `github:founder-control-room@${SOURCE_SHA}#editorial-pattern-reservation`;
const NOW = '2026-09-04T22:15:00.000Z';

function proposal(draftText: string) {
  const value: Record<string, any> = {
    version: 1,
    kind: 'chief-ai/founder-content-proposal',
    source: { repo: 'jussray/founder-control-room', commit_sha: SOURCE_SHA },
    freshness: {
      issued_at: '2026-09-04T22:00:00.000Z',
      expires_at: '2026-09-04T22:45:00.000Z',
    },
    public_payload: {
      platform: 'linkedin',
      story_type: 'founder-progress',
      draft_text: draftText,
      public_claims: [{
        claim_id: 'founder-pattern-concurrency',
        text: 'Founder Control Room keeps one active editorial pattern from minting duplicate publication authority.',
        truth_state: 'verified',
        public_safe: true,
        evidence_ref: EVIDENCE_REF,
        evidence_scope: 'founder-pattern-concurrency',
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
      digest: 'e'.repeat(64),
      not_for_publication: true,
      source_repo: 'jussray/founder-control-room',
      source_commit_sha: SOURCE_SHA,
      proves: ['founder-pattern-concurrency'],
      does_not_prove: ['publication', 'traction'],
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
      current_you_intent_id: 'founder-content-pattern-reservation',
      current_you_intent_version: 1,
      current_you_observed_at: '2026-09-04T22:05:00.000Z',
      proposal_evaluated_at: '2026-09-04T22:10:00.000Z',
      future_you_advisory_only: true,
      historical_content_intent_authoritative: false,
      analytics_feedback_authority: 'observation-only',
      analytics_can_authorize_publish: false,
      external_feedback_trusted_for_authority: false,
    },
  };
  value.proposal_hash = hashPublicPayload(canonicalChiefIdentity(value));
  return value;
}

function emptyHistoryRepository(): FounderEditorialHistoryRepository {
  return {
    recentLinkedIn: vi.fn(async () => []),
  };
}

function activeEditorialPatternRepository(): FounderContentApprovalRepository {
  const activePatterns = new Set<string>();
  return {
    issue: vi.fn(async (input) => {
      if (activePatterns.has(input.editorialPatternFingerprint)) return false;
      activePatterns.add(input.editorialPatternFingerprint);
      return true;
    }),
    readCurrent: vi.fn(),
    claim: vi.fn(),
  };
}

describe('founder-content active editorial-pattern reservation', () => {
  it('allows only one active approval for the same thesis/hook when publishable copy differs', async () => {
    const firstProposal = proposal(
      'I stopped treating editorial repetition as a writing problem. The first draft explains the database authority boundary.',
    );
    const secondProposal = proposal(
      'I stopped treating editorial repetition as a writing problem. The second draft uses different public wording for the same thesis.',
    );
    const firstIdentity = buildFounderEditorialIdentity(firstProposal);
    const secondIdentity = buildFounderEditorialIdentity(secondProposal);

    expect(firstIdentity.publicCopyFingerprint).not.toBe(secondIdentity.publicCopyFingerprint);
    expect(firstIdentity.promptOsPatternFingerprint).toBe(secondIdentity.promptOsPatternFingerprint);

    const approvals = activeEditorialPatternRepository();
    const history = emptyHistoryRepository();
    const results = await Promise.allSettled([
      issueFounderContentApproval({
        proposal: firstProposal,
        founderUserId: 'founder-user-1',
        now: NOW,
        repository: approvals,
        historyRepository: history,
      }),
      issueFounderContentApproval({
        proposal: secondProposal,
        founderUserId: 'founder-user-1',
        now: '2026-09-04T22:15:00.010Z',
        repository: approvals,
        historyRepository: history,
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(approvals.issue).toHaveBeenCalledTimes(2);

    const firstIssue = vi.mocked(approvals.issue).mock.calls[0]?.[0];
    const secondIssue = vi.mocked(approvals.issue).mock.calls[1]?.[0];
    expect(firstIssue?.approvalId).toMatch(/^fca:[0-9a-f]{64}$/);
    expect(secondIssue?.approvalId).toMatch(/^fca:[0-9a-f]{64}$/);
    expect(firstIssue?.approvalId).not.toBe(secondIssue?.approvalId);
    expect(firstIssue?.editorialPatternFingerprint).toBe(firstIdentity.promptOsPatternFingerprint);
    expect(secondIssue?.editorialPatternFingerprint).toBe(firstIdentity.promptOsPatternFingerprint);
  });
});
