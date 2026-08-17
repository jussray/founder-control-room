'use strict';

const { createHash } = require('node:crypto');
const { buildEditorialDraftEnvelope } = require('./social-distribution-contract.cjs');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const EXACT_SHA = /^[0-9a-f]{40}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const HTTPS_URL = /^https:\/\//i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_CHIEF_PROPOSAL_TTL_MS = 72 * 60 * 60 * 1000;
const MAX_INTENT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
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
const SECRET_LIKE = /(gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~+\/-]{16,}|-----BEGIN [A-Z ]+PRIVATE KEY-----|(?:api|access|auth)[_-]?token\s*[:=]\s*\S+)/i;
const EMAIL_LIKE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PRIVATE_URL = /https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|[^/\s]+\.internal)(?:[/:?#]|$)/i;
const PRIVATE_ARTIFACT = /github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+(?:\/artifacts\/\d+)?/i;
const SAUCE_DETAIL = /\b(?:system prompt|private prompt|chain[- ]of[- ]thought|routing weights?|scoring formula|secret algorithm|internal notes?|raw diff|service[_ -]?role|environment variable|provider payload|database password)\b/i;
const HIGH_RISK_CLAIM = /\b(?:production[- ]ready|fully secure|security[- ]certified|compliance[- ]certified|certified compliant|live in production|production is live|customer traction|revenue traction)\b/i;

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
    Object.freeze({ id: 'unknown_metric_coerced_to_zero_count', target: 0 }),
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

function scanPublicText(text, field) {
  const findings = [];
  if (SECRET_LIKE.test(text)) findings.push(`${field} contains secret-like material`);
  if (EMAIL_LIKE.test(text)) findings.push(`${field} contains an email address`);
  if (PRIVATE_URL.test(text)) findings.push(`${field} contains a private-network URL`);
  if (PRIVATE_ARTIFACT.test(text)) findings.push(`${field} contains a private workflow artifact URL`);
  if (SAUCE_DETAIL.test(text)) findings.push(`${field} contains proprietary implementation detail`);
  if (text.includes('```')) findings.push(`${field} contains a code block; public code disclosure requires a separate review`);
  if (HIGH_RISK_CLAIM.test(text)) findings.push(`${field} contains a high-risk public claim requiring a dedicated proof contract`);
  return findings;
}

function clonePublicPayload(payload = {}) {
  return {
    platform: asTrimmedString(payload.platform, 80) || 'linkedin',
    story_type: asTrimmedString(payload.story_type, 80),
    draft_text: asTrimmedString(payload.draft_text, 3000),
    public_claims: Array.isArray(payload.public_claims)
      ? payload.public_claims.map((claim) => ({
          claim_id: asTrimmedString(claim?.claim_id, 80).toLowerCase(),
          text: asTrimmedString(claim?.text, 500),
          truth_state: asTrimmedString(claim?.truth_state, 40).toLowerCase(),
          public_safe: claim?.public_safe === true,
          evidence_ref: asTrimmedString(claim?.evidence_ref, 1000),
          evidence_scope: asTrimmedString(claim?.evidence_scope, 160),
        }))
      : [],
    proof_link: asTrimmedString(payload.proof_link, 1000) || null,
    proof_link_policy: 'editorial_optional',
  };
}

function normalizeInternalEvidence(evidence = {}) {
  return {
    verified: evidence.verified === true,
    ref: asTrimmedString(evidence.ref, 1000),
    kind: asTrimmedString(evidence.kind, 120),
    digest: asTrimmedString(evidence.digest, 64).toLowerCase(),
    not_for_publication: evidence.not_for_publication === true,
    source_repo: asTrimmedString(evidence.source_repo, 240),
    source_commit_sha: asTrimmedString(evidence.source_commit_sha, 40).toLowerCase(),
    proves: Array.isArray(evidence.proves) ? [...new Set(evidence.proves.map((item) => asTrimmedString(item, 160)).filter(Boolean))] : [],
    does_not_prove: Array.isArray(evidence.does_not_prove) ? [...new Set(evidence.does_not_prove.map((item) => asTrimmedString(item, 160)).filter(Boolean))] : [],
  };
}

function normalizeSauceGuard(guard = {}) {
  return {
    scanner_version: asTrimmedString(guard.scanner_version, 80),
    ...Object.fromEntries(REQUIRED_SAUCE_GUARDS.map((key) => [key, guard[key] === true])),
    independent_scan_passed: guard.independent_scan_passed === true,
    blocked_categories: Array.isArray(guard.blocked_categories) ? guard.blocked_categories.map((item) => asTrimmedString(item, 80)).filter(Boolean) : [],
    withheld_categories: Array.isArray(guard.withheld_categories) ? guard.withheld_categories.map((item) => asTrimmedString(item, 80)).filter(Boolean) : [],
  };
}

function chiefProposalIdentity(proposal = {}) {
  const publicPayload = clonePublicPayload(proposal.public_payload);
  const internalEvidence = normalizeInternalEvidence(proposal.internal_evidence);
  const sauceGuard = normalizeSauceGuard(proposal.sauce_guard);
  return {
    version: 1,
    source: {
      repo: asTrimmedString(proposal.source?.repo, 240),
      commit_sha: asTrimmedString(proposal.source?.commit_sha, 40).toLowerCase(),
    },
    current_you: {
      intent_id: asTrimmedString(proposal.authority?.current_you_intent_id, 200),
      intent_version: proposal.authority?.current_you_intent_version,
      observed_at: asTrimmedString(proposal.authority?.current_you_observed_at, 64),
      evaluated_at: asTrimmedString(proposal.authority?.proposal_evaluated_at, 64),
    },
    freshness: {
      issued_at: asTrimmedString(proposal.freshness?.issued_at, 64),
      expires_at: asTrimmedString(proposal.freshness?.expires_at, 64),
    },
    public_payload: publicPayload,
    internal_evidence: internalEvidence,
    sauce_guard: sauceGuard,
  };
}

function computeChiefProposalHash(proposal = {}) {
  return hash(chiefProposalIdentity(proposal));
}

function validateCurrentYouSnapshot(snapshot = {}, nowInput, expected = {}) {
  const errors = [];
  const now = parseIso(nowInput, 'now', errors);
  const observed = parseIso(snapshot.observed_at, 'current_you.observed_at', errors);
  const intentId = asTrimmedString(snapshot.intent_id, 200);
  const intentVersion = snapshot.intent_version;

  if (snapshot.authenticated !== true) errors.push('Current You must be authenticated');
  if (!intentId) errors.push('current_you.intent_id is required');
  if (!Number.isInteger(intentVersion) || intentVersion < 1) errors.push('current_you.intent_version must be a positive integer');
  if (expected.intent_id && intentId !== expected.intent_id) errors.push('Current You intent id no longer matches approved content');
  if (expected.intent_version && intentVersion !== expected.intent_version) errors.push('Current You intent version no longer matches approved content');
  if (!Number.isNaN(now.ms) && !Number.isNaN(observed.ms)) {
    if (observed.ms > now.ms + MAX_CLOCK_SKEW_MS) errors.push('Current You observation is implausibly future-dated');
    if (now.ms - observed.ms > MAX_INTENT_AGE_MS) errors.push('Current You observation is stale and must be reconfirmed');
    if (expected.min_observed_at) {
      const minimum = Date.parse(expected.min_observed_at);
      if (!Number.isNaN(minimum) && observed.ms < minimum) errors.push('Current You was not re-read after the approval boundary');
    }
  }
  if (errors.length > 0) reject(errors);
  return { intent_id: intentId, intent_version: intentVersion, observed_at: observed.value, now: now.value };
}

function validateChiefProposal(proposal = {}, observedAtInput) {
  const errors = [];
  const identity = chiefProposalIdentity(proposal);
  const sourceRepo = identity.source.repo;
  const sourceCommitSha = identity.source.commit_sha;
  const current = identity.current_you;
  const internalEvidence = identity.internal_evidence;
  const publicPayload = identity.public_payload;
  const sauceGuard = identity.sauce_guard;
  const claims = publicPayload.public_claims;
  const observed = parseIso(observedAtInput, 'observed_at', errors);
  const issued = parseIso(identity.freshness.issued_at, 'Chief issued_at', errors);
  const expires = parseIso(identity.freshness.expires_at, 'Chief expires_at', errors);
  const currentObserved = parseIso(current.observed_at, 'Chief Current You observed_at', errors);
  const evaluated = parseIso(current.evaluated_at, 'Chief proposal evaluated_at', errors);

  if (proposal.kind !== 'chief-ai/founder-content-proposal') errors.push('Chief proposal kind is invalid');
  if (!HASH.test(asTrimmedString(proposal.proposal_hash, 64))) errors.push('Chief proposal_hash must be SHA-256');
  if (HASH.test(asTrimmedString(proposal.proposal_hash, 64)) && computeChiefProposalHash(proposal) !== proposal.proposal_hash) {
    errors.push('Chief proposal_hash does not match recomputed proposal identity');
  }
  if (!OWNED_REPO.test(sourceRepo)) errors.push('Chief source repo must be an owned jussray repository');
  if (!EXACT_SHA.test(sourceCommitSha)) errors.push('Chief source commit must be an exact SHA');
  if (!current.intent_id) errors.push('Chief current_you_intent_id is required');
  if (!Number.isInteger(current.intent_version) || current.intent_version < 1) errors.push('Chief current_you_intent_version must be a positive integer');
  if (proposal.authority?.current_you_source !== 'current_authenticated_founder') errors.push('Chief Current You source is invalid');
  if (proposal.authority?.proposal_only !== true) errors.push('Chief must remain proposal-only');
  if (proposal.authority?.publish_authorized !== false) errors.push('Chief cannot self-authorize publication');
  if (proposal.authority?.future_you_advisory_only !== true) errors.push('FutureYou must remain advisory');
  if (proposal.authority?.historical_content_intent_authoritative !== false) errors.push('historical content intent must remain non-authoritative');
  if (proposal.authority?.analytics_feedback_authority !== 'observation-only') errors.push('Chief analytics feedback must remain observation-only');
  if (proposal.authority?.analytics_can_authorize_publish !== false) errors.push('Chief analytics cannot authorize publication');
  if (proposal.authority?.external_feedback_trusted_for_authority !== false) errors.push('external feedback cannot become publication authority');

  if (internalEvidence.verified !== true) errors.push('Chief internal evidence must be verified');
  if (internalEvidence.not_for_publication !== true) errors.push('Chief internal evidence must be marked not_for_publication');
  if (!HASH.test(internalEvidence.digest)) errors.push('Chief internal evidence digest must be SHA-256');
  if (!internalEvidence.ref) errors.push('Chief internal evidence ref is required');
  if (internalEvidence.source_repo !== sourceRepo) errors.push('Chief internal evidence repo must match source repo');
  if (internalEvidence.source_commit_sha !== sourceCommitSha) errors.push('Chief internal evidence SHA must match source SHA');
  if (internalEvidence.proves.length === 0) errors.push('Chief internal evidence must declare what it proves');

  for (const key of REQUIRED_SAUCE_GUARDS) {
    if (sauceGuard[key] !== true) errors.push(`Chief sauce_guard.${key} must be true`);
  }
  if (sauceGuard.scanner_version !== 'sauce-guard-v1') errors.push('Chief sauce scanner version is not supported');
  if (sauceGuard.independent_scan_passed !== true) errors.push('Chief sauce guard must include an independent passing scan');
  if (sauceGuard.blocked_categories.length !== 0) errors.push('Chief sauce guard still contains blocked categories');

  if (!publicPayload.draft_text) errors.push('Chief public draft is required');
  errors.push(...scanPublicText(publicPayload.draft_text, 'Chief draft_text'));
  if (publicPayload.proof_link_policy !== 'editorial_optional') errors.push('Chief public proof-link policy must be editorial_optional');
  if (publicPayload.proof_link) {
    if (!HTTPS_URL.test(publicPayload.proof_link)) errors.push('Chief public proof link must be HTTPS when supplied');
    errors.push(...scanPublicText(publicPayload.proof_link, 'Chief proof_link'));
  }
  if (claims.length === 0 || claims.length > 8) errors.push('Chief must provide 1-8 public claims');
  const seenClaimIds = new Set();
  claims.forEach((claim, index) => {
    if (!IDENTIFIER.test(claim.claim_id)) errors.push(`Chief public_claims[${index}].claim_id is invalid`);
    if (seenClaimIds.has(claim.claim_id)) errors.push(`Chief public_claims[${index}].claim_id is duplicated`);
    seenClaimIds.add(claim.claim_id);
    if (!claim.text) errors.push(`Chief public_claims[${index}].text is required`);
    if (claim.truth_state !== 'verified') errors.push(`Chief public_claims[${index}] must be verified`);
    if (claim.public_safe !== true) errors.push(`Chief public_claims[${index}] must be public_safe`);
    if (claim.evidence_ref !== internalEvidence.ref) errors.push(`Chief public_claims[${index}] evidence ref must match internal evidence`);
    if (!claim.evidence_scope || !internalEvidence.proves.includes(claim.evidence_scope)) errors.push(`Chief public_claims[${index}] evidence scope is not covered`);
    errors.push(...scanPublicText(claim.text, `Chief public_claims[${index}]`));
  });

  if (!Number.isNaN(issued.ms) && !Number.isNaN(expires.ms)) {
    if (expires.ms <= issued.ms) errors.push('Chief proposal expiry must be after issuance');
    if (expires.ms - issued.ms > MAX_CHIEF_PROPOSAL_TTL_MS) errors.push('Chief proposal lifetime may not exceed 72 hours');
  }
  if (!Number.isNaN(observed.ms) && !Number.isNaN(issued.ms) && observed.ms + MAX_CLOCK_SKEW_MS < issued.ms) errors.push('Chief proposal is future-dated relative to FCR observation');
  if (!Number.isNaN(observed.ms) && !Number.isNaN(expires.ms) && observed.ms >= expires.ms) errors.push('Chief proposal is stale at FCR ingestion');
  if (!Number.isNaN(currentObserved.ms) && !Number.isNaN(evaluated.ms)) {
    if (currentObserved.ms > evaluated.ms + MAX_CLOCK_SKEW_MS) errors.push('Chief Current You observation is future-dated');
    if (evaluated.ms - currentObserved.ms > MAX_INTENT_AGE_MS) errors.push('Chief Current You observation was stale when proposal was created');
  }

  if (errors.length > 0) reject(errors);
  return {
    sourceRepo,
    sourceCommitSha,
    currentIntentId: current.intent_id,
    currentIntentVersion: current.intent_version,
    currentObservedAt: current.observed_at,
    observedAt: observed.value,
    issuedAt: issued.value,
    expiresAt: expires.value,
    internalEvidence,
  };
}

function buildCanonicalFirstPartyDraft(input = {}) {
  const proposal = input.chief_proposal && typeof input.chief_proposal === 'object' ? input.chief_proposal : {};
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
    current_you_intent_version: verifiedChief.currentIntentVersion,
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
      internal_evidence_ref: verifiedChief.internalEvidence.ref,
      internal_evidence_digest: verifiedChief.internalEvidence.digest,
      chief_issued_at: verifiedChief.issuedAt,
      chief_observed_at: verifiedChief.observedAt,
      current_you_observed_at: verifiedChief.currentObservedAt,
      evidence_expires_at: verifiedChief.expiresAt,
    },
    authority: {
      state: 'draft',
      current_you_intent_id: verifiedChief.currentIntentId,
      current_you_intent_version: verifiedChief.currentIntentVersion,
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
      learning_authority: 'advisory_only',
      publication_authority_change_allowed: false,
      kpi_contract: FIRST_PARTY_CONTENT_KPI_CONTRACT,
    },
  };
}

