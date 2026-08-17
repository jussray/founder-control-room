'use strict';

require('./test-founder-content-authorization-contract.cjs');

const assert = require('node:assert/strict');
const { hashPublicPayload } = require('./founder-content-authorization-contract.cjs');
const {
  buildEditorialDraftEnvelope,
  buildFirstPartyFounderScheduleEnvelope,
  buildGovernedScheduleEnvelope,
  FIRST_PARTY_AUTHORIZATION_MODE,
  HUBSPOT_CONTACT_ATTRIBUTION_FIELDS,
  SOCIAL_KPI_CONTRACT,
} = require('./social-distribution-contract.cjs');

const contentId = '82a030bd-cd2c-4d72-96c9-b38746bc1380';
const sourceCommitSha = 'a'.repeat(40);
const commonInput = {
  content_id: contentId,
  source_repo: 'jussray/founder-control-room',
  source_commit_sha: sourceCommitSha,
  proof_url: 'https://github.com/jussray/founder-control-room/pull/999',
  campaign_slug: 'fcr-build-in-public',
  platform: 'linkedin',
  destination_url: 'https://foundercontrolroom.org/?from=proof',
};

const editorial = buildEditorialDraftEnvelope({
  ...commonInput,
  text: 'A proof-first founder update that remains a draft until explicit approval.',
  publish_allowed: true,
  schedule_at: '2026-08-17T13:00:00.000Z',
});

assert.equal(editorial.lane, 'editorial_draft');
assert.equal(editorial.state, 'draft');
assert.equal(editorial.provider, 'buffer');
assert.equal(editorial.authority.publish_allowed, false);
assert.equal(editorial.authority.schedule_allowed, false);
assert.equal(editorial.authority.explicit_founder_approval_required, true);
assert.equal(editorial.provider_request.method, 'draft');
assert.equal(editorial.provider_request.save_to_draft, true);
assert.equal(editorial.provider_request.schedule_at, null);
assert.equal(editorial.provider_request.share_now_allowed, false);
assert.equal(editorial.provider_request.external_write_included, false);

const editorialUrl = new URL(editorial.attribution.tracked_url);
assert.equal(editorialUrl.searchParams.get('from'), 'proof');
assert.equal(editorialUrl.searchParams.get('utm_source'), 'linkedin');
assert.equal(editorialUrl.searchParams.get('utm_medium'), 'social');
assert.equal(editorialUrl.searchParams.get('utm_campaign'), 'fcr-build-in-public');
assert.equal(editorialUrl.searchParams.get('utm_content'), contentId);
assert.equal(editorial.attribution.hubspot.mode, 'automatic_tracking_only');
assert.equal(editorial.attribution.hubspot.campaign_object_required, false);
assert.deepEqual(
  editorial.attribution.hubspot.contact_source_fields,
  HUBSPOT_CONTACT_ATTRIBUTION_FIELDS,
);
assert.ok(HUBSPOT_CONTACT_ATTRIBUTION_FIELDS.includes('hs_analytics_source'));
assert.ok(HUBSPOT_CONTACT_ATTRIBUTION_FIELDS.includes('hs_latest_source'));

assert.equal(SOCIAL_KPI_CONTRACT.objective, 'verified_social_to_qualified_pipeline');
assert.deepEqual(
  SOCIAL_KPI_CONTRACT.guardrails.map((metric) => [metric.id, metric.target]),
  [
    ['unauthorized_publish_count', 0],
    ['missing_exact_sha_count', 0],
    ['missing_attribution_token_count', 0],
    ['share_now_count', 0],
  ],
);

const firewallOutput = {
  content_validated: true,
  validated_post_text: 'Verified release evidence with an exact commit, proof link, and governed review window.',
  channel: 'juss_rayy_linkedin',
  publish_allowed: true,
  proof_url: commonInput.proof_url,
  source_commit_sha: sourceCommitSha,
  authorization_mode: 'standing-policy',
  authorization_receipt_verified: true,
  schedule_policy_id: 'buffer-20-minute-review-v1',
  scheduled_at: '2026-08-17T13:20:00.000Z',
  review_deadline: '2026-08-17T13:20:00.000Z',
  review_window_minutes: 20,
  buffer_method: 'schedule',
  buffer_save_to_draft: false,
  share_now_allowed: false,
};

