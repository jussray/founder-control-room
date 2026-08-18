import { describe, expect, it } from 'vitest';
import { buildProviderNeutralN8nFounderContentEnvelope } from '../n8nProviderNeutralFounderContentOrchestrator.js';
// @ts-expect-error -- canonical founder-content authorization test helper is CommonJS.
import founderContentAuthorizationContract from '../../../tools/zapier/founder-content-authorization-contract.cjs';

const SOURCE_SHA = 'd'.repeat(40);
const EVIDENCE_REF = `github:founder-control-room@${SOURCE_SHA}#quality-gate`;
const NOW = '2026-08-18T01:30:00.000Z';

const { canonicalChiefIdentity, hashPublicPayload } = founderContentAuthorizationContract as {
  canonicalChiefIdentity(value: Record<string, unknown>): unknown;
  hashPublicPayload(value: unknown): string;
};

function proposalWithClaim(
  claimText: string,
  draftText: string = claimText,
): Record<string, unknown> {
  const value: Record<string, unknown> = {
    version: 1,
    kind: 'chief-ai/founder-content-proposal',
    source: { repo: 'jussray/founder-control-room', commit_sha: SOURCE_SHA },
    freshness: {
      issued_at: '2026-08-18T01:00:00.000Z',
      expires_at: '2026-08-18T02:30:00.000Z',
    },
    public_payload: {
      platform: 'facebook',
      story_type: 'founder-progress',
      draft_text: draftText,
      public_claims: [{
        claim_id: 'facebook-proof-bound',
        text: claimText,
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
    approval_id: 'approval-facebook-current',
    proposal_hash: proposed.proposal_hash,
    public_payload_hash: hashPublicPayload(proposed.public_payload),
    channels: ['facebook'],
    approved_at: '2026-08-18T01:20:00.000Z',
    expires_at: '2026-08-18T02:10:00.000Z',
    revoked: false,
    used: false,
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: 'publish-facebook-current',
      intent_version: 10,
      observed_at: '2026-08-18T01:19:00.000Z',
      supersedes_stale_content_intent: true,
    },
  };
}

function build(claimText: string, draftText: string = claimText) {
  const proposed = proposalWithClaim(claimText, draftText);
  return () => buildProviderNeutralN8nFounderContentEnvelope({
    n8n_provider: 'meta',
    proposal: proposed,
    approval: approval(proposed),
    now: NOW,
  });
}

describe('deferred founder-content historical wording', () => {
  it('accepts durable past-tense claim and approved copy', () => {
    expect(build('I shipped the Facebook founder update from verified repository evidence.')).not.toThrow();
  });

  it.each([
    'The Facebook founder update is deployed from verified repository evidence.',
    'The Facebook founder update supports verified repository evidence.',
    'The Facebook founder update works with verified repository evidence.',
    'The Facebook founder update exists in the verified repository.',
    'The Facebook founder update can use verified repository evidence.',
    'The Facebook founder update has verified repository evidence.',
  ])('rejects present-state grammar even when the claim is labeled historical: %s', (claimText) => {
    expect(build(claimText)).toThrow(/uses current-state language/);
  });

  it('rejects current-state approved copy even when every attached claim is historically durable', () => {
    expect(build(
      'I shipped the Facebook founder update from verified repository evidence.',
      'The Facebook founder update supports verified repository evidence.',
    )).toThrow(/approved deferred copy uses current-state language/);
  });
});
