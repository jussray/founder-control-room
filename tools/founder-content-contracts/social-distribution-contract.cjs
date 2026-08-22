'use strict';

const {
  authorizeFounderContentPublication,
} = require('./founder-content-authorization-contract.cjs');

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const HTTPS_URL = /^https:\/\//i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;
const CAMPAIGN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BUFFER_SCHEDULE_POLICY_ID = 'buffer-20-minute-review-v1';
const FIRST_PARTY_AUTHORIZATION_MODE = 'exact-current-you';

const KNOWN_CHANNEL_PLATFORMS = Object.freeze({
  juss_rayy_linkedin: 'linkedin',
  juss_and_co_facebook: 'facebook',
  juss_beautiful_hair_facebook: 'facebook',
});

const HUBSPOT_CONTACT_ATTRIBUTION_FIELDS = Object.freeze([
  'hs_analytics_source',
  'hs_analytics_source_data_1',
  'hs_analytics_source_data_2',
  'hs_latest_source',
  'hs_latest_source_data_1',
  'hs_latest_source_data_2',
]);

const SOCIAL_KPI_CONTRACT = Object.freeze({
  objective: 'verified_social_to_qualified_pipeline',
  outcomes: Object.freeze([
    Object.freeze({ id: 'social_attributed_contacts', source: 'hubspot_contact_tracking' }),
    Object.freeze({ id: 'social_attributed_deals', source: 'hubspot_contact_to_deal_association' }),
  ]),
  inputs: Object.freeze([
    Object.freeze({ id: 'editorial_drafts_created', source: 'fcr_distribution_receipt' }),
    Object.freeze({ id: 'governed_posts_scheduled', source: 'fcr_distribution_receipt' }),
    Object.freeze({ id: 'provider_posts_published', source: 'buffer_provider_receipt' }),
  ]),
  guardrails: Object.freeze([
    Object.freeze({ id: 'unauthorized_publish_count', target: 0 }),
    Object.freeze({ id: 'missing_exact_sha_count', target: 0 }),
    Object.freeze({ id: 'missing_attribution_token_count', target: 0 }),
    Object.freeze({ id: 'share_now_count', target: 0 }),
  ]),
});

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function reject(errors) {
  const error = new Error(`SOCIAL_DISTRIBUTION_REJECTED: ${errors.join('; ')}`);
  error.code = 'SOCIAL_DISTRIBUTION_REJECTED';
  error.details = errors;
  throw error;
}

function validateCommon(input = {}) {
  const contentId = asTrimmedString(input.content_id);
  const sourceRepo = asTrimmedString(input.source_repo);
  const sourceCommitSha = asTrimmedString(input.source_commit_sha);
  const proofUrl = asTrimmedString(input.proof_url);
  const campaignSlug = asTrimmedString(input.campaign_slug).toLowerCase();
  const platform = asTrimmedString(input.platform).toLowerCase();
  const destinationUrl = asTrimmedString(input.destination_url);
  const errors = [];

  if (!UUID.test(contentId)) errors.push('content_id must be a UUID');
  if (!OWNED_REPO.test(sourceRepo)) errors.push('source_repo must be an owned jussray repository');
  if (!EXACT_COMMIT_SHA.test(sourceCommitSha)) errors.push('source_commit_sha must be an exact 40-character commit SHA');
  if (!HTTPS_URL.test(proofUrl)) errors.push('proof_url must be an HTTPS URL');
  if (!CAMPAIGN_SLUG.test(campaignSlug)) errors.push('campaign_slug must be lowercase kebab-case');
  if (!platform) errors.push('platform is required');
  if (!HTTPS_URL.test(destinationUrl)) errors.push('destination_url must be an HTTPS URL');

  if (errors.length > 0) reject(errors);

  return {
    contentId,
    sourceRepo,
    sourceCommitSha,
    proofUrl,
    campaignSlug,
    platform,
    destinationUrl,
  };
}

function buildTrackedUrl(destinationUrl, { platform, campaignSlug, contentId }) {
  const url = new URL(destinationUrl);
  url.searchParams.set('utm_source', platform);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', campaignSlug);
  url.searchParams.set('utm_content', contentId);
  return url.toString();
}

