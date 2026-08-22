import { describe, expect, it } from 'vitest';
import {
  N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
  buildProviderNeutralN8nFounderContentEnvelope,
  buildProviderNeutralN8nFounderContentRequest,
  providerSupportsFounderContentPlatform,
  readN8nFounderContentProviderConfig,
  resolveN8nFounderContentProvider,
  validateProviderNeutralN8nFounderContentEnvelope,
  verifyProviderNeutralN8nFounderContentReceipt,
} from '../n8nProviderNeutralFounderContentOrchestrator.js';
import type { FirstPartyFounderScheduleEnvelope } from '../n8nFounderContentOrchestrator.js';
// @ts-expect-error -- canonical founder-content authorization test helper is CommonJS.
import founderContentAuthorizationContract from '../../../tools/founder-content-contracts/founder-content-authorization-contract.cjs';

const AUTH_HASH = 'a'.repeat(64);
const PROPOSAL_HASH = 'b'.repeat(64);
const PAYLOAD_HASH = 'c'.repeat(64);
const SOURCE_SHA = 'd'.repeat(40);
const EVIDENCE_REF = `github:founder-control-room@${SOURCE_SHA}#quality-gate`;
const NOW = '2026-08-18T01:30:00.000Z';

const { canonicalChiefIdentity, hashPublicPayload } = founderContentAuthorizationContract as {
  canonicalChiefIdentity(value: Record<string, unknown>): unknown;
  hashPublicPayload(value: unknown): string;
};

