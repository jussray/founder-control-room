'use strict';

const { createHash } = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const EXACT_SHA = /^[0-9a-f]{40}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const HTTPS_URL = /^https:\/\//i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_CHIEF_PROPOSAL_TTL_MS = 72 * 60 * 60 * 1000;
const MAX_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const PROVIDERS = new Set(['linkedin-direct', 'buffer', 'cambiante']);
const REQUIRED_SAUCE_GUARDS = Object.freeze([
  'private_implementation_removed',
  'secret_material_removed',
  'raw_diff_removed',
  'private_metrics_removed',
  'unreleased_roadmap_removed',
  'customer_private_data_removed',
  'security_sensitive_details_removed',
  'public_claims_only',
]);
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
    Object.freeze({ id: 'stale_content_handoff_count', target: 0 }),
    Object.freeze({ id: 'unauthorized_provider_write_count', target: 0 }),
  ]),
});

function asTrimmedString(value, maxLength = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
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

function parseIso(value, label, errors) {
  const normalized = asTrimmedString(value, 64);
  if (!ISO_DATE.test(normalized)) {
    errors.push(`${label} must be ISO UTC`);
    return { value: normalized, ms: Number.NaN };
  }
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) errors.push(`${label} must be a valid timestamp`);
  return { value: normalized, ms };
}

function clonePublicPayload(payload = {}) {
  return {
    platform: asTrimmedString(payload.platform, 80) || 'linkedin',
    story_type: asTrimmedString(payload.story_type, 80),
    draft_text: asTrimmedString(payload.draft_text, 3000),
    public_claims: Array.isArray(payload.public_claims)
      ? payload.public_claims.map((claim) => ({
          claim_id: asTrimmedString(claim?.claim_id, 80),
          text: asTrimmedString(claim?.text, 500),
          truth_state: asTrimmedString(claim?.truth_state, 40),
          public_safe: claim?.public_safe === true,
        }))
      : [],
    proof_link: asTrimmedString(payload.proof_link, 1000) || null,
    proof_link_policy: 'editorial_optional',
  };
}