function buildAttribution(common) {
  return {
    version: 1,
    utm_source: common.platform,
    utm_medium: 'social',
    utm_campaign: common.campaignSlug,
    utm_content: common.contentId,
    destination_url: common.destinationUrl,
    tracked_url: buildTrackedUrl(common.destinationUrl, common),
    hubspot: {
      mode: 'automatic_tracking_only',
      contact_source_fields: [...HUBSPOT_CONTACT_ATTRIBUTION_FIELDS],
      campaign_object_required: false,
    },
  };
}

function buildEditorialDraftEnvelope(input = {}) {
  const common = validateCommon(input);
  const text = asTrimmedString(input.text);
  if (!text) reject(['text is required for an editorial draft']);

  return {
    version: 1,
    lane: 'editorial_draft',
    provider: 'buffer',
    state: 'draft',
    content_id: common.contentId,
    platform: common.platform,
    text,
    source: {
      repo: common.sourceRepo,
      commit_sha: common.sourceCommitSha,
      proof_url: common.proofUrl,
    },
    attribution: buildAttribution(common),
    authority: {
      publish_allowed: false,
      schedule_allowed: false,
      explicit_founder_approval_required: true,
      standing_policy_applied: false,
    },
    provider_request: {
      method: 'draft',
      save_to_draft: true,
      schedule_at: null,
      share_now_allowed: false,
      external_write_included: false,
    },
    kpi_contract: SOCIAL_KPI_CONTRACT,
  };
}

function buildGovernedScheduleEnvelope(input = {}) {
  const firewallOutput = input.firewall_output && typeof input.firewall_output === 'object'
    ? input.firewall_output
    : {};
  const common = validateCommon({
    ...input,
    source_commit_sha: asTrimmedString(firewallOutput.source_commit_sha) || input.source_commit_sha,
    proof_url: asTrimmedString(firewallOutput.proof_url) || input.proof_url,
  });
  const errors = [];
  const channel = asTrimmedString(firewallOutput.channel);
  const knownPlatform = KNOWN_CHANNEL_PLATFORMS[channel];

  if (firewallOutput.content_validated !== true) errors.push('firewall_output.content_validated must be true');
  if (firewallOutput.publish_allowed !== true) errors.push('firewall_output.publish_allowed must be true');
  if (firewallOutput.authorization_receipt_verified !== true) {
    errors.push('firewall_output.authorization_receipt_verified must be true');
  }
  if (firewallOutput.buffer_method !== 'schedule') errors.push('firewall_output.buffer_method must be schedule');
  if (firewallOutput.buffer_save_to_draft !== false) errors.push('firewall_output.buffer_save_to_draft must be false');
  if (firewallOutput.share_now_allowed !== false) errors.push('firewall_output.share_now_allowed must be false');
  if (firewallOutput.schedule_policy_id !== BUFFER_SCHEDULE_POLICY_ID) {
    errors.push('firewall_output.schedule_policy_id must match the checked-in Buffer review policy');
  }
  if (!asTrimmedString(firewallOutput.validated_post_text)) {
    errors.push('firewall_output.validated_post_text is required');
  }
  if (!asTrimmedString(firewallOutput.scheduled_at)) errors.push('firewall_output.scheduled_at is required');
  if (knownPlatform && knownPlatform !== common.platform) {
    errors.push(`platform ${common.platform} does not match channel ${channel}`);
  }
  if (
    asTrimmedString(input.source_commit_sha) &&
    asTrimmedString(input.source_commit_sha) !== asTrimmedString(firewallOutput.source_commit_sha)
  ) {
    errors.push('source_commit_sha must match the validated firewall source commit');
  }
  if (asTrimmedString(input.proof_url) && asTrimmedString(input.proof_url) !== asTrimmedString(firewallOutput.proof_url)) {
    errors.push('proof_url must match the validated firewall proof URL');
  }

  if (errors.length > 0) reject(errors);

  return {
    version: 1,
    lane: 'governed_schedule',
    provider: 'buffer',
    state: 'scheduled_review_window',
    content_id: common.contentId,
    platform: common.platform,
    channel,
    text: firewallOutput.validated_post_text,
    source: {
      repo: common.sourceRepo,
      commit_sha: common.sourceCommitSha,
      proof_url: common.proofUrl,
    },
    attribution: buildAttribution(common),
    authority: {
      publish_allowed: true,
      schedule_allowed: true,
      explicit_founder_approval_required: false,
      standing_policy_applied: true,
      authorization_mode: firewallOutput.authorization_mode,
      authorization_receipt_verified: true,
      schedule_policy_id: firewallOutput.schedule_policy_id,
    },
    provider_request: {
      method: 'schedule',
      save_to_draft: false,
      schedule_at: firewallOutput.scheduled_at,
      review_deadline: firewallOutput.review_deadline,
      review_window_minutes: firewallOutput.review_window_minutes,
      share_now_allowed: false,
      external_write_included: false,
    },
    kpi_contract: SOCIAL_KPI_CONTRACT,
  };
}

