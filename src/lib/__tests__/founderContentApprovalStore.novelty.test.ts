import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import {
  issueFounderContentApproval,
  type FounderContentApprovalRepository,
} from '../founderContentApprovalStore.js';
import type { FounderEditorialHistoryRepository } from '../founderEditorialNovelty.js';

const require = createRequire(import.meta.url);
const {
  canonicalChiefIdentity,
  hashPublicPayload,
} = require('../../../tools/founder-content-contracts/founder-content-authorization-contract.cjs') as {
  canonicalChiefIdentity: (proposal: Record<string, unknown>) => Record<string, unknown>;
  hashPublicPayload: (value: unknown) => string;
};

const SOURCE_SHA = 'd'.repeat(40);
const EVIDENCE_REF = `github:founder-control-room@${SOURCE_SHA}#editorial-convergence`;
const NOW = '2026-08-29T23:40:00.000Z';

function proposal() {
  const value: Record<string, unknown> = {
    version: 1,
    kind: 'chief-ai/founder-content-proposal',
    source: { repo: 'jussray/founder-control-room', commit_sha: SOURCE_SHA },
    freshness: {
      issued_at: '2026-08-29T23:20:00.000Z',
      expires_at: '2026-08-30T00:20:00.000Z',
    },
    public_payload: {
      platform: 'linkedin',
      story_type: 'founder-progress',
      draft_text: 'I stopped building separate AI apps. I am building one founder machine with different jobs.',
      public_claims: [{
        claim_id: 'founder-machine-convergence',
        text: 'PromptOS, Chief, and Founder Control Room are converging into one founder operating system.',
        truth_state: 'verified',
        public_safe: true,
        evidence_ref: EVIDENCE_REF,
        evidence_scope: 'founder-machine-convergence',
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
      proves: ['founder-machine-convergence'],
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
      current_you_intent_id: 'founder-content-current',
      current_you_intent_version: 12,
      current_you_observed_at: '2026-08-29T23:25:00.000Z',
      proposal_evaluated_at: '2026-08-29T23:30:00.000Z',
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

function approvalRepository(): FounderContentApprovalRepository {
  return {
    issue: vi.fn(async () => true),
    readCurrent: vi.fn(),
    claim: vi.fn(),
  };
}

function uniqueApprovalRepository(): FounderContentApprovalRepository {
  const issuedIds = new Set<string>();
  return {
    issue: vi.fn(async (input) => {
      if (issuedIds.has(input.approvalId)) return false;
      issuedIds.add(input.approvalId);
      return true;
    }),
    readCurrent: vi.fn(),
    claim: vi.fn(),
  };
}

function emptyHistoryRepository(): FounderEditorialHistoryRepository {
  return {
    recentLinkedIn: vi.fn(async () => []),
  };
}

function historyRepository(coreThesis: string, primaryHook: string): FounderEditorialHistoryRepository {
  return {
    recentLinkedIn: vi.fn(async () => [{
      id: 'prior-post-1',
      relatedProject: 'fcr',
      coreThesis,
      primaryHook,
      angle: 'founder operating system convergence',
      meaningfulChange: null,
      hookType: 'Build-in-public',
      proofStyle: 'Technical proof',
      publishDate: '2026-08-29',
      status: 'published',
    }]),
  };
}

describe('founder content approval editorial gate', () => {
  it('refuses to persist approval when the LinkedIn thesis/hook is highly repetitive', async () => {
    const approvals = approvalRepository();
    const history = historyRepository(
      'PromptOS Chief and Founder Control Room are converging into one founder operating system.',
      'I stopped building separate AI apps. I am building one founder machine with different jobs.',
    );

    await expect(issueFounderContentApproval({
      proposal: proposal(),
      founderUserId: 'founder-user-1',
      now: NOW,
      repository: approvals,
      historyRepository: history,
    })).rejects.toThrow('FOUNDER_EDITORIAL_REPETITION_BLOCKED');

    expect(approvals.issue).not.toHaveBeenCalled();
  });

  it('persists approval when the closest prior story is materially different', async () => {
    const approvals = approvalRepository();
    const history = historyRepository(
      'AI agents need exact runtime evidence before a completed claim is trusted.',
      'A green checkmark is not proof that an AI agent finished the job.',
    );

    const issued = await issueFounderContentApproval({
      proposal: proposal(),
      founderUserId: 'founder-user-1',
      now: NOW,
      repository: approvals,
      historyRepository: history,
    });

    expect(issued.platform).toBe('linkedin');
    expect(approvals.issue).toHaveBeenCalledTimes(1);
  });

  it('serializes the same public pattern across evidence rotation within one current-you intent', async () => {
    const approvals = uniqueApprovalRepository();
    const history = emptyHistoryRepository();
    const firstProposal = proposal();
    const regeneratedProposal = proposal() as Record<string, any>;
    const rotatedSha = 'f'.repeat(40);
    const rotatedEvidenceRef = `github:founder-control-room@${rotatedSha}#editorial-convergence`;

    regeneratedProposal.source = {
      ...regeneratedProposal.source,
      commit_sha: rotatedSha,
    };
    regeneratedProposal.freshness = {
      issued_at: '2026-08-29T23:21:00.000Z',
      expires_at: '2026-08-30T00:21:00.000Z',
    };
    regeneratedProposal.public_payload = {
      ...regeneratedProposal.public_payload,
      public_claims: regeneratedProposal.public_payload.public_claims.map((claim: Record<string, unknown>) => ({
        ...claim,
        evidence_ref: rotatedEvidenceRef,
        temporal_version: rotatedSha,
      })),
    };
    regeneratedProposal.internal_evidence = {
      ...regeneratedProposal.internal_evidence,
      ref: rotatedEvidenceRef,
      digest: 'a'.repeat(64),
      source_commit_sha: rotatedSha,
    };
    regeneratedProposal.proposal_hash = hashPublicPayload(canonicalChiefIdentity(regeneratedProposal));

    expect(regeneratedProposal.proposal_hash).not.toBe(firstProposal.proposal_hash);
    expect(regeneratedProposal.source.commit_sha).not.toBe((firstProposal.source as Record<string, unknown>).commit_sha);
    expect(regeneratedProposal.internal_evidence.digest).not.toBe((firstProposal.internal_evidence as Record<string, unknown>).digest);

    const results = await Promise.allSettled([
      issueFounderContentApproval({
        proposal: firstProposal,
        founderUserId: 'founder-user-1',
        now: NOW,
        repository: approvals,
        historyRepository: history,
      }),
      issueFounderContentApproval({
        proposal: regeneratedProposal,
        founderUserId: 'founder-user-1',
        now: '2026-08-29T23:40:00.010Z',
        repository: approvals,
        historyRepository: history,
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(approvals.issue).toHaveBeenCalledTimes(2);

    const firstId = vi.mocked(approvals.issue).mock.calls[0]?.[0].approvalId;
    const secondId = vi.mocked(approvals.issue).mock.calls[1]?.[0].approvalId;
    expect(firstId).toMatch(/^fca:[0-9a-f]{64}$/);
    expect(secondId).toBe(firstId);
  });

  it('serializes the same reservation when public_claims text differs but the draft is byte-identical', async () => {
    const approvals = uniqueApprovalRepository();
    const history = emptyHistoryRepository();
    const firstProposal = proposal();
    const relabeledProposal = proposal() as Record<string, any>;

    // draft_text (what the provider actually publishes) is unchanged; only
    // the claim metadata text differs. The reservation must still collide,
    // since two proposals that publish identical copy must not both be
    // approvable — this is the exact gap a claims-derived reservation
    // fingerprint would miss.
    relabeledProposal.public_payload = {
      ...relabeledProposal.public_payload,
      public_claims: relabeledProposal.public_payload.public_claims.map((claim: Record<string, unknown>) => ({
        ...claim,
        text: 'A materially different claim sentence describing the same convergence.',
      })),
    };
    relabeledProposal.proposal_hash = hashPublicPayload(canonicalChiefIdentity(relabeledProposal));

    expect(relabeledProposal.proposal_hash).not.toBe(firstProposal.proposal_hash);
    expect(relabeledProposal.public_payload.draft_text).toBe((firstProposal.public_payload as Record<string, unknown>).draft_text);

    const results = await Promise.allSettled([
      issueFounderContentApproval({
        proposal: firstProposal,
        founderUserId: 'founder-user-1',
        now: NOW,
        repository: approvals,
        historyRepository: history,
      }),
      issueFounderContentApproval({
        proposal: relabeledProposal,
        founderUserId: 'founder-user-1',
        now: '2026-08-29T23:40:00.010Z',
        repository: approvals,
        historyRepository: history,
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(approvals.issue).toHaveBeenCalledTimes(2);

    const firstId = vi.mocked(approvals.issue).mock.calls[0]?.[0].approvalId;
    const secondId = vi.mocked(approvals.issue).mock.calls[1]?.[0].approvalId;
    expect(firstId).toMatch(/^fca:[0-9a-f]{64}$/);
    expect(secondId).toBe(firstId);
  });

  it('serializes the same reservation across Current You intent rotation for byte-identical copy', async () => {
    const approvals = uniqueApprovalRepository();
    const history = emptyHistoryRepository();
    const firstProposal = proposal();
    const rotatedIntentProposal = proposal() as Record<string, any>;

    // draft_text and public_claims are unchanged; only the founder's
    // authenticated intent id/version rotate (e.g. a fresh session or
    // re-issued intent). The reservation must still collide on the same
    // public copy — intent identity is authorization provenance, not part
    // of what makes two proposals "the same publishable content".
    rotatedIntentProposal.authority = {
      ...rotatedIntentProposal.authority,
      current_you_intent_id: 'founder-content-current-rotated',
      current_you_intent_version: 13,
    };
    rotatedIntentProposal.proposal_hash = hashPublicPayload(canonicalChiefIdentity(rotatedIntentProposal));

    expect(rotatedIntentProposal.authority.current_you_intent_version)
      .not.toBe((firstProposal.authority as Record<string, unknown>).current_you_intent_version);
    expect(rotatedIntentProposal.public_payload.draft_text).toBe((firstProposal.public_payload as Record<string, unknown>).draft_text);

    const results = await Promise.allSettled([
      issueFounderContentApproval({
        proposal: firstProposal,
        founderUserId: 'founder-user-1',
        now: NOW,
        repository: approvals,
        historyRepository: history,
      }),
      issueFounderContentApproval({
        proposal: rotatedIntentProposal,
        founderUserId: 'founder-user-1',
        now: '2026-08-29T23:40:00.010Z',
        repository: approvals,
        historyRepository: history,
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(approvals.issue).toHaveBeenCalledTimes(2);

    const firstId = vi.mocked(approvals.issue).mock.calls[0]?.[0].approvalId;
    const secondId = vi.mocked(approvals.issue).mock.calls[1]?.[0].approvalId;
    expect(firstId).toMatch(/^fca:[0-9a-f]{64}$/);
    expect(secondId).toBe(firstId);
  });

  it('serializes the same reservation when drafts diverge only past the canonical 3000-char bound', async () => {
    const approvals = uniqueApprovalRepository();
    const history = emptyHistoryRepository();
    const sharedPrefix = 'A'.repeat(3000);
    const firstProposal = proposal() as Record<string, any>;
    const longerSuffixProposal = proposal() as Record<string, any>;

    // canonicalChiefIdentity() truncates draft_text to 3000 chars before it
    // is authorized/published, so these two proposals authorize and publish
    // byte-identical text even though their raw draft_text values differ.
    // The reservation must still collide.
    firstProposal.public_payload = { ...firstProposal.public_payload, draft_text: `${sharedPrefix} first tail.` };
    longerSuffixProposal.public_payload = { ...longerSuffixProposal.public_payload, draft_text: `${sharedPrefix} a completely different, much longer tail that changes nothing published.` };
    firstProposal.proposal_hash = hashPublicPayload(canonicalChiefIdentity(firstProposal));
    longerSuffixProposal.proposal_hash = hashPublicPayload(canonicalChiefIdentity(longerSuffixProposal));

    expect(firstProposal.public_payload.draft_text).not.toBe(longerSuffixProposal.public_payload.draft_text);
    expect((canonicalChiefIdentity(firstProposal).public_payload as Record<string, unknown>).draft_text)
      .toBe((canonicalChiefIdentity(longerSuffixProposal).public_payload as Record<string, unknown>).draft_text);

    const results = await Promise.allSettled([
      issueFounderContentApproval({
        proposal: firstProposal,
        founderUserId: 'founder-user-1',
        now: NOW,
        repository: approvals,
        historyRepository: history,
      }),
      issueFounderContentApproval({
        proposal: longerSuffixProposal,
        founderUserId: 'founder-user-1',
        now: '2026-08-29T23:40:00.010Z',
        repository: approvals,
        historyRepository: history,
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(approvals.issue).toHaveBeenCalledTimes(2);

    const firstId = vi.mocked(approvals.issue).mock.calls[0]?.[0].approvalId;
    const secondId = vi.mocked(approvals.issue).mock.calls[1]?.[0].approvalId;
    expect(firstId).toMatch(/^fca:[0-9a-f]{64}$/);
    expect(secondId).toBe(firstId);
  });
});
