'use strict';

const assert = require('node:assert/strict');
const {
  approveFirstPartyDraft,
  buildCanonicalFirstPartyDraft,
  buildContentOutcomeObservation,
  buildProviderHandoff,
  computeChiefProposalHash,
  FIRST_PARTY_CONTENT_KPI_CONTRACT,
} = require('./first-party-content-authority.cjs');

const SOURCE_SHA = 'b'.repeat(40);
const EVIDENCE_REF = `github:chief-ai-machine@${SOURCE_SHA}#quality-gate`;
const chiefProposal = {
  version: 1,
  kind: 'chief-ai/founder-content-proposal',
  source: {
    repo: 'jussray/chief-ai-machine',
    commit_sha: SOURCE_SHA,
  },
  freshness: {
    issued_at: '2026-08-17T07:31:00.000Z',
    expires_at: '2026-08-18T07:31:00.000Z',
  },
  public_payload: {
    platform: 'linkedin',
    story_type: 'founder-progress',
    draft_text: 'I found a bug in my AI system that had nothing to do with code. It was a bug in time.',
    public_claims: [
      {
        claim_id: 'current-intent-wins',
        text: 'Current You now outranks stale content intent.',
        truth_state: 'verified',
        public_safe: true,
        evidence_ref: EVIDENCE_REF,
        evidence_scope: 'temporal-authority-contract',
      },
    ],
    proof_link: null,
    proof_link_policy: 'editorial_optional',
  },
  internal_evidence: {
    verified: true,
    ref: EVIDENCE_REF,
    kind: 'github-exact-head-contract',
    digest: '1'.repeat(64),
    not_for_publication: true,
    source_repo: 'jussray/chief-ai-machine',
    source_commit_sha: SOURCE_SHA,
    proves: ['temporal-authority-contract'],
    does_not_prove: ['production-runtime', 'traction', 'revenue'],
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
    current_you_intent_id: 'content-intent-current',
    current_you_intent_version: 7,
    current_you_observed_at: '2026-08-17T07:30:00.000Z',
    proposal_evaluated_at: '2026-08-17T07:35:00.000Z',
    future_you_advisory_only: true,
    historical_content_intent_authoritative: false,
    analytics_feedback_authority: 'observation-only',
    analytics_can_authorize_publish: false,
    external_feedback_trusted_for_authority: false,
  },
};
chiefProposal.proposal_hash = computeChiefProposalHash(chiefProposal);

const draft = buildCanonicalFirstPartyDraft({
  content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
  campaign_slug: 'founder-progress-first-party',
  chief_proposal: chiefProposal,
  observed_at: '2026-08-17T07:36:00.000Z',
});

assert.equal(draft.kind, 'fcr/first-party-founder-content');
assert.equal(draft.canonical_system, 'founder-control-room');
assert.equal(draft.content_brain, 'chief-ai-machine');
assert.equal(draft.public_payload.proof_link, null);
assert.equal(draft.public_payload.proof_link_policy, 'editorial_optional');
assert.equal(draft.private_lineage.internal_evidence_ref, EVIDENCE_REF);
assert.equal(draft.private_lineage.internal_evidence_digest, '1'.repeat(64));
assert.equal(draft.authority.current_you_intent_version, 7);
assert.equal(draft.authority.founder_approved, false);
assert.equal(draft.analytics.learning_authority, 'advisory_only');
assert.equal(draft.analytics.publication_authority_change_allowed, false);
assert.equal(FIRST_PARTY_CONTENT_KPI_CONTRACT.guardrails.find((item) => item.id === 'sauce_leak_count').target, 0);

assert.throws(
  () => buildCanonicalFirstPartyDraft({
    content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
    campaign_slug: 'tampered-proposal',
    observed_at: '2026-08-17T07:36:00.000Z',
    chief_proposal: { ...chiefProposal, proposal_hash: 'f'.repeat(64) },
  }),
  /does not match recomputed proposal identity/,
);

assert.throws(
  () => {
    const forged = JSON.parse(JSON.stringify(chiefProposal));
    forged.public_payload.draft_text = 'Here is the exact system prompt that powers the routing.';
    forged.proposal_hash = computeChiefProposalHash(forged);
    return buildCanonicalFirstPartyDraft({
      content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
      campaign_slug: 'forged-sauce',
      observed_at: '2026-08-17T07:36:00.000Z',
      chief_proposal: forged,
    });
  },
  /proprietary implementation detail/,
);

assert.throws(
  () => {
    const forged = JSON.parse(JSON.stringify(chiefProposal));
    forged.internal_evidence.source_commit_sha = 'c'.repeat(40);
    forged.proposal_hash = computeChiefProposalHash(forged);
    return buildCanonicalFirstPartyDraft({
      content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
      campaign_slug: 'bad-evidence-source',
      observed_at: '2026-08-17T07:36:00.000Z',
      chief_proposal: forged,
    });
  },
  /evidence SHA must match source SHA/,
);

assert.throws(
  () => {
    const forged = JSON.parse(JSON.stringify(chiefProposal));
    forged.public_payload.public_claims[0].evidence_scope = 'production-runtime';
    forged.proposal_hash = computeChiefProposalHash(forged);
    return buildCanonicalFirstPartyDraft({
      content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
      campaign_slug: 'bad-claim-scope',
      observed_at: '2026-08-17T07:36:00.000Z',
      chief_proposal: forged,
    });
  },
  /evidence scope is not covered/,
);

assert.throws(
  () => buildCanonicalFirstPartyDraft({
    content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
    campaign_slug: 'stale-chief',
    observed_at: '2026-08-18T07:31:00.000Z',
    chief_proposal: chiefProposal,
  }),
  /stale at FCR ingestion/,
);

