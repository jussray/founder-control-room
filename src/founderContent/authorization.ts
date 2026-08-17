import { createHash } from 'node:crypto';

const SHA256 = /^[0-9a-f]{64}$/i;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
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
] as const;

type JsonRecord = Record<string, unknown>;

export interface FounderContentAuthorization {
  version: 1;
  kind: 'fcr/founder-content-publication-authorization';
  state: 'authorized-for-scheduled-review';
  proposal_hash: string;
  public_payload_hash: string;
  source: { repo: string; commit_sha: string };
  content: { platform: string; text: string };
  current_you: {
    authenticated: true;
    source: 'current_authenticated_founder';
    intent_id: string;
    intent_version: number;
    observed_at: string;
  };
  authority: {
    chief_can_publish: false;
    future_you_can_authorize: false;
    historical_intent_can_authorize: false;
    analytics_can_authorize: false;
    external_feedback_can_authorize: false;
    exact_current_you_approval_required: true;
    exact_copy_binding_required: true;
    exact_proof_binding_required: true;
    one_shot: true;
    share_now_allowed: false;
    execution_mode: 'schedule_review_window';
  };
  channels: string[];
  approved_at: string;
  expires_at: string;
  approval_id: string;
  authorization_hash: string;
}

export class FounderContentAuthorizationError extends Error {
  readonly code = 'FOUNDER_CONTENT_AUTHORIZATION_REJECTED';

