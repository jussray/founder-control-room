'use strict';

const assert = require('node:assert/strict');
const { canonicalChiefIdentity, hashPublicPayload } = require('./founder-content-authorization-contract.cjs');
const {
  authorizeFounderContentPublishNow,
  buildFounderContentProviderWriteEnvelope,
  recordFounderContentProviderReceipt,
} = require('./founder-content-publish-now-contract.cjs');

const SHA = 'a'.repeat(40);
const evidenceRef = `github:founder-control-room@${SHA}#quality-gate`;
const proposal = {
  version: 1,
  kind: 'chief-ai/founder-content-proposal',
  source: { repo: 'jussray/founder-control-room', commit_sha: SHA },
  freshness: { issued_at: '2026-08-17T14:00:00.000Z', expires_at: '2026-08-17T16:00:00.000Z' },
  public_payload: {
    platform: 'linkedin',
    story_type: 'founder-progress',
    draft_text: 'Share the progress, not the recipe.',
    public_claims: [{
      claim_id: 'receipt-boundary',
      text: 'Published becomes true only after provider readback.',
      truth_state: 'verified',
      public_safe: true,
      evidence_ref: evidenceRef,
      evidence_scope: 'provider-receipt-boundary',
    }],
    proof_link: null,
    proof_link_policy: 'editorial_optional',
  },
  internal_evidence: {
    verified: true,
    ref: evidenceRef,
    kind: 'github-exact-head-contract',
    digest: 'b'.repeat(64),
    not_for_publication: true,
    source_repo: 'jussray/founder-control-room',
    source_commit_sha: SHA,
    proves: ['provider-receipt-boundary'],
    does_not_prove: ['provider-publication'],
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
    current_you_intent_id: 'founder-post-intent-1',
    current_you_intent_version: 7,
    current_you_observed_at: '2026-08-17T13:59:00.000Z',
    proposal_evaluated_at: '2026-08-17T14:00:00.000Z',
    future_you_advisory_only: true,
    historical_content_intent_authoritative: false,
    analytics_can_authorize_publish: false,
    external_feedback_trusted_for_authority: false,
  },
};
proposal.proposal_hash = hashPublicPayload(canonicalChiefIdentity(proposal));
const approval = {
  approval_id: 'founder-post-approval-1',
  proposal_hash: proposal.proposal_hash,
  public_payload_hash: hashPublicPayload(canonicalChiefIdentity(proposal).public_payload),
  current_you: {
    authenticated: true,
    source: 'current_authenticated_founder',
    intent_id: 'founder-post-intent-1',
    intent_version: 7,
    observed_at: '2026-08-17T15:00:00.000Z',
    supersedes_stale_content_intent: true,
  },
  channels: ['linkedin'],
  revoked: false,
  used: false,
  approved_at: '2026-08-17T15:00:00.000Z',
  expires_at: '2026-08-17T15:30:00.000Z',
};
const currentYou = {
  authenticated: true,
  source: 'current_authenticated_founder',
  intent_id: 'founder-post-intent-1',
  intent_version: 7,
  observed_at: '2026-08-17T15:04:00.000Z',
};

const { authorizeFounderContentPublication } = require('./founder-content-authorization-contract.cjs');
const canonical = authorizeFounderContentPublication({ proposal, approval, now: '2026-08-17T15:05:00.000Z' });
const publishNow = authorizeFounderContentPublishNow({
  proposal,
  approval,
  confirmation: {
    confirm_publication: true,
    authorization_hash: canonical.authorization_hash,
    public_payload_hash: canonical.public_payload_hash,
  },
  provider: 'cambiante',
  provider_account_id: 'linkedin-person-account',
  channel: 'linkedin',
  current_you: currentYou,
  now: '2026-08-17T15:05:00.000Z',
});
assert.equal(publishNow.state, 'authorized-for-publish');
assert.equal(publishNow.authority.external_write_authorized, true);

const envelope = buildFounderContentProviderWriteEnvelope({
  publish_authorization: publishNow,
  now: '2026-08-17T15:06:00.000Z',
});
assert.equal(envelope.operation, 'publish_now');
assert.equal(envelope.privacy.includes_private_lineage, false);

const blocked = recordFounderContentProviderReceipt({
  write_envelope: envelope,
  provider_result: {
    provider: 'cambiante',
    provider_account_id: 'linkedin-person-account',
    write_succeeded: false,
    readback_verified: false,
    status: 'failed',
    http_status: 402,
  },
  observed_at: '2026-08-17T15:07:00.000Z',
});
assert.equal(blocked.truth.published, false);
assert.equal(blocked.truth.state, 'failed');

const published = recordFounderContentProviderReceipt({
  write_envelope: envelope,
  provider_result: {
    provider: 'cambiante',
    provider_account_id: 'linkedin-person-account',
    write_succeeded: true,
    readback_verified: true,
    status: 'published',
    http_status: 200,
    provider_post_id: 'post-123',
    public_url: 'https://www.linkedin.com/feed/update/urn:li:activity:123/',
  },
  observed_at: '2026-08-17T15:07:00.000Z',
});
assert.equal(published.truth.published, true);
assert.equal(published.truth.state, 'published');

console.log('Founder publish-now smoke contract verified: exact Current You authorization -> one-shot provider write -> receipt-required published truth.');
