'use strict';

require('./test-founder-content-authorization-contract.cjs');

const assert = require('node:assert/strict');
const {
  buildEditorialDraftEnvelope,
  buildGovernedScheduleEnvelope,
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

console.log('Social distribution contract verified: editorial work fails into Buffer draft-only authority, governed schedules inherit the existing firewall receipt and review policy, exact-SHA proof cannot drift, UTM attribution is deterministic, HubSpot source fields stay read-only, and share-now remains forbidden.');
