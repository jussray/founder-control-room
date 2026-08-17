'use strict';

const assert = require('node:assert/strict');
const {
  authorizeFounderContentPublication,
  canonicalChiefIdentity,
  hashPublicPayload,
} = require('./founder-content-authorization-contract.cjs');

const SOURCE_SHA = 'b'.repeat(40);
const EVIDENCE_REF = `github:chief-ai-machine@${SOURCE_SHA}#quality-gate`;
const KNOWN_CHIEF_V1_HASH = '5dac904c02b00e5b5d79c11d6fd819a431df38094363b25bfcda64e52a1d66ce';

const sauceGuard = {
  scanner_version: 'sauce-guard-v1',
  private_implementation_removed: true,
  secret_material_removed: true,
  raw_diff_removed: true,
  private_metrics_removed: true,
  unreleased_roadmap_removed: true,
  customer_private_data_removed: true,
  security_sensitive_details_removed: true,
  public_claims_only: true,
  independent_scan_passed: true,
  blocked_categories: [],
  withheld_categories: ['private-implementation', 'private-prompt'],
};

function proposal(overrides = {}) {
  const publicPayload = overrides.public_payload || {
    platform: 'linkedin',
    story_type: 'founder-progress',
    draft_text: 'I changed how my product decides what it is allowed to say publicly.',
    public_claims: [
      {
        claim_id: 'proof-bound',
        text: 'Public progress claims are now bound to verified evidence.',
        truth_state: 'verified',
        public_safe: true,
        evidence_ref: EVIDENCE_REF,
        evidence_scope: 'founder-content-contract',
      },
    ],
    proof_link: null,
    proof_link_policy: 'editorial_optional',
  };

  return {
    version: 1,
    kind: 'chief-ai/founder-content-proposal',
    source: { repo: 'jussray/chief-ai-machine', commit_sha: SOURCE_SHA },
    freshness: {
      issued_at: '2026-08-17T07:45:00.000Z',
      expires_at: '2026-08-18T07:45:00.000Z',
    },
    public_payload: publicPayload,
    internal_evidence: {
      verified: true,
      ref: EVIDENCE_REF,
      kind: 'github-exact-head-contract',
      digest: 'c'.repeat(64),
      not_for_publication: true,
      source_repo: 'jussray/chief-ai-machine',
      source_commit_sha: SOURCE_SHA,
      proves: ['founder-content-contract'],
      does_not_prove: ['production-runtime', 'traction', 'revenue'],
    },
    sauce_guard: { ...sauceGuard },
    authority: {
      proposal_only: true,
      publish_authorized: false,
      current_you_source: 'current_authenticated_founder',
      current_you_intent_id: 'chief-content-intent-current',
      current_you_intent_version: 7,
      current_you_observed_at: '2026-08-17T07:40:00.000Z',
      proposal_evaluated_at: '2026-08-17T07:44:00.000Z',
      future_you_advisory_only: true,
      historical_content_intent_authoritative: false,
      analytics_feedback_authority: 'observation-only',
      analytics_can_authorize_publish: false,
      external_feedback_trusted_for_authority: false,
    },
    proposal_hash: KNOWN_CHIEF_V1_HASH,
    ...overrides,
    public_payload: publicPayload,
  };
}

function approval(proposed, overrides = {}) {
  return {
    approval_id: 'approval-2026-08-17-current',
    proposal_hash: proposed.proposal_hash,
    public_payload_hash: hashPublicPayload(proposed.public_payload),
    channels: ['linkedin'],
    approved_at: '2026-08-17T08:00:00.000Z',
    expires_at: '2026-08-17T08:30:00.000Z',
    revoked: false,
    used: false,
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: 'publish-intent-current-2026-08-17',
      intent_version: 8,
      observed_at: '2026-08-17T07:59:00.000Z',
      supersedes_stale_content_intent: true,
    },
    ...overrides,
  };
}

{
  const proposed = proposal();
  assert.equal(hashPublicPayload(canonicalChiefIdentity(proposed)), KNOWN_CHIEF_V1_HASH);

  const authorization = authorizeFounderContentPublication({
    proposal: proposed,
    approval: approval(proposed),
    now: '2026-08-17T08:05:00.000Z',
  });

  assert.equal(authorization.kind, 'fcr/founder-content-publication-authorization');
  assert.equal(authorization.state, 'authorized-for-scheduled-review');
  assert.equal(authorization.proposal_hash, KNOWN_CHIEF_V1_HASH);
  assert.equal(authorization.current_you.intent_version, 8);
  assert.equal(authorization.authority.chief_can_publish, false);
  assert.equal(authorization.authority.future_you_can_authorize, false);
  assert.equal(authorization.authority.analytics_can_authorize, false);
  assert.equal(authorization.authority.share_now_allowed, false);
  assert.equal(authorization.authority.execution_mode, 'schedule_review_window');
  assert.match(authorization.authorization_hash, /^[0-9a-f]{64}$/);
}

