'use strict';

const assert = require('node:assert/strict');
const {
  approveFirstPartyDraft,
  buildCanonicalFirstPartyDraft,
  buildContentOutcomeObservation,
  buildProviderHandoff,
  FIRST_PARTY_CONTENT_KPI_CONTRACT,
} = require('./first-party-content-authority.cjs');

const chiefProposal = {
  kind: 'chief-ai/founder-content-proposal',
  proposal_hash: 'a'.repeat(64),
  source: {
    repo: 'jussray/chief-ai-machine',
    commit_sha: 'b'.repeat(40),
  },
  freshness: {
    issued_at: '2026-08-17T07:45:00.000Z',
    expires_at: '2026-08-18T07:45:00.000Z',
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
      },
    ],
    proof_link: null,
    proof_link_policy: 'editorial_optional',
  },
  internal_evidence: {
    verified: true,
    ref: 'github:chief-ai-machine@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb#quality-gate',
    digest: '1'.repeat(64),
    not_for_publication: true,
  },
  claim_evidence: [
    { claim_id: 'current-intent-wins', evidence_refs: ['proof:current-intent-contract'] },
  ],
  sauce_guard: {
    private_implementation_removed: true,
    secret_material_removed: true,
    raw_diff_removed: true,
    private_metrics_removed: true,
    unreleased_roadmap_removed: true,
    customer_private_data_removed: true,
    security_sensitive_details_removed: true,
    public_claims_only: true,
  },
  authority: {
    proposal_only: true,
    publish_authorized: false,
    current_you_intent_id: 'content-intent-current',
    future_you_advisory_only: true,
    historical_content_intent_authoritative: false,
    analytics_feedback_authority: 'observation-only',
    analytics_can_authorize_publish: false,
  },
};

const draft = buildCanonicalFirstPartyDraft({
  content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
  campaign_slug: 'founder-progress-first-party',
  observed_at: '2026-08-17T07:50:00.000Z',
  chief_proposal: chiefProposal,
});

assert.equal(draft.kind, 'fcr/first-party-founder-content');
assert.equal(draft.canonical_system, 'founder-control-room');
assert.equal(draft.content_brain, 'chief-ai-machine');
assert.equal(draft.public_payload.proof_link, null);
assert.equal(draft.public_payload.proof_link_policy, 'editorial_optional');
assert.equal(draft.public_payload.public_claims[0].claim_id, 'current-intent-wins');
assert.equal(draft.private_lineage.internal_evidence_ref, chiefProposal.internal_evidence.ref);
assert.equal(draft.private_lineage.internal_evidence_digest, '1'.repeat(64));
assert.deepEqual(draft.private_lineage.claim_evidence, chiefProposal.claim_evidence);
assert.equal(draft.private_lineage.evidence_expires_at, chiefProposal.freshness.expires_at);
assert.equal(draft.authority.founder_approved, false);
assert.equal(draft.authority.provider_handoff_allowed, false);
assert.equal(draft.analytics.raw_post_text_stored, false);
assert.equal(FIRST_PARTY_CONTENT_KPI_CONTRACT.guardrails.find((item) => item.id === 'sauce_leak_count').target, 0);
assert.equal(FIRST_PARTY_CONTENT_KPI_CONTRACT.guardrails.find((item) => item.id === 'stale_content_handoff_count').target, 0);

const approved = approveFirstPartyDraft(draft, {
  authenticated_current_you: true,
  current_you_intent_id: 'content-intent-current',
  content_hash: draft.content_hash,
  approval_id: 'approval-current-you-1',
  approved_at: '2026-08-17T08:00:00.000Z',
  expires_at: '2026-08-18T07:00:00.000Z',
});

assert.equal(approved.authority.founder_approved, true);
assert.equal(approved.authority.provider_handoff_allowed, true);
assert.equal(approved.authority.provider_write_authorized, false);
assert.equal(approved.authority.approved_content_hash, draft.content_hash);
assert.equal(approved.authority.approved_current_you_intent_id, 'content-intent-current');

const direct = buildProviderHandoff(approved, {
  provider: 'linkedin-direct',
  now: '2026-08-17T08:10:00.000Z',
  current_you_verified: true,
  current_you_intent_id: 'content-intent-current',
});
assert.equal(direct.provider, 'linkedin-direct');
assert.equal(direct.public_payload.draft_text, draft.public_payload.draft_text);
assert.equal(direct.public_payload.proof_link, null);
assert.equal(direct.authority.external_write_included, false);
assert.equal(direct.authority.current_you_reverified, true);
assert.equal(direct.authority.source_evidence_reverified_fresh, true);
assert.equal(direct.privacy.includes_private_lineage, false);
assert.equal(direct.privacy.includes_internal_evidence_ref, false);
assert.equal(direct.privacy.includes_claim_evidence, false);
assert.equal(Object.prototype.hasOwnProperty.call(direct, 'private_lineage'), false);

const viaBuffer = buildProviderHandoff(approved, {
  provider: 'buffer',
  now: '2026-08-17T08:10:00.000Z',
  current_you_verified: true,
  current_you_intent_id: 'content-intent-current',
});
assert.equal(viaBuffer.content_hash, direct.content_hash);
assert.deepEqual(viaBuffer.public_payload, direct.public_payload);

