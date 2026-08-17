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
  public_payload: {
    platform: 'linkedin',
    story_type: 'founder-progress',
    draft_text: 'I found a bug in my AI system that had nothing to do with code. It was a bug in time.',
    public_claims: [
      { text: 'Current You now outranks stale content intent.', truth_state: 'verified', public_safe: true },
    ],
    proof_link: null,
    proof_link_policy: 'editorial_optional',
  },
  internal_evidence: {
    verified: true,
    ref: 'github:chief-ai-machine@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb#quality-gate',
  },
  sauce_guard: {
    private_implementation_removed: true,
    secret_material_removed: true,
    raw_diff_removed: true,
    public_claims_only: true,
  },
  authority: {
    proposal_only: true,
    publish_authorized: false,
    current_you_intent_id: 'content-intent-current',
    future_you_advisory_only: true,
  },
};

const draft = buildCanonicalFirstPartyDraft({
  content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
  campaign_slug: 'founder-progress-first-party',
  chief_proposal: chiefProposal,
});

assert.equal(draft.kind, 'fcr/first-party-founder-content');
assert.equal(draft.canonical_system, 'founder-control-room');
assert.equal(draft.content_brain, 'chief-ai-machine');
assert.equal(draft.public_payload.proof_link, null);
assert.equal(draft.public_payload.proof_link_policy, 'editorial_optional');
assert.equal(draft.private_lineage.internal_evidence_ref, chiefProposal.internal_evidence.ref);
assert.equal(draft.authority.founder_approved, false);
assert.equal(draft.authority.provider_handoff_allowed, false);
assert.equal(draft.analytics.raw_post_text_stored, false);
assert.equal(FIRST_PARTY_CONTENT_KPI_CONTRACT.guardrails.find((item) => item.id === 'sauce_leak_count').target, 0);

const approved = approveFirstPartyDraft(draft, {
  authenticated_current_you: true,
  content_hash: draft.content_hash,
  approval_id: 'approval-current-you-1',
  approved_at: '2026-08-17T07:30:00.000Z',
  expires_at: '2026-08-18T07:29:59.000Z',
});

assert.equal(approved.authority.founder_approved, true);
assert.equal(approved.authority.provider_handoff_allowed, true);
assert.equal(approved.authority.provider_write_authorized, false);
assert.equal(approved.authority.approved_content_hash, draft.content_hash);

const direct = buildProviderHandoff(approved, {
  provider: 'linkedin-direct',
  now: '2026-08-17T08:00:00.000Z',
});
assert.equal(direct.provider, 'linkedin-direct');
assert.equal(direct.public_payload.draft_text, draft.public_payload.draft_text);
assert.equal(direct.public_payload.proof_link, null);
assert.equal(direct.authority.external_write_included, false);
assert.equal(direct.privacy.includes_private_lineage, false);
assert.equal(direct.privacy.includes_internal_evidence_ref, false);
assert.equal(Object.prototype.hasOwnProperty.call(direct, 'private_lineage'), false);

const viaBuffer = buildProviderHandoff(approved, {
  provider: 'buffer',
  now: '2026-08-17T08:00:00.000Z',
});
assert.equal(viaBuffer.content_hash, direct.content_hash);
assert.deepEqual(viaBuffer.public_payload, direct.public_payload);

assert.throws(
  () => approveFirstPartyDraft(draft, {
    authenticated_current_you: true,
    content_hash: 'f'.repeat(64),
    approval_id: 'stale-approval',
    approved_at: '2026-08-17T07:30:00.000Z',
    expires_at: '2026-08-17T08:30:00.000Z',
  }),
  /content_hash must match exact draft/,
);

assert.throws(
  () => approveFirstPartyDraft(draft, {
    authenticated_current_you: false,
    content_hash: draft.content_hash,
    approval_id: 'future-you-approval',
    approved_at: '2026-08-17T07:30:00.000Z',
    expires_at: '2026-08-17T08:30:00.000Z',
  }),
  /authenticated Current You/,
);

assert.throws(
  () => buildProviderHandoff({
    ...approved,
    content_hash: 'e'.repeat(64),
  }, {
    provider: 'linkedin-direct',
    now: '2026-08-17T08:00:00.000Z',
  }),
  /approved content hash no longer matches draft/,
);

assert.throws(
  () => buildCanonicalFirstPartyDraft({
    content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
    campaign_slug: 'bad-chief-authority',
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

console.log('First-party content authority verified: Chief proposes, FCR is canonical, Current You binds exact-content approval, proof links are optional publicly while internal evidence remains required, provider adapters receive public payload only, edits invalidate approval, and analytics remain sanitized.');
