import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  authorizeFounderContentPublication,
  canonicalChiefFounderContentIdentity,
  hashFounderContentJson,
} from './authorization.js';

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

function proposal(overrides: Record<string, unknown> = {}) {
  const publicPayload = (overrides.public_payload as Record<string, unknown> | undefined) ?? {
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

function approval(proposed: ReturnType<typeof proposal>, overrides: Record<string, unknown> = {}) {
  return {
    approval_id: 'approval-2026-08-17-current',
    proposal_hash: proposed.proposal_hash,
    public_payload_hash: hashFounderContentJson(proposed.public_payload),
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

describe('founder content runtime authorization', () => {
  it('matches the Chief/CJS v1 known canonical proposal vector', () => {
    const proposed = proposal();
    const identity = canonicalChiefFounderContentIdentity(proposed);

    expect(hashFounderContentJson(identity)).toBe(KNOWN_CHIEF_V1_HASH);
    expect(
      createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
    ).toBe(KNOWN_CHIEF_V1_HASH);
  });

  it('allows a newer Current You approval while keeping Chief and analytics non-authoritative', () => {
    const proposed = proposal();
    const authorization = authorizeFounderContentPublication({
      proposal: proposed,
      approval: approval(proposed),
      now: new Date('2026-08-17T08:05:00.000Z'),
    });

    expect(authorization.proposal_hash).toBe(KNOWN_CHIEF_V1_HASH);
    expect(authorization.current_you.intent_version).toBe(8);
    expect(authorization.authority).toMatchObject({
      chief_can_publish: false,
      future_you_can_authorize: false,
      historical_intent_can_authorize: false,
      analytics_can_authorize: false,
      external_feedback_can_authorize: false,
      one_shot: true,
      share_now_allowed: false,
    });
    expect(authorization.authorization_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a stale Current You version', () => {
    const proposed = proposal();
    expect(() => authorizeFounderContentPublication({
      proposal: proposed,
      approval: approval(proposed, {
        current_you: {
          authenticated: true,
          source: 'current_authenticated_founder',
          intent_id: 'older-intent',
          intent_version: 6,
          observed_at: '2026-08-17T07:59:00.000Z',
          supersedes_stale_content_intent: true,
        },
      }),
      now: new Date('2026-08-17T08:05:00.000Z'),
    })).toThrow(/older than proposal intent version/);
  });

  it('rejects copy and evidence tampering against the exact proposal hash', () => {
    const proposed = proposal();
    const edited = proposal({
      proposal_hash: proposed.proposal_hash,
      public_payload: {
        ...(proposed.public_payload as Record<string, unknown>),
        draft_text: 'Edited after the exact Chief proposal hash was issued.',
      },
    });
    expect(() => authorizeFounderContentPublication({
      proposal: edited,
      approval: approval(proposed),
      now: new Date('2026-08-17T08:05:00.000Z'),
    })).toThrow(/proposal_hash does not match canonical Chief v1 proposal identity/);

    const evidenceTampered = proposal({
      proposal_hash: proposed.proposal_hash,
      internal_evidence: {
        ...(proposed.internal_evidence as Record<string, unknown>),
        digest: 'd'.repeat(64),
      },
    });
    expect(() => authorizeFounderContentPublication({
      proposal: evidenceTampered,
      approval: approval(proposed),
      now: new Date('2026-08-17T08:05:00.000Z'),
    })).toThrow(/proposal_hash does not match canonical Chief v1 proposal identity/);
  });

  it('refuses FutureYou as the publication authority', () => {
    const proposed = proposal();
    expect(() => authorizeFounderContentPublication({
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
      now: new Date('2026-08-17T08:05:00.000Z'),
    })).toThrow(/current_authenticated_founder/);
  });
});