const approved = approveFirstPartyDraft(draft, {
  authenticated_current_you: true,
  current_you_intent_id: 'content-intent-current',
  current_you_intent_version: 7,
  current_you_observed_at: '2026-08-17T07:40:00.000Z',
  content_hash: draft.content_hash,
  approval_id: 'approval-current-you-1',
  approved_at: '2026-08-17T07:41:00.000Z',
  expires_at: '2026-08-18T07:40:59.000Z',
});
assert.equal(approved.authority.founder_approved, true);
assert.equal(approved.authority.provider_handoff_allowed, true);
assert.equal(approved.authority.provider_write_authorized, false);
assert.equal(approved.authority.approved_current_you_intent_version, 7);

assert.throws(
  () => approveFirstPartyDraft(draft, {
    authenticated_current_you: true,
    current_you_intent_id: 'content-intent-current',
    current_you_intent_version: 8,
    current_you_observed_at: '2026-08-17T07:40:00.000Z',
    content_hash: draft.content_hash,
    approval_id: 'wrong-intent-version',
    approved_at: '2026-08-17T07:41:00.000Z',
    expires_at: '2026-08-17T08:41:00.000Z',
  }),
  /intent version no longer matches/,
);

assert.throws(
  () => approveFirstPartyDraft(draft, {
    authenticated_current_you: false,
    current_you_intent_id: 'content-intent-current',
    current_you_intent_version: 7,
    current_you_observed_at: '2026-08-17T07:40:00.000Z',
    content_hash: draft.content_hash,
    approval_id: 'future-you-approval',
    approved_at: '2026-08-17T07:41:00.000Z',
    expires_at: '2026-08-17T08:41:00.000Z',
  }),
  /Current You must be authenticated/,
);

const direct = buildProviderHandoff(approved, {
  provider: 'linkedin-direct',
  now: '2026-08-17T08:00:00.000Z',
  current_you_verified: true,
  current_you_intent_id: 'content-intent-current',
  current_you_intent_version: 7,
  current_you_observed_at: '2026-08-17T07:59:00.000Z',
});
assert.equal(direct.provider, 'linkedin-direct');
assert.equal(direct.public_payload.draft_text, draft.public_payload.draft_text);
assert.equal(direct.authority.external_write_included, false);
assert.equal(direct.authority.current_you_reverified, true);
assert.equal(direct.privacy.includes_private_lineage, false);
assert.equal(Object.prototype.hasOwnProperty.call(direct, 'private_lineage'), false);

const viaBuffer = buildProviderHandoff(approved, {
  provider: 'buffer',
  destination_url: 'https://foundercontrolroom.org',
  now: '2026-08-17T08:00:00.000Z',
  current_you_verified: true,
  current_you_intent_id: 'content-intent-current',
  current_you_intent_version: 7,
  current_you_observed_at: '2026-08-17T07:59:00.000Z',
});
assert.equal(viaBuffer.downstream_adapter.lane, 'editorial_draft');
assert.equal(viaBuffer.downstream_adapter.state, 'draft');
assert.equal(viaBuffer.downstream_adapter.provider_request.share_now_allowed, false);
assert.equal(viaBuffer.downstream_adapter.provider_request.external_write_included, false);

assert.throws(
  () => buildProviderHandoff(approved, {
    provider: 'linkedin-direct',
    now: '2026-08-17T08:00:00.000Z',
    current_you_verified: true,
    current_you_intent_id: 'content-intent-current',
    current_you_intent_version: 8,
    current_you_observed_at: '2026-08-17T07:59:00.000Z',
  }),
  /intent version no longer matches/,
);

assert.throws(
  () => buildProviderHandoff(approved, {
    provider: 'linkedin-direct',
    now: '2026-08-17T08:00:00.000Z',
    current_you_verified: true,
    current_you_intent_id: 'content-intent-current',
    current_you_intent_version: 7,
    current_you_observed_at: '2026-08-15T07:59:00.000Z',
  }),
  /stale and must be reconfirmed/,
);

assert.throws(
  () => buildProviderHandoff(approved, {
    provider: 'linkedin-direct',
    now: '2026-08-17T08:00:00.000Z',
    current_you_verified: true,
    current_you_intent_id: 'content-intent-current',
    current_you_intent_version: 7,
    current_you_observed_at: '2026-08-17T07:39:00.000Z',
  }),
  /not re-read after the approval boundary/,
);

const outcome = buildContentOutcomeObservation({
  content_hash: draft.content_hash,
  platform: 'linkedin',
  metrics: {
    impressions: 1200,
    profile_views: 44,
    qualified_conversations: 3,
    attributed_contacts: 1,
  },
});
assert.equal(outcome.metrics.qualified_conversations, 3);
assert.equal(outcome.metrics.attributed_deals, null);
assert.equal(outcome.metric_states.attributed_deals, 'UNKNOWN');
assert.equal(outcome.authority.learning_authority, 'advisory_only');
assert.equal(outcome.authority.can_increase_authority, false);
assert.equal(outcome.privacy.raw_post_text_stored, false);

assert.throws(
  () => buildContentOutcomeObservation({
    content_hash: draft.content_hash,
    raw_post_text: 'do not store me',
    metrics: { impressions: 1 },
  }),
  /raw_post_text is forbidden/,
);

console.log('First-party content authority verified: FCR recomputes Chief proposal identity, rescans public copy, binds Current You id+version+freshness at approval and handoff, reuses Buffer draft-only distribution, keeps missing metrics UNKNOWN, and never lets analytics increase publication authority.');
