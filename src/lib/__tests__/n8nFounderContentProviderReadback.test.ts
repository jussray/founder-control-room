import { describe, expect, it } from 'vitest';
import {
  verifyN8nFounderContentProviderReadback,
  type N8nFounderContentProviderReadbackInput,
} from '../n8nFounderContentProviderReadback.js';
import type {
  N8nFounderContentRequest,
  VerifiedN8nFounderContentReceipt,
} from '../n8nFounderContentOrchestrator.js';

const SHA = 'a'.repeat(40);
const ORCHESTRATION_ID = `fcr-n8n-social-v2:${'b'.repeat(64)}`;
const SCHEDULED_AT = '2026-08-29T12:00:00.000Z';

function request(overrides: Partial<N8nFounderContentRequest> = {}): N8nFounderContentRequest {
  const base: N8nFounderContentRequest = {
    contract: 'fcr/n8n-founder-content-orchestration@v1',
    event: 'founder-content.schedule.requested',
    orchestrationId: ORCHESTRATION_ID,
    contentId: '11111111-1111-4111-8111-111111111111',
    platform: 'linkedin',
    channel: 'fcr_linkedin',
    text: 'Public-safe founder update.',
    source: { repo: 'jussray/founder-control-room', commitSha: SHA },
    fcrAuthorization: {
      mode: 'exact-current-you',
      authorizationHash: 'c'.repeat(64),
      proposalHash: 'd'.repeat(64),
      publicPayloadHash: 'e'.repeat(64),
      currentYouIntentId: 'publish-linkedin-current',
      currentYouIntentVersion: 1,
    },
    providerRequest: {
      provider: 'buffer',
      method: 'schedule',
      scheduleAt: SCHEDULED_AT,
      reviewDeadline: SCHEDULED_AT,
      reviewWindowMinutes: 20,
      shareNowAllowed: false,
    },
    authority: {
      orchestrate: true,
      requestProviderWrite: true,
      authorizePublication: false,
      changeCopy: false,
      markPublished: false,
      readPrivateEvidence: false,
    },
  };
  return { ...base, ...overrides };
}

function receipt(overrides: Partial<VerifiedN8nFounderContentReceipt> = {}): VerifiedN8nFounderContentReceipt {
  return {
    orchestrationId: ORCHESTRATION_ID,
    provider: 'buffer',
    state: 'scheduled',
    providerItemId: 'buffer-update-123',
    providerRequestId: 'buffer-request-456',
    truthState: 'provider_schedule_receipt_pending_readback',
    published: false,
    requiresProviderReadback: true,
    ...overrides,
  };
}

function readback(overrides: N8nFounderContentProviderReadbackInput = {}): N8nFounderContentProviderReadbackInput {
  return {
    orchestrationId: ORCHESTRATION_ID,
    provider: 'buffer',
    providerItemId: 'buffer-update-123',
    providerRequestId: 'buffer-request-456',
    state: 'scheduled',
    providerNativeState: 'pending',
    platform: 'linkedin',
    channel: 'fcr_linkedin',
    sourceRepo: 'jussray/founder-control-room',
    exactCommitSha: SHA,
    scheduledAt: SCHEDULED_AT,
    observedAt: '2026-08-29T11:45:00.000Z',
    published: false,
    sanitized: true,
    readbackSource: 'provider-native-api',
    ...overrides,
  };
}

describe('n8n founder-content provider-native readback', () => {
  it('upgrades only an exact provider-native scheduled readback to verified provider truth', () => {
    const result = verifyN8nFounderContentProviderReadback(request(), receipt(), readback());

    expect(result.truthState).toBe('provider_schedule_verified');
    expect(result.requiresProviderReadback).toBe(false);
    expect(result.published).toBe(false);
    expect(result.providerItemId).toBe('buffer-update-123');
    expect(result.providerNativeState).toBe('pending');
    expect(result.readbackSource).toBe('provider-native-api');
    expect(result.readbackHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result)).not.toContain('Public-safe founder update.');
  });

  it('rejects an accepted-only n8n receipt because no provider item exists yet', () => {
    expect(() => verifyN8nFounderContentProviderReadback(
      request(),
      receipt({ state: 'accepted', providerItemId: null }),
      readback(),
    )).toThrow(/requires a scheduled n8n receipt with providerItemId/);
  });

  it('rejects a provider mismatch', () => {
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ provider: 'meta' })))
      .toThrow(/provider does not match/);
  });

  it('rejects a provider item mismatch', () => {
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ providerItemId: 'other-item' })))
      .toThrow(/item id does not match/);
  });

  it('rejects an orchestration or provider request identity mismatch', () => {
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ orchestrationId: 'wrong' })))
      .toThrow(/orchestrationId does not match/);
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ providerRequestId: 'wrong' })))
      .toThrow(/request id does not match/);
  });

  it('rejects wrong source repository or exact commit SHA', () => {
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ sourceRepo: 'jussray/other' })))
      .toThrow(/source repo does not match/);
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ exactCommitSha: 'f'.repeat(40) })))
      .toThrow(/exact commit SHA does not match/);
  });

  it('rejects wrong platform or channel', () => {
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ platform: 'facebook' })))
      .toThrow(/platform does not match/);
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ channel: 'other-channel' })))
      .toThrow(/channel does not match/);
  });

  it('rejects schedule drift and malformed observation time', () => {
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ scheduledAt: '2026-08-29T12:01:00.000Z' })))
      .toThrow(/scheduledAt does not match/);
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ observedAt: 'not-a-time' })))
      .toThrow(/observedAt must be a valid timestamp/);
  });

  it('rejects published truth or a non-scheduled normalized state', () => {
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ published: true })))
      .toThrow(/may not silently elevate scheduled state to published/);
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ state: 'published' })))
      .toThrow(/normalized state must be scheduled/);
  });

  it('rejects empty native provider state', () => {
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ providerNativeState: '' })))
      .toThrow(/retain a nonempty native provider state/);
  });

  it('rejects unsanitized, non-native, or payload-bearing readbacks', () => {
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ sanitized: false })))
      .toThrow(/must be explicitly sanitized/);
    expect(() => verifyN8nFounderContentProviderReadback(request(), receipt(), readback({ readbackSource: 'n8n' })))
      .toThrow(/provider-native API/);
    expect(() => verifyN8nFounderContentProviderReadback(
      request(),
      receipt(),
      { ...readback(), text: 'private body must never cross this receipt' } as N8nFounderContentProviderReadbackInput,
    )).toThrow(/unsupported fields: text/);
  });

  it('cannot close a receipt that was already claimed as verified', () => {
    expect(() => verifyN8nFounderContentProviderReadback(
      request(),
      receipt({ requiresProviderReadback: false } as Partial<VerifiedN8nFounderContentReceipt>),
      readback(),
    )).toThrow(/may only close a pending provider-readback receipt/);
  });
});
