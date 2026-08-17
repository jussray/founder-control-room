'use strict';

const assert = require('node:assert/strict');
const {
  authorizeFounderContentPublication,
  hashPublicPayload,
} = require('./founder-content-authorization-contract.cjs');

function proposal(overrides = {}) {
  const publicPayload = overrides.public_payload || {
    platform: 'linkedin',
    story_type: 'founder-progress',
    draft_text: 'I changed how my product decides what it is allowed to say publicly.',
    public_claims: [
      { claim_id: 'proof-bound', text: 'Public progress claims are now bound to verified evidence.', truth_state: 'verified', public_safe: true },
    ],
    proof_link: null,
    proof_link_policy: 'editorial_optional',
  };

  return {
    version: 1,
    kind: 'chief-ai/founder-content-proposal',
    proposal_hash: 'a'.repeat(64),
    source: { repo: 'jussray/chief-ai-machine', commit_sha: 'b'.repeat(40) },
    freshness: {
      issued_at: '2026-08-17T07:45:00.000Z',
      expires_at: '2026-08-18T07:45:00.000Z',
    },
    public_payload: publicPayload,
    internal_evidence: {
      verified: true,
      not_for_publication: true,
      digest: 'c'.repeat(64),
    },
    authority: {
      proposal_only: true,
      publish_authorized: false,
      future_you_advisory_only: true,
      analytics_can_authorize_publish: false,
      external_feedback_trusted_for_authority: false,
    },
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
      supersedes_stale_content_intent: true,
    },
    ...overrides,
  };
}

{
  const proposed = proposal();
  const authorization = authorizeFounderContentPublication({
    proposal: proposed,
    approval: approval(proposed),
    now: '2026-08-17T08:05:00.000Z',
  });

  assert.equal(authorization.kind, 'fcr/founder-content-publication-authorization');
  assert.equal(authorization.state, 'authorized-for-scheduled-review');
  assert.equal(authorization.proposal_hash, proposed.proposal_hash);
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
    public_payload: { ...proposed.public_payload, draft_text: proposed.public_payload.draft_text + ' Edited after approval.' },
  });

  assert.throws(
    () => authorizeFounderContentPublication({ proposal: edited, approval: approved, now: '2026-08-17T08:05:00.000Z' }),
    /public_payload_hash does not match exact public copy/,
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
  const unsafeAuthority = proposal({
    authority: {
      proposal_only: true,
      publish_authorized: false,
      future_you_advisory_only: true,
      analytics_can_authorize_publish: true,
      external_feedback_trusted_for_authority: false,
    },
  });

  assert.throws(
    () => authorizeFounderContentPublication({
      proposal: unsafeAuthority,
      approval: approval(unsafeAuthority),
      now: '2026-08-17T08:05:00.000Z',
    }),
    /analytics may not authorize publication/,
  );
}

console.log('founder content authorization contract: ok');