function proposal(platform: string): Record<string, unknown> {
  const value: Record<string, unknown> = {
    version: 1,
    kind: 'chief-ai/founder-content-proposal',
    source: { repo: 'jussray/founder-control-room', commit_sha: SOURCE_SHA },
    freshness: {
      issued_at: '2026-08-18T01:00:00.000Z',
      expires_at: '2026-08-18T02:30:00.000Z',
    },
    public_payload: {
      platform,
      story_type: 'founder-progress',
      draft_text: `Verified ${platform} founder progress without exposing private implementation details.`,
      public_claims: [{
        claim_id: `${platform}-proof-bound`,
        text: `The ${platform} founder update was bound to verified repository evidence.`,
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

function approval(proposed: Record<string, unknown>, platform: string, expiresAt = '2026-08-18T02:10:00.000Z') {
  const publicPayload = proposed.public_payload as Record<string, unknown>;
  return {
    approval_id: `approval-${platform}-current`,
    proposal_hash: proposed.proposal_hash,
    public_payload_hash: hashPublicPayload(publicPayload),
    channels: [platform],
    approved_at: '2026-08-18T01:20:00.000Z',
    expires_at: expiresAt,
    revoked: false,
    used: false,
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: `publish-${platform}-current`,
      intent_version: 10,
      observed_at: '2026-08-18T01:19:00.000Z',
      supersedes_stale_content_intent: true,
    },
  };
}

function nativeInput(provider: string, platform: string, overrides: Record<string, unknown> = {}) {
  const proposed = proposal(platform);
  return {
    n8n_provider: provider,
    proposal: proposed,
    approval: approval(proposed, platform),
    now: NOW,
    ...overrides,
  };
}

function envelope(
  overrides: Partial<FirstPartyFounderScheduleEnvelope> = {},
): FirstPartyFounderScheduleEnvelope {
  const base: FirstPartyFounderScheduleEnvelope = {
    version: 1,
    lane: 'first_party_founder_governed_schedule',
    provider: 'buffer',
    state: 'scheduled_review_window',
    content_id: '11111111-1111-4111-8111-111111111111',
    platform: 'linkedin',
    channel: 'juss_rayy_linkedin',
    text: 'Verified founder progress without exposing the private implementation recipe.',
    source: {
      repo: 'jussray/founder-control-room',
      commit_sha: SOURCE_SHA,
      proof_url: 'https://private.example/proof/never-forward',
    },
    authority: {
      publish_allowed: true,
      schedule_allowed: true,
      standing_policy_applied: false,
      authorization_mode: 'exact-current-you',
      authorization_receipt_verified: true,
      exact_current_you_approval_required: true,
      first_party_founder_content: true,
      founder_content_authorization_hash: AUTH_HASH,
      founder_content_proposal_hash: PROPOSAL_HASH,
      public_payload_hash: PAYLOAD_HASH,
      current_you_intent_id: 'founder-content-current',
      current_you_intent_version: 9,
    },
    provider_request: {
      method: 'schedule',
      save_to_draft: false,
      schedule_at: '2026-08-18T02:00:00.000Z',
      review_deadline: '2026-08-18T02:00:00.000Z',
      review_window_minutes: 20,
      share_now_allowed: false,
      external_write_included: false,
    },
  };

  return {
    ...base,
    ...overrides,
    source: { ...base.source, ...(overrides.source ?? {}) },
    authority: { ...base.authority, ...(overrides.authority ?? {}) },
    provider_request: { ...base.provider_request, ...(overrides.provider_request ?? {}) },
  };
}

describe('provider-neutral n8n founder-content routing', () => {
  it('keeps Buffer limited to currently proven routes while defining bounded native provider contracts', () => {
    expect(N8N_FOUNDER_CONTENT_PROVIDER_ROUTES.buffer).toEqual(['linkedin', 'facebook']);
    expect(providerSupportsFounderContentPlatform('buffer', 'instagram')).toBe(false);
    expect(providerSupportsFounderContentPlatform('meta', 'facebook')).toBe(true);
    expect(providerSupportsFounderContentPlatform('meta', 'instagram')).toBe(true);
    expect(providerSupportsFounderContentPlatform('meta', 'threads')).toBe(true);
    expect(providerSupportsFounderContentPlatform('tiktok', 'tiktok')).toBe(true);
    expect(providerSupportsFounderContentPlatform('youtube', 'youtube_shorts')).toBe(true);
  });

  it('defaults runtime enablement to Buffer only and fails closed on invalid provider configuration', () => {
    expect(readN8nFounderContentProviderConfig({})).toEqual({
      enabledProviders: ['buffer'],
      invalidProviders: [],
    });
    expect(readN8nFounderContentProviderConfig({
      N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer,meta,tiktok',
    })).toEqual({
      enabledProviders: ['buffer', 'meta', 'tiktok'],
      invalidProviders: [],
    });
    expect(readN8nFounderContentProviderConfig({
      N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'meta,unknown-provider',
    })).toEqual({
      enabledProviders: ['meta'],
      invalidProviders: ['unknown-provider'],
    });
  });

  it('defaults to Buffer for backward compatibility but allows only bounded compatible providers', () => {
    expect(resolveN8nFounderContentProvider({}, 'facebook')).toBe('buffer');
    expect(resolveN8nFounderContentProvider({ n8n_provider: 'meta' }, 'facebook')).toBe('meta');
    expect(resolveN8nFounderContentProvider({ n8n_provider: 'tiktok' }, 'tiktok')).toBe('tiktok');

    expect(() => resolveN8nFounderContentProvider({}, 'tiktok'))
      .toThrow(/provider buffer does not support platform tiktok/);
    expect(() => resolveN8nFounderContentProvider({ n8n_provider: 'meta' }, 'tiktok'))
      .toThrow(/provider meta does not support platform tiktok/);
    expect(() => resolveN8nFounderContentProvider({ n8n_provider: 'unknown-provider' }, 'facebook'))
      .toThrow(/unsupported provider/);
  });

  it('builds native Meta scheduling directly from exact Current You authority rather than Buffer firewall fields', () => {
    const result = buildProviderNeutralN8nFounderContentEnvelope(nativeInput('meta', 'facebook'));

    expect(result.provider).toBe('meta');
    expect(result.platform).toBe('facebook');
    expect(result.channel).toBe('fcr_facebook');
    expect(result.text).toBe('Verified facebook founder progress without exposing private implementation details.');
    expect(result.source).toEqual({ repo: 'jussray/founder-control-room', commit_sha: SOURCE_SHA });
    expect(result.authority.authorization_mode).toBe('exact-current-you');
    expect(result.authority.standing_policy_applied).toBe(false);
    expect(result.provider_request.schedule_at).toBe('2026-08-18T01:50:00.000Z');
    expect(result.provider_request.review_window_minutes).toBe(20);
    expect(result.provider_request.share_now_allowed).toBe(false);
    expect(result.source.proof_url).toBeUndefined();
  });

  it('refuses once-current claims on every deferred provider route', () => {
    const proposed = proposal('facebook');
    const payload = proposed.public_payload as Record<string, unknown>;
    payload.public_claims = [{
      claim_id: 'facebook-current',
      text: 'The facebook founder update is currently bound to repository state.',
      truth_state: 'verified',
      public_safe: true,
      evidence_ref: EVIDENCE_REF,
      evidence_scope: 'provider-neutral-social-contract',
      temporal_class: 'current_repo_state',
      temporal_version: SOURCE_SHA,
    }];
    proposed.proposal_hash = hashPublicPayload(canonicalChiefIdentity(proposed));

    expect(() => buildProviderNeutralN8nFounderContentEnvelope({
      n8n_provider: 'meta',
      proposal: proposed,
      approval: approval(proposed, 'facebook'),
      now: NOW,
    })).toThrow(/TEMPORAL_REVALIDATION_REQUIRED/);

    expect(() => buildProviderNeutralN8nFounderContentEnvelope({
      n8n_provider: 'buffer',
      proposal: proposed,
      approval: approval(proposed, 'facebook'),
      now: NOW,
    })).toThrow(/TEMPORAL_REVALIDATION_REQUIRED/);
  });

  it('refuses historical labels that still use current-state copy', () => {
    const proposed = proposal('instagram');
    const payload = proposed.public_payload as Record<string, unknown>;
    payload.public_claims = [{
      claim_id: 'instagram-mislabeled',
      text: 'The instagram founder update is currently verified.',
      truth_state: 'verified',
      public_safe: true,
      evidence_ref: EVIDENCE_REF,
      evidence_scope: 'provider-neutral-social-contract',
      temporal_class: 'historical_version',
      temporal_version: SOURCE_SHA,
    }];
    proposed.proposal_hash = hashPublicPayload(canonicalChiefIdentity(proposed));

    expect(() => buildProviderNeutralN8nFounderContentEnvelope({
      n8n_provider: 'meta',
      proposal: proposed,
      approval: approval(proposed, 'instagram'),
      now: NOW,
    })).toThrow(/historical claim instagram-mislabeled uses current-state language/);
  });

  it('builds TikTok from the same authorization contract and rejects caller attempts to change source or copy', () => {
    const result = buildProviderNeutralN8nFounderContentEnvelope(nativeInput('tiktok', 'tiktok'));
    expect(result.provider).toBe('tiktok');
    expect(result.platform).toBe('tiktok');
    expect(result.channel).toBe('fcr_tiktok');

    expect(() => buildProviderNeutralN8nFounderContentEnvelope(nativeInput('tiktok', 'tiktok', {
      source_commit_sha: 'f'.repeat(40),
    }))).toThrow(/source_commit_sha conflicts with exact founder authorization/);
    expect(() => buildProviderNeutralN8nFounderContentEnvelope(nativeInput('tiktok', 'tiktok', {
      text: 'Attacker changed the approved copy.',
    }))).toThrow(/text conflicts with exact founder authorization/);
  });

  it('fails closed when approval expires before the server-derived review window completes', () => {
    const proposed = proposal('instagram');
    expect(() => buildProviderNeutralN8nFounderContentEnvelope({
      n8n_provider: 'meta',
      proposal: proposed,
      approval: approval(proposed, 'instagram', '2026-08-18T01:45:00.000Z'),
      now: NOW,
    })).toThrow(/expires before the required 20-minute review window completes/);
  });

  it('keeps one-shot execution identity bound to approval rather than transport', () => {
    const authorized = envelope({
      provider: 'buffer',
      platform: 'facebook',
      channel: 'juss_and_co_facebook',
    });
    const viaBuffer = buildProviderNeutralN8nFounderContentRequest(authorized);
    const viaMeta = buildProviderNeutralN8nFounderContentRequest({
      ...authorized,
      provider: 'meta',
      channel: 'fcr_facebook',
    });

    expect(viaMeta.providerRequest.provider).toBe('meta');
    expect(viaMeta.text).toBe(viaBuffer.text);
    expect(viaMeta.fcrAuthorization).toEqual(viaBuffer.fcrAuthorization);
    expect(viaMeta.orchestrationId).toBe(viaBuffer.orchestrationId);
    expect(viaMeta.orchestrationId).toMatch(/^fcr-n8n-social-v2:/);
  });

  it('never forwards private proof references to n8n regardless of provider', () => {
    const native = buildProviderNeutralN8nFounderContentEnvelope(nativeInput('tiktok', 'tiktok'));
    const request = buildProviderNeutralN8nFounderContentRequest(native);
    const serialized = JSON.stringify(request);

    expect(serialized).not.toContain('proof_url');
    expect(serialized).not.toContain('private.example');
    expect(request.authority.authorizePublication).toBe(false);
    expect(request.authority.markPublished).toBe(false);
  });

  it('requires an exact provider receipt and never accepts n8n as final publication truth', () => {
    const native = buildProviderNeutralN8nFounderContentEnvelope(nativeInput('meta', 'instagram'));
    const request = buildProviderNeutralN8nFounderContentRequest(native);

    const receipt = verifyProviderNeutralN8nFounderContentReceipt(request, {
      orchestrationId: request.orchestrationId,
      provider: 'meta',
      state: 'scheduled',
      providerItemId: 'meta-item-123',
      providerRequestId: 'meta-request-456',
    });
    expect(receipt.provider).toBe('meta');
    expect(receipt.published).toBe(false);
    expect(receipt.requiresProviderReadback).toBe(true);

    expect(() => verifyProviderNeutralN8nFounderContentReceipt(request, {
      orchestrationId: request.orchestrationId,
      provider: 'buffer',
      state: 'scheduled',
      providerItemId: 'wrong-provider-item',
    })).toThrow(/provider does not match request/);

    expect(() => verifyProviderNeutralN8nFounderContentReceipt(request, {
      orchestrationId: request.orchestrationId,
      provider: 'meta',
      state: 'scheduled',
      providerItemId: 'meta-item-123',
      published: true,
    })).toThrow(/n8n may not assert final published truth/);
  });

  it('still validates the proven Buffer fallback envelope contract', () => {
    expect(validateProviderNeutralN8nFounderContentEnvelope(envelope())).toEqual([]);
    expect(validateProviderNeutralN8nFounderContentEnvelope(envelope({
      provider: 'meta',
      platform: 'facebook',
      channel: 'fcr_facebook',
    }))).toEqual([]);
    expect(validateProviderNeutralN8nFounderContentEnvelope(envelope({
      provider: 'tiktok',
      platform: 'facebook',
      channel: 'fcr_facebook',
    }))).toContain('provider tiktok does not support platform facebook');
  });
});
