import { describe, expect, it } from 'vitest';
import {
  N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
  buildProviderNeutralN8nFounderContentRequest,
  providerSupportsFounderContentPlatform,
  readN8nFounderContentProviderConfig,
  resolveN8nFounderContentProvider,
  validateProviderNeutralN8nFounderContentEnvelope,
  verifyProviderNeutralN8nFounderContentReceipt,
} from '../n8nProviderNeutralFounderContentOrchestrator.js';
import type { FirstPartyFounderScheduleEnvelope } from '../n8nFounderContentOrchestrator.js';

const AUTH_HASH = 'a'.repeat(64);
const PROPOSAL_HASH = 'b'.repeat(64);
const PAYLOAD_HASH = 'c'.repeat(64);
const SOURCE_SHA = 'd'.repeat(40);

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

  it('keeps LinkedIn direct-first by allowing only the existing Buffer fallback in the n8n route', () => {
    expect(providerSupportsFounderContentPlatform('buffer', 'linkedin')).toBe(true);
    expect(providerSupportsFounderContentPlatform('meta', 'linkedin')).toBe(false);
    expect(providerSupportsFounderContentPlatform('tiktok', 'linkedin')).toBe(false);
  });

  it('accepts provider-neutral envelopes only when provider and approved platform match', () => {
    expect(validateProviderNeutralN8nFounderContentEnvelope(envelope())).toEqual([]);
    expect(validateProviderNeutralN8nFounderContentEnvelope(envelope({
      provider: 'meta',
      platform: 'facebook',
      channel: 'juss_and_co_facebook',
    }))).toEqual([]);
    expect(validateProviderNeutralN8nFounderContentEnvelope(envelope({
      provider: 'tiktok',
      platform: 'facebook',
      channel: 'juss_and_co_facebook',
    }))).toContain('provider tiktok does not support platform facebook');
  });

  it('binds provider selection into the orchestration identity without changing approved copy', () => {
    const viaBuffer = buildProviderNeutralN8nFounderContentRequest(envelope({
      provider: 'buffer',
      platform: 'facebook',
      channel: 'juss_and_co_facebook',
    }));
    const viaMeta = buildProviderNeutralN8nFounderContentRequest(envelope({
      provider: 'meta',
      platform: 'facebook',
      channel: 'juss_and_co_facebook',
    }));

    expect(viaMeta.providerRequest.provider).toBe('meta');
    expect(viaMeta.text).toBe(viaBuffer.text);
    expect(viaMeta.fcrAuthorization).toEqual(viaBuffer.fcrAuthorization);
    expect(viaMeta.orchestrationId).not.toBe(viaBuffer.orchestrationId);
  });

  it('never forwards private proof references to n8n regardless of provider', () => {
    const request = buildProviderNeutralN8nFounderContentRequest(envelope({
      provider: 'tiktok',
      platform: 'tiktok',
      channel: 'juss_rayy_tiktok',
    }));
    const serialized = JSON.stringify(request);

    expect(serialized).not.toContain('proof_url');
    expect(serialized).not.toContain('private.example');
    expect(request.authority.authorizePublication).toBe(false);
    expect(request.authority.markPublished).toBe(false);
  });

  it('requires an exact provider receipt and never accepts n8n as final publication truth', () => {
    const request = buildProviderNeutralN8nFounderContentRequest(envelope({
      provider: 'meta',
      platform: 'instagram',
      channel: 'juss_rayy_instagram',
    }));

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
});