  constructor(readonly details: string[]) {
    super(`FOUNDER_CONTENT_AUTHORIZATION_REJECTED: ${details.join('; ')}`);
    this.name = 'FounderContentAuthorizationError';
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function stringList(value: unknown, max = 500): string[] {
  return Array.isArray(value)
    ? value.map(item => text(item, max)).filter(Boolean)
    : [];
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function reject(errors: string[]): never {
  throw new FounderContentAuthorizationError(errors);
}

function time(value: unknown, label: string): { raw: string; ms: number } {
  const raw = text(value, 64);
  const ms = Date.parse(raw);
  if (!raw || Number.isNaN(ms)) reject([`${label} must be an RFC3339 timestamp`]);
  return { raw: new Date(ms).toISOString(), ms };
}

export function canonicalChiefFounderContentIdentity(proposalValue: unknown) {
  const proposal = record(proposalValue);
  const publicPayloadRaw = record(proposal.public_payload);
  const evidenceRaw = record(proposal.internal_evidence);
  const sauceRaw = record(proposal.sauce_guard);
  const authorityRaw = record(proposal.authority);
  const sourceRaw = record(proposal.source);
  const freshnessRaw = record(proposal.freshness);
  const claims = Array.isArray(publicPayloadRaw.public_claims)
    ? publicPayloadRaw.public_claims.map((claimValue) => {
        const claim = record(claimValue);
        return {
          claim_id: text(claim.claim_id, 80).toLowerCase(),
          text: text(claim.text, 500),
          truth_state: text(claim.truth_state, 40).toLowerCase(),
          public_safe: claim.public_safe === true,
          evidence_ref: text(claim.evidence_ref, 1000),
          evidence_scope: text(claim.evidence_scope, 200),
        };
      })
    : [];

  return {
    version: 1,
    source: {
      repo: text(sourceRaw.repo, 240),
      commit_sha: text(sourceRaw.commit_sha, 40).toLowerCase(),
    },
    current_you: {
      intent_id: text(authorityRaw.current_you_intent_id, 200),
      intent_version: authorityRaw.current_you_intent_version,
      observed_at: text(authorityRaw.current_you_observed_at, 64),
      evaluated_at: text(authorityRaw.proposal_evaluated_at, 64),
    },
    freshness: {
      issued_at: text(freshnessRaw.issued_at, 64),
      expires_at: text(freshnessRaw.expires_at, 64),
    },
    public_payload: {
      platform: text(publicPayloadRaw.platform, 80).toLowerCase(),
      story_type: text(publicPayloadRaw.story_type, 80).toLowerCase(),
      draft_text: text(publicPayloadRaw.draft_text, 3000),
      public_claims: claims,
      proof_link: text(publicPayloadRaw.proof_link, 1000) || null,
      proof_link_policy: text(publicPayloadRaw.proof_link_policy, 80),
    },
    internal_evidence: {
      verified: evidenceRaw.verified === true,
      ref: text(evidenceRaw.ref, 1000),
      kind: text(evidenceRaw.kind, 120),
      digest: text(evidenceRaw.digest, 64).toLowerCase(),
      not_for_publication: evidenceRaw.not_for_publication === true,
      source_repo: text(evidenceRaw.source_repo, 240),
      source_commit_sha: text(evidenceRaw.source_commit_sha, 40).toLowerCase(),
      proves: stringList(evidenceRaw.proves, 200),
      does_not_prove: stringList(evidenceRaw.does_not_prove, 200),
    },
    sauce_guard: {
      scanner_version: text(sauceRaw.scanner_version, 80),
      private_implementation_removed: sauceRaw.private_implementation_removed === true,
      secret_material_removed: sauceRaw.secret_material_removed === true,
      raw_diff_removed: sauceRaw.raw_diff_removed === true,
      private_metrics_removed: sauceRaw.private_metrics_removed === true,
      unreleased_roadmap_removed: sauceRaw.unreleased_roadmap_removed === true,
      customer_private_data_removed: sauceRaw.customer_private_data_removed === true,
      security_sensitive_details_removed: sauceRaw.security_sensitive_details_removed === true,
      public_claims_only: sauceRaw.public_claims_only === true,
      independent_scan_passed: sauceRaw.independent_scan_passed === true,
      blocked_categories: stringList(sauceRaw.blocked_categories, 120),
      withheld_categories: stringList(sauceRaw.withheld_categories, 120),
    },
  };
}

function validateProposal(proposalValue: unknown) {
  const proposal = record(proposalValue);
  const authority = record(proposal.authority);
  const identity = canonicalChiefFounderContentIdentity(proposal);
  const errors: string[] = [];
  const proposalHash = text(proposal.proposal_hash, 64).toLowerCase();

  if (proposal.version !== 1) errors.push('proposal.version must be 1');
  if (proposal.kind !== 'chief-ai/founder-content-proposal') {
    errors.push('proposal.kind must be chief-ai/founder-content-proposal');
  }
  if (!SHA256.test(proposalHash)) errors.push('proposal.proposal_hash must be sha256');
  if (!OWNED_REPO.test(identity.source.repo)) errors.push('proposal source repo must be owned');
  if (!COMMIT_SHA.test(identity.source.commit_sha)) errors.push('proposal source commit must be exact');
  if (!identity.public_payload.platform) errors.push('proposal public platform is required');
  if (!identity.public_payload.draft_text) errors.push('proposal public draft text is required');
  if (!identity.current_you.intent_id) errors.push('proposal Current You intent id is required');
  if (!Number.isInteger(identity.current_you.intent_version) || Number(identity.current_you.intent_version) < 1) {
    errors.push('proposal Current You intent version must be a positive integer');
  }
  if (identity.public_payload.proof_link_policy !== 'editorial_optional') {
    errors.push('proposal proof link policy must remain editorial_optional');
  }
  if (identity.public_payload.public_claims.length === 0) errors.push('proposal must contain public claims');
  if (authority.proposal_only !== true || authority.publish_authorized !== false) {
    errors.push('Chief must remain proposal-only and unable to authorize publication');
  }
  if (authority.current_you_source !== 'current_authenticated_founder') {
    errors.push('Chief Current You source must be current_authenticated_founder');
  }
  if (authority.future_you_advisory_only !== true || authority.historical_content_intent_authoritative !== false) {
    errors.push('FutureYou/history must remain non-authoritative');
  }
  if (authority.analytics_can_authorize_publish !== false || authority.external_feedback_trusted_for_authority !== false) {
    errors.push('analytics/external feedback may not authorize publication');
  }

  const evidence = identity.internal_evidence;
  if (!evidence.verified || !evidence.not_for_publication) errors.push('verified private internal evidence is required');
  if (!evidence.ref || !evidence.kind || !SHA256.test(evidence.digest)) {
    errors.push('internal evidence ref, kind, and sha256 digest are required');
  }
  if (evidence.source_repo !== identity.source.repo || evidence.source_commit_sha !== identity.source.commit_sha) {
    errors.push('internal evidence must bind the exact proposal source repo and commit');
  }
  if (evidence.proves.length === 0) errors.push('internal evidence must declare what it proves');
  for (const claim of identity.public_payload.public_claims) {
    if (!claim.claim_id || !claim.text || claim.truth_state !== 'verified' || !claim.public_safe) {
      errors.push('all public claims must be identified, verified, and public-safe');
      break;
    }
    if (claim.evidence_ref !== evidence.ref || !claim.evidence_scope || !evidence.proves.includes(claim.evidence_scope)) {
      errors.push('every public claim must bind an evidence scope explicitly covered by internal evidence');
      break;
    }
  }
  for (const key of REQUIRED_SAUCE_GUARDS) {
    if (identity.sauce_guard[key] !== true) errors.push(`proposal sauce_guard.${key} must be true`);
  }
  if (identity.sauce_guard.scanner_version !== 'sauce-guard-v1' || !identity.sauce_guard.independent_scan_passed) {
    errors.push('proposal independent sauce scan must pass sauce-guard-v1');
  }
  if (identity.sauce_guard.blocked_categories.length !== 0) errors.push('proposal contains blocked disclosure categories');

  const issued = time(identity.freshness.issued_at, 'proposal.freshness.issued_at');
  const expires = time(identity.freshness.expires_at, 'proposal.freshness.expires_at');
  const observed = time(identity.current_you.observed_at, 'proposal.current_you.observed_at');
  const evaluated = time(identity.current_you.evaluated_at, 'proposal.current_you.evaluated_at');
  if (expires.ms <= issued.ms) errors.push('proposal expiry must follow issuance');
  if (observed.ms > evaluated.ms + MAX_CLOCK_SKEW_MS) errors.push('proposal Current You observation is future-dated');
  if (evaluated.ms - observed.ms > MAX_CURRENT_YOU_AGE_MS) errors.push('proposal Current You observation was stale at evaluation');
  if (errors.length === 0 && hashJson(identity) !== proposalHash) {
    errors.push('proposal_hash does not match canonical Chief v1 proposal identity');
  }
  if (errors.length) reject(errors);

  return {
    proposalHash,
    publicPayloadHash: hashJson(identity.public_payload),
    sourceRepo: identity.source.repo,
    sourceCommitSha: identity.source.commit_sha,
    platform: identity.public_payload.platform,
    draftText: identity.public_payload.draft_text,
    currentYou: {
      intentId: identity.current_you.intent_id,
      intentVersion: Number(identity.current_you.intent_version),
      observedAt: observed.raw,
    },
    issued,
    expires,
  };
}

export function authorizeFounderContentPublication(input: {
  proposal: unknown;
  approval: unknown;
  now?: Date;
}): FounderContentAuthorization {
  const proposal = validateProposal(input.proposal);
  const approval = record(input.approval);
  const currentYou = record(approval.current_you);
  const errors: string[] = [];
  const nowMs = (input.now ?? new Date()).getTime();
  const approvalId = text(approval.approval_id, 120).toLowerCase();
  const intentId = text(currentYou.intent_id, 200);
  const intentVersion = currentYou.intent_version;
  const observed = time(currentYou.observed_at, 'approval.current_you.observed_at');
  const approved = time(approval.approved_at, 'approval.approved_at');
  const expires = time(approval.expires_at, 'approval.expires_at');
  const channels = Array.isArray(approval.channels)
    ? [...new Set(approval.channels.map(value => text(value, 80).toLowerCase()).filter(Boolean))].sort()
    : [];

  if (!IDENTIFIER.test(approvalId)) errors.push('approval.approval_id is invalid');
  if (text(approval.proposal_hash, 64).toLowerCase() !== proposal.proposalHash) errors.push('approval proposal_hash does not match exact Chief proposal');
  if (text(approval.public_payload_hash, 64).toLowerCase() !== proposal.publicPayloadHash) errors.push('approval public_payload_hash does not match exact public copy');
  if (currentYou.authenticated !== true || currentYou.source !== 'current_authenticated_founder') {
    errors.push('approval must come from current_authenticated_founder');
  }
  if (!intentId || !Number.isInteger(intentVersion) || Number(intentVersion) < 1) errors.push('approval Current You identity/version is invalid');
  if (currentYou.supersedes_stale_content_intent !== true) errors.push('approval must explicitly supersede stale content intent');
  if (Number(intentVersion) < proposal.currentYou.intentVersion) errors.push('approval Current You version may not be older than proposal intent version');
  if (observed.ms < Date.parse(proposal.currentYou.observedAt)) errors.push('approval Current You observation may not predate proposal observation');
  if (observed.ms > nowMs + MAX_CLOCK_SKEW_MS || nowMs - observed.ms > MAX_CURRENT_YOU_AGE_MS) errors.push('approval Current You observation is not fresh');
  if (approval.revoked === true || approval.used === true) errors.push('approval is revoked or already used');
  if (!channels.includes(proposal.platform)) errors.push('approval channels must include the proposal platform');
  if (expires.ms <= approved.ms || expires.ms - approved.ms > MAX_APPROVAL_TTL_MS) errors.push('publication approval lifetime must be greater than zero and at most 60 minutes');
  if (approved.ms < proposal.issued.ms || approved.ms >= proposal.expires.ms || expires.ms > proposal.expires.ms) errors.push('approval must remain inside the proposal freshness window');
  if (nowMs < approved.ms || nowMs >= expires.ms || nowMs >= proposal.expires.ms) errors.push('approval/proposal is future-dated or stale');
  if (errors.length) reject(errors);

  const authorizationIdentity = {
    version: 1,
    approval_id: approvalId,
    proposal_hash: proposal.proposalHash,
    public_payload_hash: proposal.publicPayloadHash,
    current_you_intent_id: intentId,
    current_you_intent_version: Number(intentVersion),
    current_you_observed_at: observed.raw,
    channels,
    expires_at: expires.raw,
  };

  return {
    version: 1,
    kind: 'fcr/founder-content-publication-authorization',
    state: 'authorized-for-scheduled-review',
    proposal_hash: proposal.proposalHash,
    public_payload_hash: proposal.publicPayloadHash,
    source: { repo: proposal.sourceRepo, commit_sha: proposal.sourceCommitSha },
    content: { platform: proposal.platform, text: proposal.draftText },
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: intentId,
      intent_version: Number(intentVersion),
      observed_at: observed.raw,
    },
    authority: {
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
    },
    channels,
    approved_at: approved.raw,
    expires_at: expires.raw,
    approval_id: approvalId,
    authorization_hash: hashJson(authorizationIdentity),
  };
}

export function hashFounderContentJson(value: unknown): string {
  return hashJson(value);
}
