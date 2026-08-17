'use strict';

const { createHash } = require('node:crypto');

const HASH = /^[0-9a-f]{64}$/i;
const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
const MAX_APPROVAL_TTL_MS = 60 * 60 * 1000;
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
  const freshness = {
    issued_at: asString(proposal.freshness?.issued_at, 64),
    expires_at: asString(proposal.freshness?.expires_at, 64),
  };
  const internalEvidence = {
    ref: asString(proposal.internal_evidence?.ref, 1000),
    digest: asString(proposal.internal_evidence?.digest, 64).toLowerCase(),
    verified: proposal.internal_evidence?.verified === true,
    not_for_publication: proposal.internal_evidence?.not_for_publication === true,
  };
  const claimEvidence = Array.isArray(proposal.claim_evidence)
    ? proposal.claim_evidence.map((binding) => ({
        claim_id: asString(binding?.claim_id, 80).toLowerCase(),
        evidence_refs: Array.isArray(binding?.evidence_refs)
          ? binding.evidence_refs.map((ref) => asString(ref, 500))
          : [],
      }))
    : [];
  const publicClaims = Array.isArray(proposal.public_payload?.public_claims)
    ? proposal.public_payload.public_claims.map((claim) => ({
        claim_id: asString(claim?.claim_id, 80).toLowerCase(),
        text: asString(claim?.text, 500),
        truth_state: asString(claim?.truth_state, 40).toLowerCase(),
        public_safe: claim?.public_safe === true,
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
  const sauceGuard = Object.fromEntries(
    REQUIRED_SAUCE_GUARDS.map((key) => [key, proposal.sauce_guard?.[key] === true]),
  );

  return {
    version: 1,
    source_repo: asString(proposal.source?.repo, 240),
    source_commit_sha: asString(proposal.source?.commit_sha, 40).toLowerCase(),
    current_you_intent_id: asString(proposal.authority?.current_you_intent_id, 200),
    freshness,
    internal_evidence: internalEvidence,
    claim_evidence: claimEvidence,
    public_payload: publicPayload,
    sauce_guard: sauceGuard,
  };
}

function validateProposal(proposal = {}) {
  const errors = [];
  const proposalHash = asString(proposal.proposal_hash, 64).toLowerCase();
  const identity = canonicalChiefIdentity(proposal);
  const sourceRepo = identity.source_repo;
  const sourceCommitSha = identity.source_commit_sha;
  const platform = identity.public_payload.platform;
  const draftText = identity.public_payload.draft_text;

  if (proposal.kind !== 'chief-ai/founder-content-proposal') errors.push('proposal.kind must be chief-ai/founder-content-proposal');
  if (!HASH.test(proposalHash)) errors.push('proposal.proposal_hash must be sha256');
  if (!/^jussray\/[A-Za-z0-9._-]+$/.test(sourceRepo)) errors.push('proposal source repo must be owned');
  if (!EXACT_COMMIT_SHA.test(sourceCommitSha)) errors.push('proposal source commit must be exact');
  if (!platform) errors.push('proposal public platform is required');
  if (!draftText) errors.push('proposal public draft text is required');
  if (!identity.current_you_intent_id) errors.push('proposal current_you intent id is required');
  if (identity.public_payload.proof_link_policy !== 'editorial_optional') errors.push('proposal proof link policy must remain editorial_optional');
  if (identity.public_payload.public_claims.length === 0) errors.push('proposal must contain public claims');
  if (identity.claim_evidence.length !== identity.public_payload.public_claims.length) {
    errors.push('every public claim must have one internal evidence binding');
  }
  for (const claim of identity.public_payload.public_claims) {
    if (claim.truth_state !== 'verified' || claim.public_safe !== true) {
      errors.push('all public product-progress claims must be verified and public-safe');
      break;
    }
  }
  for (const binding of identity.claim_evidence) {
    if (!binding.claim_id || binding.evidence_refs.length === 0) {
      errors.push('claim evidence bindings must be non-empty');
      break;
    }
  }
  for (const key of REQUIRED_SAUCE_GUARDS) {
    if (identity.sauce_guard[key] !== true) errors.push(`proposal sauce_guard.${key} must be true`);
  }
  if (proposal.authority?.proposal_only !== true) errors.push('Chief proposal must remain proposal_only');
  if (proposal.authority?.publish_authorized !== false) errors.push('Chief may not pre-authorize publication');
  if (proposal.authority?.future_you_advisory_only !== true) errors.push('FutureYou must remain advisory');
  if (proposal.authority?.historical_content_intent_authoritative !== false) errors.push('historical content intent may not be authoritative');
  if (proposal.authority?.analytics_can_authorize_publish !== false) errors.push('analytics may not authorize publication');
  if (proposal.authority?.external_feedback_trusted_for_authority !== false) {
    errors.push('external feedback may not be trusted for publication authority');
  }
  if (identity.internal_evidence.verified !== true || identity.internal_evidence.not_for_publication !== true) {
    errors.push('verified private internal evidence is required');
  }
  if (!HASH.test(identity.internal_evidence.digest)) errors.push('internal evidence digest must be sha256');

  const issued = parseTime(identity.freshness.issued_at, 'proposal.freshness.issued_at');
  const expires = parseTime(identity.freshness.expires_at, 'proposal.freshness.expires_at');
  if (expires.ms <= issued.ms) errors.push('proposal expiry must follow issuance');

  if (errors.length === 0 && hash(identity) !== proposalHash) {
    errors.push('proposal_hash does not match canonical Chief proposal identity');
  }
  if (errors.length > 0) reject(errors);

  const publicPayloadHash = hash(identity.public_payload);
  return {
    proposalHash,
    publicPayloadHash,
    sourceRepo,
    sourceCommitSha,
    platform,
    draftText,
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
  const channels = Array.isArray(approval.channels)
    ? [...new Set(approval.channels.map((value) => asString(value, 80).toLowerCase()).filter(Boolean))].sort()
    : [];

  if (!IDENTIFIER.test(approvalId)) errors.push('approval.approval_id is invalid');
  if (boundProposalHash !== proposalIdentity.proposalHash) errors.push('approval proposal_hash does not match exact Chief proposal');
  if (boundPayloadHash !== proposalIdentity.publicPayloadHash) errors.push('approval public_payload_hash does not match exact public copy');
  if (currentYou.authenticated !== true) errors.push('approval current_you.authenticated must be true');
  if (currentYou.source !== 'current_authenticated_founder') errors.push('approval current_you.source must be current_authenticated_founder');
  if (!currentIntentId) errors.push('approval current_you.intent_id is required');
  if (currentYou.supersedes_stale_content_intent !== true) errors.push('approval must explicitly supersede stale content intent');
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
    channels: currentApproval.channels,
    expires_at: currentApproval.expires.raw,
  };

  return Object.freeze({
    version: 1,
    kind: 'fcr/founder-content-publication-authorization',
    state: 'authorized-for-scheduled-review',
    proposal_hash: proposalIdentity.proposalHash,
    public_payload_hash: proposalIdentity.publicPayloadHash,
    source: Object.freeze({
      repo: proposalIdentity.sourceRepo,
      commit_sha: proposalIdentity.sourceCommitSha,
    }),
    content: Object.freeze({
      platform: proposalIdentity.platform,
      text: proposalIdentity.draftText,
    }),
    current_you: Object.freeze({
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: currentApproval.currentIntentId,
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
  hashPublicPayload: hash,
};