function validateChiefProposal(proposal = {}, observedAtInput) {
  const errors = [];
  const sourceRepo = asTrimmedString(proposal.source?.repo, 240);
  const sourceCommitSha = asTrimmedString(proposal.source?.commit_sha, 40).toLowerCase();
  const currentIntentId = asTrimmedString(proposal.authority?.current_you_intent_id, 200);
  const publicPayload = proposal.public_payload && typeof proposal.public_payload === 'object'
    ? proposal.public_payload
    : {};
  const claims = Array.isArray(publicPayload.public_claims) ? publicPayload.public_claims : [];
  const claimEvidence = Array.isArray(proposal.claim_evidence) ? proposal.claim_evidence : [];
  const evidenceByClaim = new Map(
    claimEvidence.map((entry) => [asTrimmedString(entry?.claim_id, 80), entry]),
  );
  const seenClaimIds = new Set();

  if (proposal.kind !== 'chief-ai/founder-content-proposal') errors.push('Chief proposal kind is invalid');
  if (!HASH.test(asTrimmedString(proposal.proposal_hash, 64))) errors.push('Chief proposal_hash must be SHA-256');
  if (!OWNED_REPO.test(sourceRepo)) errors.push('Chief source repo must be an owned jussray repository');
  if (!EXACT_SHA.test(sourceCommitSha)) errors.push('Chief source commit must be an exact SHA');
  if (!currentIntentId) errors.push('Chief current_you_intent_id is required');
  if (proposal.authority?.proposal_only !== true) errors.push('Chief must remain proposal-only');
  if (proposal.authority?.publish_authorized !== false) errors.push('Chief cannot self-authorize publication');
  if (proposal.authority?.future_you_advisory_only !== true) errors.push('FutureYou must remain advisory');
  if (proposal.authority?.historical_content_intent_authoritative !== false) {
    errors.push('historical content intent must remain non-authoritative');
  }
  if (proposal.authority?.analytics_feedback_authority !== 'observation-only') {
    errors.push('Chief analytics feedback must remain observation-only');
  }
  if (proposal.authority?.analytics_can_authorize_publish !== false) {
    errors.push('Chief analytics cannot authorize publication');
  }
  if (proposal.internal_evidence?.verified !== true) errors.push('Chief internal evidence must be verified');
  if (proposal.internal_evidence?.not_for_publication !== true) {
    errors.push('Chief internal evidence must be marked not_for_publication');
  }
  if (!HASH.test(asTrimmedString(proposal.internal_evidence?.digest, 64))) {
    errors.push('Chief internal evidence digest must be SHA-256');
  }
  if (!asTrimmedString(proposal.internal_evidence?.ref, 1000)) errors.push('Chief internal evidence ref is required');

  for (const key of REQUIRED_SAUCE_GUARDS) {
    if (proposal.sauce_guard?.[key] !== true) errors.push(`Chief sauce_guard.${key} must be true`);
  }

  if (!asTrimmedString(publicPayload.draft_text, 3000)) errors.push('Chief public draft is required');
  if (publicPayload.proof_link_policy !== 'editorial_optional') {
    errors.push('Chief public proof-link policy must be editorial_optional');
  }
  const proofLink = asTrimmedString(publicPayload.proof_link, 1000);
  if (proofLink && !HTTPS_URL.test(proofLink)) errors.push('Chief public proof link must be HTTPS when supplied');
  if (claims.length === 0 || claims.length > 8) errors.push('Chief must provide 1-8 public claims');

  claims.forEach((claim, index) => {
    const claimId = asTrimmedString(claim?.claim_id, 80).toLowerCase();
    if (!IDENTIFIER.test(claimId)) errors.push(`Chief public_claims[${index}].claim_id is invalid`);
    if (seenClaimIds.has(claimId)) errors.push(`Chief public_claims[${index}].claim_id is duplicated`);
    seenClaimIds.add(claimId);
    if (!asTrimmedString(claim?.text, 500)) errors.push(`Chief public_claims[${index}].text is required`);
    if (claim?.truth_state !== 'verified') errors.push(`Chief public_claims[${index}] must be verified`);
    if (claim?.public_safe !== true) errors.push(`Chief public_claims[${index}] must be public_safe`);

    const evidence = evidenceByClaim.get(claimId);
    if (!evidence || !Array.isArray(evidence.evidence_refs) || evidence.evidence_refs.length === 0) {
      errors.push(`Chief public_claims[${index}] must have private claim evidence`);
    }
  });

  if (claimEvidence.length !== claims.length) errors.push('Chief claim evidence must map one-to-one with public claims');

  const issued = parseIso(proposal.freshness?.issued_at, 'Chief issued_at', errors);
  const expires = parseIso(proposal.freshness?.expires_at, 'Chief expires_at', errors);
  const observed = parseIso(observedAtInput, 'observed_at', errors);
  if (!Number.isNaN(issued.ms) && !Number.isNaN(expires.ms)) {
    if (expires.ms <= issued.ms) errors.push('Chief proposal expiry must be after issuance');
    if (expires.ms - issued.ms > MAX_CHIEF_PROPOSAL_TTL_MS) errors.push('Chief proposal lifetime may not exceed 72 hours');
  }
  if (!Number.isNaN(observed.ms) && !Number.isNaN(issued.ms) && observed.ms < issued.ms) {
    errors.push('Chief proposal is future-dated relative to FCR observation');
  }
  if (!Number.isNaN(observed.ms) && !Number.isNaN(expires.ms) && observed.ms >= expires.ms) {
    errors.push('Chief proposal is stale at FCR ingestion');
  }

  if (errors.length > 0) reject(errors);

  return {
    sourceRepo,
    sourceCommitSha,
    currentIntentId,
    observedAt: observed.value,
    issuedAt: issued.value,
    expiresAt: expires.value,
    claimEvidence: claimEvidence.map((entry) => ({
      claim_id: asTrimmedString(entry.claim_id, 80),
      evidence_refs: [...entry.evidence_refs].map((ref) => asTrimmedString(ref, 500)).filter(Boolean),
    })),
  };
}