function approveFirstPartyDraft(draft = {}, approval = {}) {
  const errors = [];
  const approvalId = asTrimmedString(approval.approval_id, 240);
  const approvedAt = parseIso(approval.approved_at, 'approved_at', errors);
  const expiresAt = parseIso(approval.expires_at, 'expires_at', errors);
  const current = validateCurrentYouSnapshot({
    authenticated: approval.authenticated_current_you,
    intent_id: approval.current_you_intent_id,
    intent_version: approval.current_you_intent_version,
    observed_at: approval.current_you_observed_at,
  }, approval.approved_at, {
    intent_id: draft.authority?.current_you_intent_id,
    intent_version: draft.authority?.current_you_intent_version,
  });

  if (draft.kind !== 'fcr/first-party-founder-content') errors.push('draft kind is invalid');
  if (!HASH.test(asTrimmedString(draft.content_hash, 64))) errors.push('draft content_hash is invalid');
  if (asTrimmedString(approval.content_hash, 64) !== draft.content_hash) errors.push('approval content_hash must match exact draft');
  if (!approvalId) errors.push('approval_id is required');
  if (!Number.isNaN(approvedAt.ms) && !Number.isNaN(expiresAt.ms)) {
    if (!(expiresAt.ms > approvedAt.ms)) errors.push('approval must expire after approval time');
    if (expiresAt.ms - approvedAt.ms > MAX_APPROVAL_TTL_MS) errors.push('approval validity may not exceed 24 hours');
  }
  const evidenceExpiryMs = Date.parse(draft.private_lineage?.evidence_expires_at || '');
  if (!Number.isNaN(approvedAt.ms) && !Number.isNaN(evidenceExpiryMs) && approvedAt.ms >= evidenceExpiryMs) errors.push('source evidence is stale before approval');
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
      approved_current_you_intent_id: current.intent_id,
      approved_current_you_intent_version: current.intent_version,
      approved_current_you_observed_at: current.observed_at,
      approved_at: approvedAt.value,
      expires_at: expiresAt.value,
    },
  };
}

