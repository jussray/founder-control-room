import { describe, expect, it } from 'vitest';
import {
  buildCanonicalFirstPartyFounderScheduleEnvelope,
  buildN8nFounderContentRequest,
  readN8nFounderContentConfig,
  validateN8nFounderContentEnvelope,
  verifyN8nFounderContentReceipt,
  type FirstPartyFounderScheduleEnvelope,
} from '../n8nFounderContentOrchestrator.js';

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
    text: 'I changed how my product tells its own progress story while keeping the implementation recipe private.',
    source: {
      repo: 'jussray/founder-control-room',
      commit_sha: SOURCE_SHA,
      proof_url: 'https://private.example/proof/should-not-leave-fcr',
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
      current_you_intent_version: 7,
    },
    provider_request: {
      method: 'schedule',
      save_to_draft: false,
      schedule_at: '2026-08-17T15:20:00.000Z',
      review_deadline: '2026-08-17T15:20:00.000Z',
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

describe('n8n founder-content orchestration', () => {
  it('accepts only the exact Current-You first-party schedule lane', () => {
    expect(validateN8nFounderContentEnvelope(envelope())).toEqual([]);

    expect(validateN8nFounderContentEnvelope(envelope({
      lane: 'governed_schedule',
    }))).toContain('n8n founder-content orchestration accepts only first-party founder governed schedules');

    expect(validateN8nFounderContentEnvelope(envelope({
      authority: { ...envelope().authority, authorization_mode: 'standing-policy', standing_policy_applied: true },
    }))).toEqual(expect.arrayContaining([
      'authorization_mode must be exact-current-you',
      'standing policy may not authorize founder-progress publication',
    ]));
  });

  it('does not accept a caller-shaped authorized envelope as canonical FCR authority', () => {
    expect(() => buildCanonicalFirstPartyFounderScheduleEnvelope(
      envelope() as unknown as Record<string, unknown>,
    )).toThrow(/FOUNDER_CONTENT_AUTHORIZATION_REJECTED|SOCIAL_DISTRIBUTION_REJECTED/);
  });

  it('projects only provider-safe data and never sends private proof references', () => {
    const request = buildN8nFounderContentRequest(envelope());
    const serialized = JSON.stringify(request);

    expect(request.authority).toEqual({
      orchestrate: true,
      requestProviderWrite: true,
      authorizePublication: false,
      changeCopy: false,
      markPublished: false,
      readPrivateEvidence: false,
    });
    expect(request.fcrAuthorization.mode).toBe('exact-current-you');
    expect(serialized).not.toContain('proof_url');
    expect(serialized).not.toContain('private.example');
    expect(serialized).not.toContain('privateEvidence');
  });

  it('binds orchestration identity to copy, Current You, authorization and schedule', () => {
    const original = buildN8nFounderContentRequest(envelope());
    const changedCopy = buildN8nFounderContentRequest(envelope({ text: `${envelope().text} Updated.` }));
    const changedIntent = buildN8nFounderContentRequest(envelope({
      authority: { ...envelope().authority, current_you_intent_version: 8 },
    }));
    const changedAuthorization = buildN8nFounderContentRequest(envelope({
      authority: { ...envelope().authority, founder_content_authorization_hash: 'e'.repeat(64) },
    }));
    const changedSchedule = buildN8nFounderContentRequest(envelope({
      provider_request: { ...envelope().provider_request, schedule_at: '2026-08-17T16:20:00.000Z' },
    }));

    expect(changedCopy.orchestrationId).not.toBe(original.orchestrationId);
    expect(changedIntent.orchestrationId).not.toBe(original.orchestrationId);
    expect(changedAuthorization.orchestrationId).not.toBe(original.orchestrationId);
    expect(changedSchedule.orchestrationId).not.toBe(original.orchestrationId);
  });

  it('keeps final published truth in FCR after n8n/provider read-back', () => {
    const request = buildN8nFounderContentRequest(envelope());
    const receipt = verifyN8nFounderContentReceipt(request, {
      orchestrationId: request.orchestrationId,
      provider: 'buffer',
      state: 'scheduled',
      providerItemId: 'buffer-post-123',
      providerRequestId: 'buffer-request-456',
    });

    expect(receipt.published).toBe(false);
    expect(receipt.requiresProviderReadback).toBe(true);
    expect(receipt.truthState).toBe('provider_schedule_receipt_pending_readback');

    expect(() => verifyN8nFounderContentReceipt(request, {
      orchestrationId: request.orchestrationId,
      provider: 'buffer',
      state: 'scheduled',
      providerItemId: 'buffer-post-123',
      published: true,
    })).toThrow(/n8n may not assert final published truth/);
  });

  it('fails closed on receipt drift', () => {
    const request = buildN8nFounderContentRequest(envelope());
    expect(() => verifyN8nFounderContentReceipt(request, {
      orchestrationId: 'fcr-n8n-social-v1:wrong',
      provider: 'buffer',
      state: 'scheduled',
      providerItemId: 'buffer-post-123',
    })).toThrow(/does not match exact request/);
  });

  it('requires a dedicated enabled HTTPS n8n endpoint', () => {
    expect(readN8nFounderContentConfig({})).toEqual({
      enabled: false,
      configured: false,
      webhookUrl: null,
      bearerToken: null,
    });

    expect(readN8nFounderContentConfig({
      N8N_FOUNDER_CONTENT_ENABLED: 'true',
      N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
      N8N_FOUNDER_CONTENT_BEARER_TOKEN: 'configured-at-runtime',
    })).toEqual({
      enabled: true,
      configured: true,
      webhookUrl: 'https://n8n.example/webhook/founder-content',
      bearerToken: 'configured-at-runtime',
    });
  });
});
