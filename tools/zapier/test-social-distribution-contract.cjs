'use strict';

const assert = require('node:assert/strict');
const {
  buildEditorialDraftEnvelope,
  buildGovernedScheduleEnvelope,
  HUBSPOT_CONTACT_ATTRIBUTION_FIELDS,
  SOCIAL_KPI_CONTRACT,
} = require('./social-distribution-contract.cjs');
const { computePublicSignalHash, PUBLIC_SIGNAL_POLICY_VERSION } = require('./buffer-content-firewall.cjs');

const contentId = '82a030bd-cd2c-4d72-96c9-b38746bc1380';
const sourceCommitSha = 'a'.repeat(40);
const evidenceHash = 'c'.repeat(64);
const commonInput = {
  content_id: contentId,
  source_repo: 'jussray/founder-control-room',
  source_commit_sha: sourceCommitSha,
  proof_url: '',
  evidence_hash: evidenceHash,
  evidence_count: 2,
  campaign_slug: 'fcr-build-in-public',
  platform: 'linkedin',
  destination_url: 'https://foundercontrolroom.org/?from=proof',
};

const editorial = buildEditorialDraftEnvelope({ ...commonInput, text: 'A proof-first founder update that remains a draft until explicit approval.' });
assert.equal(editorial.lane, 'editorial_draft');
assert.equal(editorial.state, 'draft');
assert.equal(editorial.source.proof_url, null);
assert.equal(editorial.evidence_lineage.hash, evidenceHash);
assert.equal(editorial.evidence_lineage.count, 2);
assert.equal(editorial.evidence_lineage.raw_evidence_included, false);
assert.equal(editorial.authority.publish_allowed, false);
assert.equal(editorial.authority.explicit_founder_approval_required, true);
assert.equal(editorial.provider_request.method, 'draft');
assert.equal(editorial.provider_request.share_now_allowed, false);
assert.equal(editorial.provider_request.external_write_included, false);

const editorialUrl = new URL(editorial.attribution.tracked_url);
assert.equal(editorialUrl.searchParams.get('from'), 'proof');
assert.equal(editorialUrl.searchParams.get('utm_source'), 'linkedin');
assert.equal(editorialUrl.searchParams.get('utm_medium'), 'social');
assert.equal(editorialUrl.searchParams.get('utm_campaign'), 'fcr-build-in-public');
assert.equal(editorialUrl.searchParams.get('utm_content'), contentId);
assert.equal(editorial.attribution.hubspot.mode, 'automatic_tracking_only');
assert.deepEqual(editorial.attribution.hubspot.contact_source_fields, HUBSPOT_CONTACT_ATTRIBUTION_FIELDS);
assert.equal(SOCIAL_KPI_CONTRACT.objective, 'verified_social_to_qualified_pipeline');

const binding = {
  post_text: 'Verified release evidence can stay private while the public story remains useful, bounded, and governed.',
  channel: 'juss_rayy_linkedin',
  source_commit_sha: sourceCommitSha,
  proof_url: '',
  current_intent_hash: 'd'.repeat(64),
  source_context_hash: 'e'.repeat(64),
  evidence_hash: evidenceHash,
  evidence_count: 2,
  policy_version: PUBLIC_SIGNAL_POLICY_VERSION,
};
const publicSignalHash = computePublicSignalHash(binding);
const firewallOutput = {
  content_validated: true,
  validated_post_text: binding.post_text,
  channel: binding.channel,
  publish_allowed: true,
  proof_url: '',
  source_commit_sha: sourceCommitSha,
  authorization_mode: 'standing-policy',
  authorization_receipt_verified: false,
  standing_policy_correlation_verified: true,
  founder_approval_id: `standing-policy:founder-approved-auto-distribution-v1:3f10e0f9-b0b4-4e64-b9ff-c5f10f848067:${publicSignalHash.slice(0, 16)}`,
  public_signal_hash: publicSignalHash,
  current_intent_hash: binding.current_intent_hash,
  source_context_hash: binding.source_context_hash,
  evidence_hash: evidenceHash,
  evidence_count: 2,
  policy_version: PUBLIC_SIGNAL_POLICY_VERSION,
  schedule_policy_id: 'buffer-20-minute-review-v1',
  scheduled_at: '2026-08-17T13:20:00.000Z',
  review_deadline: '2026-08-17T13:20:00.000Z',
  review_window_minutes: 20,
  buffer_method: 'schedule',
  buffer_save_to_draft: false,
  share_now_allowed: false,
};

const governed = buildGovernedScheduleEnvelope({ ...commonInput, firewall_output: firewallOutput });
assert.equal(governed.lane, 'governed_schedule');
assert.equal(governed.state, 'scheduled_review_window');
assert.equal(governed.source.proof_url, null);
assert.equal(governed.evidence_lineage.hash, evidenceHash);
assert.equal(governed.evidence_lineage.raw_evidence_included, false);
assert.equal(governed.decision_context.public_signal_hash, publicSignalHash);
assert.equal(governed.authority.publish_allowed, true);
assert.equal(governed.authority.authorization_receipt_verified, false);
assert.equal(governed.authority.standing_policy_correlation_verified, true);
assert.equal(governed.provider_request.method, 'schedule');
assert.equal(governed.provider_request.review_window_minutes, 20);
assert.equal(governed.provider_request.share_now_allowed, false);
assert.equal(governed.provider_request.external_write_included, false);
assert.equal(JSON.stringify(governed).includes('github_evidence'), false);
assert.equal(JSON.stringify(governed).includes('evidence_refs'), false);

assert.throws(() => buildGovernedScheduleEnvelope({ ...commonInput, source_commit_sha: 'b'.repeat(40), firewall_output: firewallOutput }), /source_commit_sha must match/);
assert.throws(() => buildGovernedScheduleEnvelope({ ...commonInput, platform: 'facebook', firewall_output: firewallOutput }), /does not match channel/);
assert.throws(() => buildGovernedScheduleEnvelope({ ...commonInput, firewall_output: { ...firewallOutput, standing_policy_correlation_verified: false } }), /standing_policy_correlation_verified must be true/);
assert.throws(() => buildGovernedScheduleEnvelope({ ...commonInput, firewall_output: { ...firewallOutput, authorization_receipt_verified: true } }), /must not overclaim/);
assert.throws(() => buildGovernedScheduleEnvelope({ ...commonInput, firewall_output: { ...firewallOutput, evidence_hash: '' } }), /private evidence lineage/);
assert.throws(() => buildGovernedScheduleEnvelope({ ...commonInput, firewall_output: { ...firewallOutput, share_now_allowed: true } }), /share_now_allowed must be false/);
assert.throws(() => buildEditorialDraftEnvelope({ ...commonInput, evidence_count: 0, text: 'Draft copy' }), /positive integer/);
assert.throws(() => buildEditorialDraftEnvelope({ ...commonInput, source_repo: 'someone-else/founder-control-room', text: 'Draft copy' }), /owned jussray repository/);
assert.throws(() => buildEditorialDraftEnvelope({ ...commonInput, destination_url: 'http://foundercontrolroom.org', text: 'Draft copy' }), /destination_url must be an HTTPS URL/);
assert.throws(() => buildEditorialDraftEnvelope({ ...commonInput, proof_url: 'http://example.com', text: 'Draft copy' }), /proof_url must be empty or an HTTPS URL/);

console.log('Social distribution contract verified: public proof links are optional, private evidence lineage is mandatory and non-exported, governed schedules bind exact decision context, standing-policy correlation is not misrepresented as authenticated authorization, attribution remains deterministic, and share-now stays forbidden.');
