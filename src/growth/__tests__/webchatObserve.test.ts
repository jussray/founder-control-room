import { describe, expect, it } from 'vitest';
import {
  observeFirstPartyWebchat,
  WEBCHAT_OBSERVE_CONTRACT,
} from '../webchatObserve.js';

const base = {
  projectId: 'sekret-bip',
  brandId: 'sekret-bip',
  entryFlowFingerprintId: 'entry:sekret-bip:61f9e074',
  campaignFingerprintId: 'campaign:founding-preview:v1',
  contentFingerprintId: 'content:linkedin:proof:v3',
  conversationId: 'conversation:abc12345',
  anonymousVisitorId: 'visitor:xyz12345',
  purpose: 'support' as const,
  occurredAt: '2026-08-23T22:45:00.000Z',
};

describe('observeFirstPartyWebchat', () => {
  it('normalizes an inbound observation without creating dispatch authority', () => {
    const observed = observeFirstPartyWebchat({
      ...base,
      text: '  I want to know when Bip is ready.  ',
      metadata: { sourcePlatform: 'web', waitlistState: 'interested' },
    });

    expect(observed.contract).toBe(WEBCHAT_OBSERVE_CONTRACT);
    expect(observed.canDispatch).toBe(false);
    expect(observed.entryFlowFingerprintId).toBe(base.entryFlowFingerprintId);
    expect(observed.envelope.channel).toBe('webchat');
    expect(observed.envelope.direction).toBe('inbound');
    expect(observed.envelope.automationMode).toBe('observe_only');
    expect(observed.envelope.signatureVerified).toBe(false);
    expect(observed.envelope.sanitizedText).toBe('I want to know when Bip is ready.');
    expect(observed.envelope.providerUserId).toMatch(/^anon:[a-f0-9]{64}$/);
  });

  it('is deterministic for the same exact observation', () => {
    const first = observeFirstPartyWebchat(base);
    const second = observeFirstPartyWebchat(base);

    expect(second.envelope.providerEventId).toBe(first.envelope.providerEventId);
    expect(second.envelope.idempotencyKey).toBe(first.envelope.idempotencyKey);
  });

  it('fails closed when the entry-flow fingerprint is missing', () => {
    expect(() => observeFirstPartyWebchat({
      ...base,
      entryFlowFingerprintId: '',
    })).toThrow(/entryFlowFingerprintId/);
  });

  it('rejects sensitive Bip wellness metadata', () => {
    expect(() => observeFirstPartyWebchat({
      ...base,
      metadata: { emotionalState: 'sad' },
    })).toThrow(/forbidden webchat metadata key/);
  });

  it('does not place raw anonymous visitor identity in the canonical envelope', () => {
    const observed = observeFirstPartyWebchat(base);

    expect(JSON.stringify(observed)).not.toContain(base.anonymousVisitorId);
  });

  it('rejects oversized message text', () => {
    expect(() => observeFirstPartyWebchat({
      ...base,
      text: 'x'.repeat(2_001),
    })).toThrow(/text exceeds/);
  });
});