function buildProviderHandoff(approvedDraft = {}, input = {}) {
  const provider = asTrimmedString(input.provider, 80).toLowerCase();
  const errors = [];
  if (!PROVIDERS.has(provider)) errors.push('provider is not supported');
  if (approvedDraft.authority?.founder_approved !== true) errors.push('founder approval is required');
  if (approvedDraft.authority?.provider_handoff_allowed !== true) errors.push('provider handoff is not allowed');
  if (approvedDraft.authority?.approved_content_hash !== approvedDraft.content_hash) errors.push('approved content hash no longer matches draft');
  if (input.approval_revoked === true) errors.push('founder approval has been revoked');

  const current = validateCurrentYouSnapshot({
    authenticated: input.current_you_verified,
    intent_id: input.current_you_intent_id,
    intent_version: input.current_you_intent_version,
    observed_at: input.current_you_observed_at,
  }, input.now, {
    intent_id: approvedDraft.authority?.approved_current_you_intent_id,
    intent_version: approvedDraft.authority?.approved_current_you_intent_version,
    min_observed_at: approvedDraft.authority?.approved_current_you_observed_at,
  });
  const nowMs = Date.parse(current.now);
  const approvalExpiryMs = Date.parse(approvedDraft.authority?.expires_at || '');
  if (!Number.isNaN(nowMs) && !Number.isNaN(approvalExpiryMs) && nowMs >= approvalExpiryMs) errors.push('founder approval is expired');
  const evidenceExpiryMs = Date.parse(approvedDraft.private_lineage?.evidence_expires_at || '');
  if (!Number.isNaN(nowMs) && !Number.isNaN(evidenceExpiryMs) && nowMs >= evidenceExpiryMs) errors.push('source evidence is stale at provider handoff');
  if (errors.length > 0) reject(errors);

  const handoff = {
    version: 1,
    kind: 'fcr/provider-content-handoff',
    provider,
    content_id: approvedDraft.content_id,
    content_hash: approvedDraft.content_hash,
    public_payload: clonePublicPayload(approvedDraft.public_payload),
    authority: {
      approval_id: approvedDraft.authority.approval_id,
      approved_content_hash: approvedDraft.content_hash,
      current_you_intent_id: current.intent_id,
      current_you_intent_version: current.intent_version,
      current_you_observed_at: current.observed_at,
      current_you_reverified: true,
      source_evidence_reverified_fresh: true,
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

  if (provider === 'buffer') {
    const destinationUrl = asTrimmedString(input.destination_url, 1000);
    if (!HTTPS_URL.test(destinationUrl)) reject(['destination_url must be HTTPS for Buffer handoff']);
    handoff.downstream_adapter = buildEditorialDraftEnvelope({
      content_id: approvedDraft.content_id,
      source_repo: approvedDraft.private_lineage.source_repo,
      source_commit_sha: approvedDraft.private_lineage.source_commit_sha,
      proof_url: `https://github.com/${approvedDraft.private_lineage.source_repo}/commit/${approvedDraft.private_lineage.source_commit_sha}`,
      campaign_slug: approvedDraft.campaign_slug,
      platform: approvedDraft.public_payload.platform,
      destination_url: destinationUrl,
      text: approvedDraft.public_payload.draft_text,
    });
  }

  return handoff;
}

function buildContentOutcomeObservation(input = {}) {
  const contentHash = asTrimmedString(input.content_hash, 64);
  const errors = [];
  if (!HASH.test(contentHash)) errors.push('content_hash must be SHA-256');
  for (const forbidden of ['raw_post_text', 'dm_text', 'comment_text', 'provider_payload']) {
    if (Object.prototype.hasOwnProperty.call(input, forbidden)) errors.push(`${forbidden} is forbidden in analytics observations`);
  }

  const metrics = {};
  const metric_states = {};
  for (const key of METRIC_KEYS) {
    const value = input.metrics?.[key];
    if (value === undefined || value === null) {
      metrics[key] = null;
      metric_states[key] = 'UNKNOWN';
      continue;
    }
    if (!Number.isInteger(value) || value < 0) errors.push(`metrics.${key} must be a non-negative integer or null`);
    else {
      metrics[key] = value;
      metric_states[key] = 'observed';
    }
  }
  if (errors.length > 0) reject(errors);

  return {
    version: 1,
    kind: 'fcr/founder-content-outcome',
    content_hash: contentHash,
    platform: asTrimmedString(input.platform, 80).toLowerCase() || 'linkedin',
    metrics,
    metric_states,
    authority: {
      observation_only: true,
      learning_authority: 'advisory_only',
      can_authorize_publish: false,
      can_change_content: false,
      can_increase_authority: false,
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
  computeChiefProposalHash,
  FIRST_PARTY_CONTENT_KPI_CONTRACT,
};