const governed = buildGovernedScheduleEnvelope({
  ...commonInput,
  firewall_output: firewallOutput,
});
assert.equal(governed.lane, 'governed_schedule');
assert.equal(governed.state, 'scheduled_review_window');
assert.equal(governed.text, firewallOutput.validated_post_text);
assert.equal(governed.authority.publish_allowed, true);
assert.equal(governed.authority.standing_policy_applied, true);
assert.equal(governed.authority.authorization_receipt_verified, true);
assert.equal(governed.provider_request.method, 'schedule');
assert.equal(governed.provider_request.schedule_at, firewallOutput.scheduled_at);
assert.equal(governed.provider_request.review_window_minutes, 20);
assert.equal(governed.provider_request.share_now_allowed, false);
assert.equal(governed.provider_request.external_write_included, false);

const founderSourceSha = 'b'.repeat(40);
const founderEvidenceRef = `github:chief-ai-machine@${founderSourceSha}#quality-gate`;
const founderProposal = {
  version: 1,
  kind: 'chief-ai/founder-content-proposal',
  source: { repo: 'jussray/chief-ai-machine', commit_sha: founderSourceSha },
  freshness: {
    issued_at: '2026-08-17T07:45:00.000Z',
    expires_at: '2026-08-18T07:45:00.000Z',
  },
  public_payload: {
    platform: 'linkedin',
    story_type: 'founder-progress',
    draft_text: 'I changed how my product decides what it is allowed to say publicly.',
    public_claims: [
      {
        claim_id: 'proof-bound',
        text: 'Public progress claims are now bound to verified evidence.',
        truth_state: 'verified',
        public_safe: true,
        evidence_ref: founderEvidenceRef,
        evidence_scope: 'founder-content-contract',
      },
    ],
    proof_link: null,
    proof_link_policy: 'editorial_optional',
  },
  internal_evidence: {
    verified: true,
    ref: founderEvidenceRef,
    kind: 'github-exact-head-contract',
    digest: 'c'.repeat(64),
    not_for_publication: true,
    source_repo: 'jussray/chief-ai-machine',
    source_commit_sha: founderSourceSha,
    proves: ['founder-content-contract'],
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
    withheld_categories: ['private-implementation', 'private-prompt'],
  },
  authority: {
    proposal_only: true,
    publish_authorized: false,
    current_you_source: 'current_authenticated_founder',
    current_you_intent_id: 'chief-content-intent-current',
    current_you_intent_version: 7,
    current_you_observed_at: '2026-08-17T07:40:00.000Z',
    proposal_evaluated_at: '2026-08-17T07:44:00.000Z',
    future_you_advisory_only: true,
    historical_content_intent_authoritative: false,
    analytics_feedback_authority: 'observation-only',
    analytics_can_authorize_publish: false,
    external_feedback_trusted_for_authority: false,
  },
  proposal_hash: '5dac904c02b00e5b5d79c11d6fd819a431df38094363b25bfcda64e52a1d66ce',
};
const founderApproval = {
  approval_id: 'approval-2026-08-17-current',
  proposal_hash: founderProposal.proposal_hash,
  public_payload_hash: hashPublicPayload(founderProposal.public_payload),
  channels: ['linkedin'],
  approved_at: '2026-08-17T08:00:00.000Z',
  expires_at: '2026-08-17T08:30:00.000Z',
  revoked: false,
  used: false,
  current_you: {
    authenticated: true,
    source: 'current_authenticated_founder',
    intent_id: 'publish-intent-current-2026-08-17',
    intent_version: 8,
    observed_at: '2026-08-17T07:59:00.000Z',
    supersedes_stale_content_intent: true,
  },
};
const firstPartyCommon = {
  content_id: '2ed895a3-8de7-4b2d-9d92-358d651eefc8',
  source_repo: founderProposal.source.repo,
  source_commit_sha: founderProposal.source.commit_sha,
  proof_url: `https://github.com/jussray/chief-ai-machine/commit/${founderSourceSha}`,
  campaign_slug: 'chief-founder-progress',
  platform: 'linkedin',
  destination_url: 'https://foundercontrolroom.org/?from=chief-progress',
};
const firstPartyFirewall = {
  ...firewallOutput,
  validated_post_text: founderProposal.public_payload.draft_text,
  proof_url: firstPartyCommon.proof_url,
  source_commit_sha: founderSourceSha,
  authorization_mode: FIRST_PARTY_AUTHORIZATION_MODE,
};