assert.throws(
  () => buildCanonicalFirstPartyDraft({
    content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
    campaign_slug: 'stale-chief-proposal',
    observed_at: '2026-08-18T07:45:00.000Z',
    chief_proposal: chiefProposal,
  }),
  /stale at FCR ingestion/,
);

assert.throws(
  () => buildCanonicalFirstPartyDraft({
    content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
    campaign_slug: 'unverified-claim',
    observed_at: '2026-08-17T07:50:00.000Z',
    chief_proposal: {
      ...chiefProposal,
      public_payload: {
        ...chiefProposal.public_payload,
        public_claims: [{ ...chiefProposal.public_payload.public_claims[0], truth_state: 'inferred' }],
      },
    },
  }),
  /must be verified/,
);

assert.throws(
  () => buildCanonicalFirstPartyDraft({
    content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
    campaign_slug: 'missing-claim-evidence',
    observed_at: '2026-08-17T07:50:00.000Z',
    chief_proposal: { ...chiefProposal, claim_evidence: [] },
  }),
  /private claim evidence/,
);

assert.throws(
  () => buildCanonicalFirstPartyDraft({
    content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
    campaign_slug: 'publishable-evidence',
    observed_at: '2026-08-17T07:50:00.000Z',
    chief_proposal: {
      ...chiefProposal,
      internal_evidence: { ...chiefProposal.internal_evidence, not_for_publication: false },
    },
  }),
  /not_for_publication/,
);

assert.throws(
  () => approveFirstPartyDraft(draft, {
    authenticated_current_you: true,
    current_you_intent_id: 'content-intent-current',
    content_hash: 'f'.repeat(64),
    approval_id: 'stale-approval',
    approved_at: '2026-08-17T08:00:00.000Z',
    expires_at: '2026-08-17T08:30:00.000Z',
  }),
  /content_hash must match exact draft/,
);

assert.throws(
  () => approveFirstPartyDraft(draft, {
    authenticated_current_you: false,
    current_you_intent_id: 'content-intent-current',
    content_hash: draft.content_hash,
    approval_id: 'future-you-approval',
    approved_at: '2026-08-17T08:00:00.000Z',
    expires_at: '2026-08-17T08:30:00.000Z',
  }),
  /authenticated Current You/,
);

assert.throws(
  () => approveFirstPartyDraft(draft, {
    authenticated_current_you: true,
    current_you_intent_id: 'older-content-intent',
    content_hash: draft.content_hash,
    approval_id: 'stale-intent-approval',
    approved_at: '2026-08-17T08:00:00.000Z',
    expires_at: '2026-08-17T08:30:00.000Z',
  }),
  /must match the draft intent/,
);

assert.throws(
  () => buildProviderHandoff({ ...approved, content_hash: 'e'.repeat(64) }, {
    provider: 'linkedin-direct',
    now: '2026-08-17T08:10:00.000Z',
    current_you_verified: true,
    current_you_intent_id: 'content-intent-current',
  }),
  /approved content hash no longer matches draft/,
);

assert.throws(
  () => buildProviderHandoff(approved, {
    provider: 'linkedin-direct',
    now: '2026-08-17T08:10:00.000Z',
    current_you_verified: true,
    current_you_intent_id: 'new-current-intent',
  }),
  /stale relative to Current You/,
);

assert.throws(
  () => buildProviderHandoff(approved, {
    provider: 'linkedin-direct',
    now: '2026-08-17T08:10:00.000Z',
    current_you_verified: true,
    current_you_intent_id: 'content-intent-current',
    approval_revoked: true,
  }),
  /approval has been revoked/,
);

assert.throws(
  () => buildProviderHandoff(approved, {
    provider: 'linkedin-direct',
    now: '2026-08-18T07:45:00.000Z',
    current_you_verified: true,
    current_you_intent_id: 'content-intent-current',
  }),
  /source evidence is stale at provider handoff/,
);

assert.throws(
  () => buildCanonicalFirstPartyDraft({
    content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
    campaign_slug: 'bad-chief-authority',
    observed_at: '2026-08-17T07:50:00.000Z',
    chief_proposal: {
      ...chiefProposal,
      authority: { ...chiefProposal.authority, publish_authorized: true },
    },
  }),
  /Chief cannot self-authorize publication/,
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
assert.equal(outcome.authority.observation_only, true);
assert.equal(outcome.authority.can_authorize_publish, false);
assert.equal(outcome.privacy.raw_post_text_stored, false);
assert.equal(outcome.privacy.private_messages_stored, false);

assert.throws(
  () => buildContentOutcomeObservation({
    content_hash: draft.content_hash,
    raw_post_text: 'do not store me',
    metrics: { impressions: 1 },
  }),
  /raw_post_text is forbidden/,
);

console.log('First-party content authority verified: Chief proposes verified-only public claims with private evidence, FCR independently verifies source/evidence/freshness, Current You binds exact-content approval and is re-read at handoff, public proof links stay optional, provider adapters receive public payload only, stale evidence fails closed, and analytics remain observation-only.');