function buildCanonicalFirstPartyDraft(input = {}) {
  const proposal = input.chief_proposal && typeof input.chief_proposal === 'object'
    ? input.chief_proposal
    : {};
  const verifiedChief = validateChiefProposal(proposal, input.observed_at);

  const contentId = asTrimmedString(input.content_id, 64);
  const campaignSlug = asTrimmedString(input.campaign_slug, 120).toLowerCase();
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
    current_you_intent_id: verifiedChief.currentIntentId,
    evidence_expires_at: verifiedChief.expiresAt,
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
      source_repo: verifiedChief.sourceRepo,
      source_commit_sha: verifiedChief.sourceCommitSha,
      internal_evidence_ref: proposal.internal_evidence.ref,
      internal_evidence_digest: proposal.internal_evidence.digest,
      claim_evidence: verifiedChief.claimEvidence,
      chief_issued_at: verifiedChief.issuedAt,
      chief_observed_at: verifiedChief.observedAt,
      evidence_expires_at: verifiedChief.expiresAt,
    },
    authority: {
      state: 'draft',
      current_you_intent_id: verifiedChief.currentIntentId,
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
  const approvalId = asTrimmedString(approval.approval_id, 240);
  const approvalIntentId = asTrimmedString(approval.current_you_intent_id, 200);
  const approvedAt = parseIso(approval.approved_at, 'approved_at', errors);
  const expiresAt = parseIso(approval.expires_at, 'expires_at', errors);

  if (draft.kind !== 'fcr/first-party-founder-content') errors.push('draft kind is invalid');
  if (!HASH.test(asTrimmedString(draft.content_hash, 64))) errors.push('draft content_hash is invalid');
  if (approval.authenticated_current_you !== true) errors.push('approval must come from authenticated Current You');
  if (asTrimmedString(approval.content_hash, 64) !== draft.content_hash) errors.push('approval content_hash must match exact draft');
  if (!approvalIntentId || approvalIntentId !== draft.authority?.current_you_intent_id) {
    errors.push('approval current_you_intent_id must match the draft intent');
  }
  if (!approvalId) errors.push('approval_id is required');

  if (!Number.isNaN(approvedAt.ms) && !Number.isNaN(expiresAt.ms)) {
    if (!(expiresAt.ms > approvedAt.ms)) errors.push('approval must expire after approval time');
    if (expiresAt.ms - approvedAt.ms > MAX_APPROVAL_TTL_MS) errors.push('approval validity may not exceed 24 hours');
  }
  const evidenceExpiryMs = Date.parse(draft.private_lineage?.evidence_expires_at || '');
  if (!Number.isNaN(approvedAt.ms) && !Number.isNaN(evidenceExpiryMs) && approvedAt.ms >= evidenceExpiryMs) {
    errors.push('source evidence is stale before approval');
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
      approved_at: approvedAt.value,
      expires_at: expiresAt.value,
    },
  };
}

function buildProviderHandoff(approvedDraft = {}, input = {}) {
  const provider = asTrimmedString(input.provider, 80).toLowerCase();
  const observedCurrentIntentId = asTrimmedString(input.current_you_intent_id, 200);
  const errors = [];
  const now = parseIso(input.now, 'now', errors);

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

  const approvalExpiryMs = Date.parse(approvedDraft.authority?.expires_at || '');
  if (!Number.isNaN(now.ms) && !Number.isNaN(approvalExpiryMs) && now.ms >= approvalExpiryMs) {
    errors.push('founder approval is expired');
  }
  const evidenceExpiryMs = Date.parse(approvedDraft.private_lineage?.evidence_expires_at || '');
  if (!Number.isNaN(now.ms) && !Number.isNaN(evidenceExpiryMs) && now.ms >= evidenceExpiryMs) {
    errors.push('source evidence is stale at provider handoff');
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
      source_evidence_reverified_fresh: true,
      provider_handoff_allowed: true,
      provider_write_authorized: false,
      external_write_included: false,
    },
    privacy: {
      includes_private_lineage: false,
      includes_internal_evidence_ref: false,
      includes_claim_evidence: false,
      includes_raw_diff: false,
      includes_secret_material: false,
    },
  };
}

function buildContentOutcomeObservation(input = {}) {
  const contentHash = asTrimmedString(input.content_hash, 64);
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
    platform: asTrimmedString(input.platform, 80).toLowerCase() || 'linkedin',
    metrics,
    authority: {
      observation_only: true,
      can_authorize_publish: false,
      can_change_content: false,
    },
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
