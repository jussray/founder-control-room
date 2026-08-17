'use strict';

const { createHash } = require('node:crypto');

const HASH = /^[0-9a-f]{64}$/i;
const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
const TEMPORAL_CLAIM_CLASSES = new Set([
  'historical_version',
  'current_repo_state',
  'current_runtime',
  'metric',
]);
const MAX_APPROVAL_TTL_MS = 60 * 60 * 1000;
const MAX_CURRENT_YOU_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const REQUIRED_SAUCE_GUARDS = [
  'private_implementation_removed',
  'secret_material_removed',
  'raw_diff_removed',
  'private_metrics_removed',
  'unreleased_roadmap_removed',
  'customer_private_data_removed',
  'security_sensitive_details_removed',
  'public_claims_only',
];

function asString(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asStringList(value, maxItemLength = 500) {
  return Array.isArray(value)
    ? value.map((item) => asString(item, maxItemLength)).filter(Boolean)
    : [];
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function reject(errors) {
  const error = new Error(`FOUNDER_CONTENT_AUTHORIZATION_REJECTED: ${errors.join('; ')}`);
  error.code = 'FOUNDER_CONTENT_AUTHORIZATION_REJECTED';
  error.details = errors;
  throw error;
}

function parseTime(value, label) {
  const raw = asString(value, 64);
  const ms = Date.parse(raw);
  if (!raw || Number.isNaN(ms)) reject([`${label} must be an RFC3339 timestamp`]);
  return { raw: new Date(ms).toISOString(), ms };
}

function canonicalChiefIdentity(proposal = {}) {
  const publicClaims = Array.isArray(proposal.public_payload?.public_claims)
    ? proposal.public_payload.public_claims.map((claim) => ({
        claim_id: asString(claim?.claim_id, 80).toLowerCase(),
        text: asString(claim?.text, 500),
        truth_state: asString(claim?.truth_state, 40).toLowerCase(),
        public_safe: claim?.public_safe === true,
        evidence_ref: asString(claim?.evidence_ref, 1000),
        evidence_scope: asString(claim?.evidence_scope, 200),
        temporal_class: asString(claim?.temporal_class, 40).toLowerCase() || null,
        temporal_version: asString(claim?.temporal_version, 40).toLowerCase() || null,
      }))
    : [];

  const publicPayload = {
    platform: asString(proposal.public_payload?.platform, 80).toLowerCase(),
    story_type: asString(proposal.public_payload?.story_type, 80).toLowerCase(),
    draft_text: asString(proposal.public_payload?.draft_text, 3000),
    public_claims: publicClaims,
    proof_link: asString(proposal.public_payload?.proof_link, 1000) || null,
    proof_link_policy: asString(proposal.public_payload?.proof_link_policy, 80),
  };

  const internalEvidence = {
    verified: proposal.internal_evidence?.verified === true,
    ref: asString(proposal.internal_evidence?.ref, 1000),
    kind: asString(proposal.internal_evidence?.kind, 120),
    digest: asString(proposal.internal_evidence?.digest, 64).toLowerCase(),
    not_for_publication: proposal.internal_evidence?.not_for_publication === true,
    source_repo: asString(proposal.internal_evidence?.source_repo, 240),
    source_commit_sha: asString(proposal.internal_evidence?.source_commit_sha, 40).toLowerCase(),
    proves: asStringList(proposal.internal_evidence?.proves, 200),
    does_not_prove: asStringList(proposal.internal_evidence?.does_not_prove, 200),
  };

  const sauceGuard = {
    scanner_version: asString(proposal.sauce_guard?.scanner_version, 80),
    private_implementation_removed: proposal.sauce_guard?.private_implementation_removed === true,
    secret_material_removed: proposal.sauce_guard?.secret_material_removed === true,
    raw_diff_removed: proposal.sauce_guard?.raw_diff_removed === true,
    private_metrics_removed: proposal.sauce_guard?.private_metrics_removed === true,
    unreleased_roadmap_removed: proposal.sauce_guard?.unreleased_roadmap_removed === true,
    customer_private_data_removed: proposal.sauce_guard?.customer_private_data_removed === true,
    security_sensitive_details_removed: proposal.sauce_guard?.security_sensitive_details_removed === true,
    public_claims_only: proposal.sauce_guard?.public_claims_only === true,
    independent_scan_passed: proposal.sauce_guard?.independent_scan_passed === true,
    blocked_categories: asStringList(proposal.sauce_guard?.blocked_categories, 120),
    withheld_categories: asStringList(proposal.sauce_guard?.withheld_categories, 120),
  };

  return {
    version: 1,
    source: {
      repo: asString(proposal.source?.repo, 240),
      commit_sha: asString(proposal.source?.commit_sha, 40).toLowerCase(),
    },
    current_you: {
      intent_id: asString(proposal.authority?.current_you_intent_id, 200),
      intent_version: proposal.authority?.current_you_intent_version,
      observed_at: asString(proposal.authority?.current_you_observed_at, 64),
      evaluated_at: asString(proposal.authority?.proposal_evaluated_at, 64),
    },
    freshness: {
      issued_at: asString(proposal.freshness?.issued_at, 64),
      expires_at: asString(proposal.freshness?.expires_at, 64),
    },
    public_payload: publicPayload,
    internal_evidence: internalEvidence,
    sauce_guard: sauceGuard,
  };
}

function validateProposal(proposal = {}) {
  const errors = [];
  const proposalHash = asString(proposal.proposal_hash, 64).toLowerCase();
  const identity = canonicalChiefIdentity(proposal);
  const sourceRepo = identity.source.repo;
  const sourceCommitSha = identity.source.commit_sha;
  const platform = identity.public_payload.platform;
  const draftText = identity.public_payload.draft_text;

  if (proposal.version !== 1) errors.push('proposal.version must be 1');
  if (proposal.kind !== 'chief-ai/founder-content-proposal') errors.push('proposal.kind must be chief-ai/founder-content-proposal');
  if (!HASH.test(proposalHash)) errors.push('proposal.proposal_hash must be sha256');
  if (!/^jussray\/[A-Za-z0-9._-]+$/.test(sourceRepo)) errors.push('proposal source repo must be owned');
  if (!EXACT_COMMIT_SHA.test(sourceCommitSha)) errors.push('proposal source commit must be exact');
  if (!platform) errors.push('proposal public platform is required');
  if (!draftText) errors.push('proposal public draft text is required');
  if (!identity.current_you.intent_id) errors.push('proposal Current You intent id is required');
  if (!Number.isInteger(identity.current_you.intent_version) || identity.current_you.intent_version < 1) {
    errors.push('proposal Current You intent version must be a positive integer');
  }
  if (identity.public_payload.proof_link_policy !== 'editorial_optional') {
    errors.push('proposal proof link policy must remain editorial_optional');
  }
  if (identity.public_payload.public_claims.length === 0) errors.push('proposal must contain public claims');

  if (proposal.authority?.proposal_only !== true) errors.push('Chief proposal must remain proposal_only');
  if (proposal.authority?.publish_authorized !== false) errors.push('Chief may not pre-authorize publication');
  if (proposal.authority?.current_you_source !== 'current_authenticated_founder') {
    errors.push('Chief Current You source must be current_authenticated_founder');
  }
  if (proposal.authority?.future_you_advisory_only !== true) errors.push('FutureYou must remain advisory');
  if (proposal.authority?.historical_content_intent_authoritative !== false) errors.push('historical content intent may not be authoritative');
  if (proposal.authority?.analytics_can_authorize_publish !== false) errors.push('analytics may not authorize publication');
  if (proposal.authority?.external_feedback_trusted_for_authority !== false) {
    errors.push('external feedback may not be trusted for publication authority');
  }

  const evidence = identity.internal_evidence;
  if (evidence.verified !== true || evidence.not_for_publication !== true) {
    errors.push('verified private internal evidence is required');
  }
  if (!evidence.ref || !evidence.kind) errors.push('internal evidence ref and kind are required');
  if (!HASH.test(evidence.digest)) errors.push('internal evidence digest must be sha256');
  if (evidence.source_repo !== sourceRepo || evidence.source_commit_sha !== sourceCommitSha) {
    errors.push('internal evidence must bind the exact proposal source repo and commit');
  }
  if (evidence.proves.length === 0) errors.push('internal evidence must declare what it proves');

  for (const claim of identity.public_payload.public_claims) {
    if (!claim.claim_id || !claim.text || claim.truth_state !== 'verified' || claim.public_safe !== true) {
      errors.push('all public product-progress claims must be identified, verified, and public-safe');
      break;
    }
    if (claim.evidence_ref !== evidence.ref) {
      errors.push('every public claim must bind the exact internal evidence ref');
      break;
    }
    if (!claim.evidence_scope || !evidence.proves.includes(claim.evidence_scope)) {
      errors.push('every public claim evidence_scope must be explicitly covered by internal evidence');
      break;
    }
    if (claim.temporal_class && !TEMPORAL_CLAIM_CLASSES.has(claim.temporal_class)) {
      errors.push('public claim temporal_class is invalid');
      break;
    }
    if (
      (claim.temporal_class === 'historical_version' || claim.temporal_class === 'current_repo_state') &&
      claim.temporal_version !== sourceCommitSha
    ) {
      errors.push('version-bound public claim temporal_version must equal the exact source commit');
      break;
    }
    if (
      (claim.temporal_class === 'current_runtime' || claim.temporal_class === 'metric') &&
      claim.temporal_version !== null
    ) {
      errors.push('runtime or metric public claims may not carry a repository temporal_version');
      break;
    }
  }

  for (const key of REQUIRED_SAUCE_GUARDS) {
    if (identity.sauce_guard[key] !== true) errors.push(`proposal sauce_guard.${key} must be true`);
  }
  if (identity.sauce_guard.scanner_version !== 'sauce-guard-v1') errors.push('proposal sauce scanner version must be sauce-guard-v1');
  if (identity.sauce_guard.independent_scan_passed !== true) errors.push('proposal independent sauce scan must pass');
  if (identity.sauce_guard.blocked_categories.length !== 0) errors.push('proposal contains blocked disclosure categories');

  const issued = parseTime(identity.freshness.issued_at, 'proposal.freshness.issued_at');
  const expires = parseTime(identity.freshness.expires_at, 'proposal.freshness.expires_at');
  const observed = parseTime(identity.current_you.observed_at, 'proposal.current_you.observed_at');
  const evaluated = parseTime(identity.current_you.evaluated_at, 'proposal.current_you.evaluated_at');
  if (expires.ms <= issued.ms) errors.push('proposal expiry must follow issuance');
  if (observed.ms > evaluated.ms + MAX_CLOCK_SKEW_MS) errors.push('proposal Current You observation is future-dated');
  if (evaluated.ms - observed.ms > MAX_CURRENT_YOU_AGE_MS) errors.push('proposal Current You observation was stale at evaluation');

  if (errors.length === 0 && hash(identity) !== proposalHash) {
    errors.push('proposal_hash does not match canonical Chief v1 proposal identity');
  }
  if (errors.length > 0) reject(errors);

  return {
    proposalHash,
    publicPayloadHash: hash(identity.public_payload),
    sourceRepo,
    sourceCommitSha,
    platform,
    draftText,
    currentYou: identity.current_you,
    issued,
    expires,
  };
}

function validateCurrentApproval(approval = {}, proposalIdentity, nowMs) {
  const errors = [];
  const approvalId = asString(approval.approval_id, 120).toLowerCase();
  const boundProposalHash = asString(approval.proposal_hash, 64).toLowerCase();
  const boundPayloadHash = asString(approval.public_payload_hash, 64).toLowerCase();
  const currentYou = approval.current_you && typeof approval.current_you === 'object' ? approval.current_you : {};
  const currentIntentId = asString(currentYou.intent_id, 200);
  const currentIntentVersion = currentYou.intent_version;
  const currentObserved = parseTime(currentYou.observed_at, 'approval.current_you.observed_at');
  const channels = Array.isArray(approval.channels)
    ? [...new Set(approval.channels.map((value) => asString(value, 80).toLowerCase()).filter(Boolean))].sort()
    : [];

  if (!IDENTIFIER.test(approvalId)) errors.push('approval.approval_id is invalid');
  if (boundProposalHash !== proposalIdentity.proposalHash) errors.push('approval proposal_hash does not match exact Chief proposal');
  if (boundPayloadHash !== proposalIdentity.publicPayloadHash) errors.push('approval public_payload_hash does not match exact public copy');
  if (currentYou.authenticated !== true) errors.push('approval current_you.authenticated must be true');
  if (currentYou.source !== 'current_authenticated_founder') errors.push('approval current_you.source must be current_authenticated_founder');
  if (!currentIntentId) errors.push('approval current_you.intent_id is required');
  if (!Number.isInteger(currentIntentVersion) || currentIntentVersion < 1) {
    errors.push('approval current_you.intent_version must be a positive integer');
  }
  if (currentYou.supersedes_stale_content_intent !== true) errors.push('approval must explicitly supersede stale content intent');
  if (currentIntentVersion < proposalIdentity.currentYou.intent_version) {
    errors.push('approval Current You version may not be older than the Chief proposal intent version');
  }
  if (currentObserved.ms < Date.parse(proposalIdentity.currentYou.observed_at)) {
    errors.push('approval Current You observation may not predate the Chief proposal Current You observation');
  }
  if (currentObserved.ms > nowMs + MAX_CLOCK_SKEW_MS) errors.push('approval Current You observation is future-dated');
  if (nowMs - currentObserved.ms > MAX_CURRENT_YOU_AGE_MS) errors.push('approval Current You observation is stale');
  if (approval.revoked === true) errors.push('approval is revoked');
  if (approval.used === true) errors.push('approval has already been used');
  if (channels.length === 0) errors.push('approval.channels must bind at least one destination');
  if (!channels.includes(proposalIdentity.platform)) errors.push('approval.channels must include the proposal platform');

  const approved = parseTime(approval.approved_at, 'approval.approved_at');
  const expires = parseTime(approval.expires_at, 'approval.expires_at');
  if (expires.ms <= approved.ms) errors.push('approval expiry must follow approval time');
  if (expires.ms - approved.ms > MAX_APPROVAL_TTL_MS) errors.push('publication approval lifetime may not exceed 60 minutes');
  if (approved.ms < proposalIdentity.issued.ms) errors.push('approval may not predate proposal issuance');
  if (approved.ms >= proposalIdentity.expires.ms || expires.ms > proposalIdentity.expires.ms) {
    errors.push('approval must remain inside proposal freshness window');
  }
  if (nowMs < approved.ms) errors.push('approval is future-dated');
  if (nowMs >= expires.ms) errors.push('approval is stale');
  if (nowMs >= proposalIdentity.expires.ms) errors.push('Chief proposal is stale');

  if (errors.length > 0) reject(errors);

  return {
    approvalId,
    currentIntentId,
    currentIntentVersion,
    currentObserved,
    channels,
    approved,
    expires,
  };
}

function authorizeFounderContentPublication({ proposal, approval, now } = {}) {
  const nowTime = parseTime(now, 'now');
  const proposalIdentity = validateProposal(proposal);
  const currentApproval = validateCurrentApproval(approval, proposalIdentity, nowTime.ms);

  const authorizationIdentity = {
    version: 1,
    approval_id: currentApproval.approvalId,
    proposal_hash: proposalIdentity.proposalHash,
    public_payload_hash: proposalIdentity.publicPayloadHash,
    current_you_intent_id: currentApproval.currentIntentId,
    current_you_intent_version: currentApproval.currentIntentVersion,
    current_you_observed_at: currentApproval.currentObserved.raw,
    channels: currentApproval.channels,
    expires_at: currentApproval.expires.raw,
  };

  return Object.freeze({
    version: 1,
    kind: 'fcr/founder-content-publication-authorization',
    state: 'authorized-for-scheduled-review',
    proposal_hash: proposalIdentity.proposalHash,
    public_payload_hash: proposalIdentity.publicPayloadHash,
    source: Object.freeze({ repo: proposalIdentity.sourceRepo, commit_sha: proposalIdentity.sourceCommitSha }),
    content: Object.freeze({ platform: proposalIdentity.platform, text: proposalIdentity.draftText }),
    current_you: Object.freeze({
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: currentApproval.currentIntentId,
      intent_version: currentApproval.currentIntentVersion,
      observed_at: currentApproval.currentObserved.raw,
    }),
    authority: Object.freeze({
      chief_can_publish: false,
      future_you_can_authorize: false,
      historical_intent_can_authorize: false,
      analytics_can_authorize: false,
      external_feedback_can_authorize: false,
      exact_current_you_approval_required: true,
      exact_copy_binding_required: true,
      exact_proof_binding_required: true,
      one_shot: true,
      share_now_allowed: false,
      execution_mode: 'schedule_review_window',
    }),
    channels: Object.freeze(currentApproval.channels),
    approved_at: currentApproval.approved.raw,
    expires_at: currentApproval.expires.raw,
    approval_id: currentApproval.approvalId,
    authorization_hash: hash(authorizationIdentity),
  });
}

module.exports = {
  authorizeFounderContentPublication,
  canonicalChiefIdentity,
  hashPublicPayload: hash,
};
