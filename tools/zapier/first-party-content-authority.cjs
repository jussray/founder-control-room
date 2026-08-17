'use strict';

const { createHash } = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PROVIDERS = new Set(['linkedin-direct', 'buffer', 'cambiante']);
const METRIC_KEYS = Object.freeze([
  'impressions',
  'reactions',
  'comments',
  'profile_views',
  'attributed_visits',
  'qualified_conversations',
  'attributed_contacts',
  'attributed_deals',
]);

const FIRST_PARTY_CONTENT_KPI_CONTRACT = Object.freeze({
  objective: 'verified_founder_content_to_qualified_pipeline',
  outcomes: Object.freeze([
    Object.freeze({ id: 'qualified_conversations', source: 'sanitized_outcome_observation' }),
    Object.freeze({ id: 'attributed_contacts', source: 'sanitized_outcome_observation' }),
    Object.freeze({ id: 'attributed_deals', source: 'sanitized_outcome_observation' }),
  ]),
  learning_signals: Object.freeze([
    Object.freeze({ id: 'impressions', source: 'provider_analytics' }),
    Object.freeze({ id: 'profile_views', source: 'provider_analytics' }),
    Object.freeze({ id: 'attributed_visits', source: 'utm_or_provider_analytics' }),
  ]),
  guardrails: Object.freeze([
    Object.freeze({ id: 'unsupported_public_claim_count', target: 0 }),
    Object.freeze({ id: 'post_approval_edit_count', target: 0 }),
    Object.freeze({ id: 'sauce_leak_count', target: 0 }),
    Object.freeze({ id: 'unauthorized_provider_write_count', target: 0 }),
  ]),
});

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function reject(errors) {
  const error = new Error(`FIRST_PARTY_CONTENT_REJECTED: ${errors.join('; ')}`);
  error.code = 'FIRST_PARTY_CONTENT_REJECTED';
  error.details = errors;
  throw error;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clonePublicPayload(payload = {}) {
  return {
    platform: asTrimmedString(payload.platform) || 'linkedin',
    story_type: asTrimmedString(payload.story_type),
    draft_text: asTrimmedString(payload.draft_text),
    public_claims: Array.isArray(payload.public_claims)
      ? payload.public_claims.map((claim) => ({
          text: asTrimmedString(claim?.text),
          truth_state: asTrimmedString(claim?.truth_state),
          public_safe: claim?.public_safe === true,
        }))
      : [],
    proof_link: asTrimmedString(payload.proof_link) || null,
    proof_link_policy: 'editorial_optional',
  };
}

function validateChiefProposal(proposal = {}) {
  const errors = [];
  if (proposal.kind !== 'chief-ai/founder-content-proposal') errors.push('Chief proposal kind is invalid');
  if (!HASH.test(asTrimmedString(proposal.proposal_hash))) errors.push('Chief proposal_hash must be SHA-256');
  if (proposal.authority?.proposal_only !== true) errors.push('Chief must remain proposal-only');
  if (proposal.authority?.publish_authorized !== false) errors.push('Chief cannot self-authorize publication');
  if (proposal.authority?.future_you_advisory_only !== true) errors.push('FutureYou must remain advisory');
  if (proposal.internal_evidence?.verified !== true) errors.push('Chief internal evidence must be verified');
  if (proposal.sauce_guard?.private_implementation_removed !== true) errors.push('private implementation must be removed');
  if (proposal.sauce_guard?.secret_material_removed !== true) errors.push('secret material must be removed');
  if (proposal.sauce_guard?.raw_diff_removed !== true) errors.push('raw diff must be removed');
  if (proposal.sauce_guard?.public_claims_only !== true) errors.push('only public-safe claims may enter FCR');
  if (!asTrimmedString(proposal.public_payload?.draft_text)) errors.push('Chief public draft is required');

  if (errors.length > 0) reject(errors);
}

function buildCanonicalFirstPartyDraft(input = {}) {
  const proposal = input.chief_proposal && typeof input.chief_proposal === 'object'
    ? input.chief_proposal
    : {};
  validateChiefProposal(proposal);

  const contentId = asTrimmedString(input.content_id);
  const campaignSlug = asTrimmedString(input.campaign_slug).toLowerCase();
  const errors = [];
  if (!UUID.test(contentId)) errors.push('content_id must be a UUID');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(campaignSlug)) errors.push('campaign_slug must be lowercase kebab-case');
  if (errors.length > 0) reject(errors);

  const publicPayload = clonePublicPayload(proposal.public_payload);
  const identity = {
    version: 1,
    content_id: contentId,
    campaign_slug: campaignSlug,
    chief_proposal_hash: proposal.proposal_hash,
    current_you_intent_id: proposal.authority.current_you_intent_id,
    public_payload: publicPayload,
  };
  const contentHash = hash(identity);

  return {
    version: 1,
    kind: 'fcr/first-party-founder-content',
    canonical_system: 'founder-control-room',
    content_brain: 'chief-ai-machine',
    content_id: contentId,
    campaign_slug: campaignSlug,
    content_hash: contentHash,
    public_payload: publicPayload,
    private_lineage: {
      chief_proposal_hash: proposal.proposal_hash,
      source_repo: proposal.source?.repo,
      source_commit_sha: proposal.source?.commit_sha,
      internal_evidence_ref: proposal.internal_evidence?.ref,
    },
    authority: {
      state: 'draft',
      current_you_intent_id: proposal.authority.current_you_intent_id,
      founder_approved: false,
      provider_handoff_allowed: false,
      provider_write_authorized: false,
      edits_invalidate_approval: true,
      future_you_advisory_only: true,
    },
    analytics: {
      content_hash: contentHash,
      platform: publicPayload.platform,
      story_type: publicPayload.story_type,
      raw_post_text_stored: false,
      kpi_contract: FIRST_PARTY_CONTENT_KPI_CONTRACT,
    },
  };
}