function buildFirstPartyFounderScheduleEnvelope(input = {}) {
  const authorization = authorizeFounderContentPublication({
    proposal: input.proposal,
    approval: input.approval,
    now: input.now,
  });
  const firewallOutput = input.firewall_output && typeof input.firewall_output === 'object'
    ? input.firewall_output
    : {};
  const errors = [];
  const sourceRepo = asTrimmedString(input.source_repo);
  const sourceCommitSha = asTrimmedString(input.source_commit_sha).toLowerCase();
  const platform = asTrimmedString(input.platform).toLowerCase();
  const validatedText = asTrimmedString(firewallOutput.validated_post_text);

  if (firewallOutput.authorization_mode !== FIRST_PARTY_AUTHORIZATION_MODE) {
    errors.push(`firewall_output.authorization_mode must be ${FIRST_PARTY_AUTHORIZATION_MODE} for first-party founder content`);
  }
  if (firewallOutput.authorization_receipt_verified !== true) {
    errors.push('firewall_output.authorization_receipt_verified must be true');
  }
  if (authorization.state !== 'authorized-for-scheduled-review') {
    errors.push('founder content authorization must be authorized-for-scheduled-review');
  }
  if (authorization.authority?.share_now_allowed !== false) {
    errors.push('founder content authorization must forbid share-now');
  }
  if (authorization.source.repo !== sourceRepo || authorization.source.commit_sha !== sourceCommitSha) {
    errors.push('distribution source must match exact authorized founder-content source');
  }
  if (authorization.content.platform !== platform || !authorization.channels.includes(platform)) {
    errors.push('distribution platform must match exact authorized founder-content platform');
  }
  if (!validatedText || validatedText !== authorization.content.text) {
    errors.push('firewall validated_post_text must match exact Current You authorized copy');
  }
  if (errors.length > 0) reject(errors);

  const envelope = buildGovernedScheduleEnvelope(input);
  return {
    ...envelope,
    lane: 'first_party_founder_governed_schedule',
    authority: {
      ...envelope.authority,
      standing_policy_applied: false,
      authorization_mode: FIRST_PARTY_AUTHORIZATION_MODE,
      exact_current_you_approval_required: true,
      first_party_founder_content: true,
      founder_content_authorization_hash: authorization.authorization_hash,
      founder_content_proposal_hash: authorization.proposal_hash,
      public_payload_hash: authorization.public_payload_hash,
      current_you_intent_id: authorization.current_you.intent_id,
      current_you_intent_version: authorization.current_you.intent_version,
    },
  };
}

module.exports = {
  buildEditorialDraftEnvelope,
  buildFirstPartyFounderScheduleEnvelope,
  buildGovernedScheduleEnvelope,
  buildTrackedUrl,
  FIRST_PARTY_AUTHORIZATION_MODE,
  HUBSPOT_CONTACT_ATTRIBUTION_FIELDS,
  KNOWN_CHANNEL_PLATFORMS,
  SOCIAL_KPI_CONTRACT,
};