{
  const proposed = proposal();
  const approved = approval(proposed);
  const edited = proposal({
    proposal_hash: proposed.proposal_hash,
    public_payload: { ...proposed.public_payload, draft_text: `${proposed.public_payload.draft_text} Edited after approval.` },
  });

  assert.throws(
    () => authorizeFounderContentPublication({ proposal: edited, approval: approved, now: '2026-08-17T08:05:00.000Z' }),
    /proposal_hash does not match canonical Chief v1 proposal identity/,
  );
}

{
  const proposed = proposal();
  const approved = approval(proposed);
  const proofTampered = proposal({
    proposal_hash: proposed.proposal_hash,
    internal_evidence: { ...proposed.internal_evidence, digest: 'd'.repeat(64) },
  });

  assert.throws(
    () => authorizeFounderContentPublication({ proposal: proofTampered, approval: approved, now: '2026-08-17T08:05:00.000Z' }),
    /proposal_hash does not match canonical Chief v1 proposal identity/,
  );
}

{
  const proposed = proposal();
  const scopeTampered = proposal({
    proposal_hash: proposed.proposal_hash,
    public_payload: {
      ...proposed.public_payload,
      public_claims: [{ ...proposed.public_payload.public_claims[0], evidence_scope: 'production-runtime' }],
    },
  });

  assert.throws(
    () => authorizeFounderContentPublication({
      proposal: scopeTampered,
      approval: approval(proposed),
      now: '2026-08-17T08:05:00.000Z',
    }),
    /evidence_scope must be explicitly covered/,
  );
}

{
  const proposed = proposal();
  assert.throws(
    () => authorizeFounderContentPublication({
      proposal: proposed,
      approval: approval(proposed, {
        current_you: {
          authenticated: true,
          source: 'future_you',
          intent_id: 'predicted-intent',
          intent_version: 8,
          observed_at: '2026-08-17T07:59:00.000Z',
          supersedes_stale_content_intent: true,
        },
      }),
      now: '2026-08-17T08:05:00.000Z',
    }),
    /current_authenticated_founder/,
  );
}

{
  const proposed = proposal();
  assert.throws(
    () => authorizeFounderContentPublication({
      proposal: proposed,
      approval: approval(proposed, {
        current_you: {
          ...approval(proposed).current_you,
          intent_version: 6,
        },
      }),
      now: '2026-08-17T08:05:00.000Z',
    }),
    /may not be older than the Chief proposal intent version/,
  );
}

{
  const proposed = proposal();
  assert.throws(
    () => authorizeFounderContentPublication({
      proposal: proposed,
      approval: approval(proposed, {
        current_you: {
          ...approval(proposed).current_you,
          observed_at: '2026-08-17T07:30:00.000Z',
        },
      }),
      now: '2026-08-17T08:05:00.000Z',
    }),
    /may not predate the Chief proposal Current You observation/,
  );
}

{
  const proposed = proposal();
  for (const mutation of [{ revoked: true }, { used: true }]) {
    assert.throws(
      () => authorizeFounderContentPublication({
        proposal: proposed,
        approval: approval(proposed, mutation),
        now: '2026-08-17T08:05:00.000Z',
      }),
      /revoked|already been used/,
    );
  }
}

{
  const proposed = proposal();
  assert.throws(
    () => authorizeFounderContentPublication({
      proposal: proposed,
      approval: approval(proposed),
      now: '2026-08-17T08:31:00.000Z',
    }),
    /approval is stale/,
  );
}

{
  const proposed = proposal();
  assert.throws(
    () => authorizeFounderContentPublication({
      proposal: proposed,
      approval: approval(proposed, {
        approved_at: '2026-08-17T08:20:00.000Z',
        expires_at: '2026-08-17T09:30:00.000Z',
      }),
      now: '2026-08-17T08:21:00.000Z',
    }),
    /may not exceed 60 minutes/,
  );
}

{
  const proposed = proposal();
  assert.throws(
    () => authorizeFounderContentPublication({
      proposal: proposed,
      approval: approval(proposed, { channels: ['facebook'] }),
      now: '2026-08-17T08:05:00.000Z',
    }),
    /must include the proposal platform/,
  );
}

{
  const proposed = proposal();
  const unsafeAuthority = proposal({
    proposal_hash: proposed.proposal_hash,
    authority: { ...proposed.authority, analytics_can_authorize_publish: true },
  });

  assert.throws(
    () => authorizeFounderContentPublication({
      proposal: unsafeAuthority,
      approval: approval(proposed),
      now: '2026-08-17T08:05:00.000Z',
    }),
    /analytics may not authorize publication/,
  );
}

{
  const proposed = proposal();
  const unsafeSauce = proposal({
    proposal_hash: proposed.proposal_hash,
    sauce_guard: { ...proposed.sauce_guard, blocked_categories: ['private-prompt'] },
  });

  assert.throws(
    () => authorizeFounderContentPublication({
      proposal: unsafeSauce,
      approval: approval(proposed),
      now: '2026-08-17T08:05:00.000Z',
    }),
    /blocked disclosure categories/,
  );
}

console.log('founder content authorization contract: exact Chief v1 receipt, Current You supersession, proof/copy binding, replay defense, and schedule-review-only authority verified.');
