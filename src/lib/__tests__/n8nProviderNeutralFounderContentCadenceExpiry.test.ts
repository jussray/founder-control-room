import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const { reserveCadence, applyCadence } = vi.hoisted(() => ({
  reserveCadence: vi.fn(),
  applyCadence: vi.fn(),
}));

vi.mock('../founderContentCadence.js', () => ({
  reserveFounderContentCadence: reserveCadence,
  applyFounderContentCadenceSchedule: applyCadence,
}));

import { dispatchProviderNeutralN8nFounderContent } from '../n8nProviderNeutralFounderContentOrchestrator.js';

const require = createRequire(import.meta.url);
const {
  canonicalChiefIdentity,
  hashPublicPayload,
} = require('../../../tools/founder-content-contracts/founder-content-authorization-contract.cjs') as {
  canonicalChiefIdentity(value: Record<string, unknown>): unknown;
  hashPublicPayload(value: unknown): string;
};

const SOURCE_SHA = 'd'.repeat(40);
const NOW = '2026-08-18T01:30:00.000Z';
const APPROVAL_EXPIRES_AT = '2026-08-18T02:10:00.000Z';
const EVIDENCE_REF = `github:founder-control-room@${SOURCE_SHA}#quality-gate`;

function proposal(): Record<string, unknown> {
  const value: Record<string, unknown> = {
    version: 1,
    kind: 'chief-ai/founder-content-proposal',
    source: { repo: 'jussray/founder-control-room', commit_sha: SOURCE_SHA },
    freshness: {
      issued_at: '2026-08-18T01:00:00.000Z',
      expires_at: '2026-08-18T02:30:00.000Z',
    },
    public_payload: {
      platform: 'linkedin',
      story_type: 'founder-progress',
      draft_text: 'Verified founder progress from an exact historical repository version without exposing private implementation details.',
      public_claims: [{
        claim_id: 'linkedin-proof-bound',
        text: 'The LinkedIn founder update was bound to a verified historical repository version.',
        truth_state: 'verified',
        public_safe: true,
        evidence_ref: EVIDENCE_REF,
        evidence_scope: 'provider-neutral-social-contract',
        temporal_class: 'historical_version',
        temporal_version: SOURCE_SHA,
      }],
      proof_link: null,
      proof_link_policy: 'editorial_optional',
    },
    internal_evidence: {
      verified: true,
      ref: EVIDENCE_REF,
      kind: 'github-exact-head-contract',
      digest: 'e'.repeat(64),
      not_for_publication: true,
      source_repo: 'jussray/founder-control-room',
      source_commit_sha: SOURCE_SHA,
      proves: ['provider-neutral-social-contract'],
      does_not_prove: ['provider-runtime', 'publication', 'traction'],
    },
    sauce_guard: {
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
      withheld_categories: ['private-implementation'],
    },
    authority: {
      proposal_only: true,
      publish_authorized: false,
      current_you_source: 'current_authenticated_founder',
      current_you_intent_id: 'founder-content-current',
      current_you_intent_version: 9,
      current_you_observed_at: '2026-08-18T01:05:00.000Z',
      proposal_evaluated_at: '2026-08-18T01:10:00.000Z',
      future_you_advisory_only: true,
      historical_content_intent_authoritative: false,
      analytics_feedback_authority: 'observation-only',
      analytics_can_authorize_publish: false,
      external_feedback_trusted_for_authority: false,
    },
  };
  value.proposal_hash = hashPublicPayload(canonicalChiefIdentity(value));
  return value;
}

function approval(proposed: Record<string, unknown>) {
  return {
    approval_id: 'approval-linkedin-current',
    proposal_hash: proposed.proposal_hash,
    public_payload_hash: hashPublicPayload(proposed.public_payload),
    channels: ['linkedin'],
    approved_at: '2026-08-18T01:20:00.000Z',
    expires_at: APPROVAL_EXPIRES_AT,
    revoked: false,
    used: false,
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: 'publish-linkedin-current',
      intent_version: 10,
      observed_at: '2026-08-18T01:19:00.000Z',
      supersedes_stale_content_intent: true,
    },
  };
}

describe('provider-neutral cadence authority expiry', () => {
  it('passes exact approval expiry into the atomic cadence RPC and stops before projection/provider dispatch on rejection', async () => {
    const proposed = proposal();
    reserveCadence.mockRejectedValueOnce(new Error(
      'FOUNDER_CONTENT_CADENCE_RESERVATION_FAILED: FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRED',
    ));

    const fetchImpl = vi.fn();
    const result = await dispatchProviderNeutralN8nFounderContent({
      n8n_provider: 'buffer',
      proposal: proposed,
      approval: approval(proposed),
      now: NOW,
    }, {
      env: {
        N8N_FOUNDER_CONTENT_ENABLED: 'true',
        N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
        N8N_FOUNDER_CONTENT_BEARER_TOKEN: 'server-only-test-token',
        N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer',
      },
      executedBy: 'founder@example.com',
      fetchImpl,
    });

    expect(reserveCadence).toHaveBeenCalledTimes(1);
    expect(reserveCadence).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'n8n',
      channel: 'linkedin',
      approvalExpiresAt: APPROVAL_EXPIRES_AT,
    }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('CADENCE_RESERVATION_FAILED');
    expect(result.reasons.join(' ')).toContain('FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRED');
    expect(applyCadence).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