function approveFirstPartyDraft(draft = {}, approval = {}) {
  const errors = [];
  const approvalId = asTrimmedString(approval.approval_id);
  const approvedAt = asTrimmedString(approval.approved_at);
  const expiresAt = asTrimmedString(approval.expires_at);
  const approvalIntentId = asTrimmedString(approval.current_you_intent_id);

  if (draft.kind !== 'fcr/first-party-founder-content') errors.push('draft kind is invalid');
  if (!HASH.test(asTrimmedString(draft.content_hash))) errors.push('draft content_hash is invalid');
  if (approval.authenticated_current_you !== true) errors.push('approval must come from authenticated Current You');
  if (asTrimmedString(approval.content_hash) !== draft.content_hash) errors.push('approval content_hash must match exact draft');
  if (!approvalIntentId || approvalIntentId !== draft.authority?.current_you_intent_id) {
    errors.push('approval current_you_intent_id must match the draft intent');
  }
  if (!approvalId) errors.push('approval_id is required');
  if (!ISO_DATE.test(approvedAt)) errors.push('approved_at must be ISO UTC');
  if (!ISO_DATE.test(expiresAt)) errors.push('expires_at must be ISO UTC');

  if (ISO_DATE.test(approvedAt) && ISO_DATE.test(expiresAt)) {
    const approvalTime = Date.parse(approvedAt);
    const expiryTime = Date.parse(expiresAt);
    if (!(expiryTime > approvalTime)) errors.push('approval must expire after approval time');
    if (expiryTime - approvalTime > 24 * 60 * 60 * 1000) errors.push('approval validity may not exceed 24 hours');
  }
  if (errors.length > 0) reject(errors);

  return {
    ...draft,
    authority: {
      ...draft.authority,
      state: 'approved',
      founder_approved: true,
      provider_handoff_allowed: true,
      provider_write_authorized: false,
      approval_id: approvalId,
      approved_content_hash: draft.content_hash,
      approved_current_you_intent_id: approvalIntentId,
      approved_at: approvedAt,
      expires_at: expiresAt,
    },
  };
}

function buildProviderHandoff(approvedDraft = {}, input = {}) {
  const provider = asTrimmedString(input.provider).toLowerCase();
  const now = asTrimmedString(input.now);
  const observedCurrentIntentId = asTrimmedString(input.current_you_intent_id);
  const errors = [];

  if (!PROVIDERS.has(provider)) errors.push('provider is not supported');
  if (approvedDraft.authority?.founder_approved !== true) errors.push('founder approval is required');
  if (approvedDraft.authority?.provider_handoff_allowed !== true) errors.push('provider handoff is not allowed');
  if (approvedDraft.authority?.approved_content_hash !== approvedDraft.content_hash) {
    errors.push('approved content hash no longer matches draft');
  }
  if (input.current_you_verified !== true) errors.push('Current You must be reverified at provider handoff');
  if (!observedCurrentIntentId || observedCurrentIntentId !== approvedDraft.authority?.approved_current_you_intent_id) {
    errors.push('approved content intent is stale relative to Current You');
  }
  if (input.approval_revoked === true) errors.push('founder approval has been revoked');
  if (!ISO_DATE.test(now)) errors.push('now must be ISO UTC');
  if (ISO_DATE.test(now) && ISO_DATE.test(approvedDraft.authority?.expires_at || '')) {
    if (Date.parse(now) >= Date.parse(approvedDraft.authority.expires_at)) errors.push('founder approval is expired');
  }
  if (errors.length > 0) reject(errors);

  return {
    version: 1,
    kind: 'fcr/provider-content-handoff',
    provider,
    content_id: approvedDraft.content_id,
    content_hash: approvedDraft.content_hash,
    public_payload: clonePublicPayload(approvedDraft.public_payload),
    authority: {
      approval_id: approvedDraft.authority.approval_id,
      approved_content_hash: approvedDraft.content_hash,
      current_you_intent_id: observedCurrentIntentId,
      current_you_reverified: true,
      provider_handoff_allowed: true,
      provider_write_authorized: false,
      external_write_included: false,
    },
    privacy: {
      includes_private_lineage: false,
      includes_internal_evidence_ref: false,
      includes_raw_diff: false,
      includes_secret_material: false,
    },
  };
}

function buildContentOutcomeObservation(input = {}) {
  const contentHash = asTrimmedString(input.content_hash);
  const errors = [];
  if (!HASH.test(contentHash)) errors.push('content_hash must be SHA-256');
  for (const forbidden of ['raw_post_text', 'dm_text', 'comment_text', 'provider_payload']) {
    if (Object.prototype.hasOwnProperty.call(input, forbidden)) errors.push(`${forbidden} is forbidden in analytics observations`);
  }

  const metrics = {};
  for (const key of METRIC_KEYS) {
    const value = input.metrics?.[key];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0) errors.push(`metrics.${key} must be a non-negative integer`);
    else metrics[key] = value;
  }
  if (errors.length > 0) reject(errors);

  return {
    version: 1,
    kind: 'fcr/founder-content-outcome',
    content_hash: contentHash,
    platform: asTrimmedString(input.platform).toLowerCase() || 'linkedin',
    metrics,
    privacy: {
      raw_post_text_stored: false,
      private_messages_stored: false,
      provider_payload_stored: false,
    },
  };
}

module.exports = {
  approveFirstPartyDraft,
  buildCanonicalFirstPartyDraft,
  buildContentOutcomeObservation,
  buildProviderHandoff,
  FIRST_PARTY_CONTENT_KPI_CONTRACT,
};