const firstParty = buildFirstPartyFounderScheduleEnvelope({
  ...firstPartyCommon,
  proposal: founderProposal,
  approval: founderApproval,
  now: '2026-08-17T08:05:00.000Z',
  firewall_output: firstPartyFirewall,
});
assert.equal(firstParty.lane, 'first_party_founder_governed_schedule');
assert.equal(firstParty.state, 'scheduled_review_window');
assert.equal(firstParty.text, founderProposal.public_payload.draft_text);
assert.equal(firstParty.authority.standing_policy_applied, false);
assert.equal(firstParty.authority.authorization_mode, FIRST_PARTY_AUTHORIZATION_MODE);
assert.equal(firstParty.authority.exact_current_you_approval_required, true);
assert.equal(firstParty.authority.first_party_founder_content, true);
assert.equal(firstParty.authority.founder_content_proposal_hash, founderProposal.proposal_hash);
assert.equal(firstParty.authority.current_you_intent_version, 8);
assert.match(firstParty.authority.founder_content_authorization_hash, /^[0-9a-f]{64}$/);
assert.equal(firstParty.provider_request.method, 'schedule');
assert.equal(firstParty.provider_request.share_now_allowed, false);
assert.equal(firstParty.provider_request.external_write_included, false);

assert.throws(
  () => buildFirstPartyFounderScheduleEnvelope({
    ...firstPartyCommon,
    proposal: founderProposal,
    approval: founderApproval,
    now: '2026-08-17T08:05:00.000Z',
    firewall_output: { ...firstPartyFirewall, authorization_mode: 'standing-policy' },
  }),
  /authorization_mode must be exact-current-you/,
);

assert.throws(
  () => buildFirstPartyFounderScheduleEnvelope({
    ...firstPartyCommon,
    proposal: founderProposal,
    approval: founderApproval,
    now: '2026-08-17T08:05:00.000Z',
    firewall_output: { ...firstPartyFirewall, validated_post_text: `${firstPartyFirewall.validated_post_text} Edited.` },
  }),
  /validated_post_text must match exact Current You authorized copy/,
);

assert.throws(
  () => buildGovernedScheduleEnvelope({
    ...commonInput,
    source_commit_sha: 'b'.repeat(40),
    firewall_output: firewallOutput,
  }),
  /source_commit_sha must match the validated firewall source commit/,
);

assert.throws(
  () => buildGovernedScheduleEnvelope({
    ...commonInput,
    platform: 'facebook',
    firewall_output: firewallOutput,
  }),
  /does not match channel juss_rayy_linkedin/,
);

assert.throws(
  () => buildGovernedScheduleEnvelope({
    ...commonInput,
    firewall_output: { ...firewallOutput, authorization_receipt_verified: false },
  }),
  /authorization_receipt_verified must be true/,
);

assert.throws(
  () => buildGovernedScheduleEnvelope({
    ...commonInput,
    firewall_output: { ...firewallOutput, share_now_allowed: true },
  }),
  /share_now_allowed must be false/,
);

assert.throws(
  () => buildEditorialDraftEnvelope({
    ...commonInput,
    source_repo: 'someone-else/founder-control-room',
    text: 'Draft copy',
  }),
  /source_repo must be an owned jussray repository/,
);

assert.throws(
  () => buildEditorialDraftEnvelope({
    ...commonInput,
    destination_url: 'http://foundercontrolroom.org',
    text: 'Draft copy',
  }),
  /destination_url must be an HTTPS URL/,
);

console.log('Social distribution contract verified: first-party founder content must carry the exact Chief proposal and fresh Current You authorization into the existing Buffer review window; generic campaigns remain intact; exact-SHA proof, UTM attribution, HubSpot observation-only analytics, and share-now denial remain enforced.');
