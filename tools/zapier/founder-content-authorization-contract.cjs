'use strict';

const { createHash } = require('node:crypto');

const HASH = /^[0-9a-f]{64}$/i;
const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
const MAX_APPROVAL_TTL_MS = 60 * 60 * 1000;

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

function validateProposal(proposal = {}) {
  const errors = [];
  const proposalHash = asString(proposal.proposal_hash, 64).toLowerCase();
  const sourceRepo = asString(proposal.source?.repo, 240);
  const sourceCommitSha = asString(proposal.source?.commit_sha, 40).toLowerCase();
  const platform = asString(proposal.public_payload?.platform, 80).toLowerCase();
  const draftText = asString(proposal.public_payload?.draft_text, 3000);

  if (proposal.kind !== 'chief-ai/founder-content-proposal') errors.push('proposal.kind must be chief-ai/founder-content-proposal');
  if (!HASH.test(proposalHash)) errors.push('proposal.proposal_hash must be sha256');
  if (!/^jussray\/[A-Za-z0-9._-]+$/.test(sourceRepo)) errors.push('proposal source repo must be owned');
  if (!EXACT_COMMIT_SHA.test(sourceCommitSha)) errors.push('proposal source commit must be exact');
  if (!platform) errors.push('proposal public platform is required');
  if (!draftText) errors.push('proposal public draft text is required');
  if (proposal.authority?.proposal_only !== true) errors.push('Chief proposal must remain proposal_only');
  if (proposal.authority?.publish_authorized !== false) errors.push('Chief may not pre-authorize publication');
  if (proposal.authority?.future_you_advisory_only !== true) errors.push('FutureYou must remain advisory');
  if (proposal.authority?.analytics_can_authorize_publish !== false) errors.push('analytics may not authorize publication');
  if (proposal.authority?.external_feedback_trusted_for_authority !== false) {
    errors.push('external feedback may not be trusted for publication authority');
  }
  if (proposal.internal_evidence?.verified !== true || proposal.internal_evidence?.not_for_publication !== true) {
    errors.push('verified private internal evidence is required');
  }
  if (!HASH.test(asString(proposal.internal_evidence?.digest, 64))) errors.push('internal evidence digest must be sha256');

  const issued = parseTime(proposal.freshness?.issued_at, 'proposal.freshness.issued_at');
  const expires = parseTime(proposal.freshness?.expires_at, 'proposal.freshness.expires_at');
  if (expires.ms <= issued.ms) errors.push('proposal expiry must follow issuance');

  if (errors.length > 0) reject(errors);

  const publicPayloadHash = hash(proposal.public_payload);
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
