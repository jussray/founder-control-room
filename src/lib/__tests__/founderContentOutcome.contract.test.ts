import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildFounderContentOutcomeObservation } = require('../../../tools/zapier/founder-content-outcome-contract.cjs') as {
  buildFounderContentOutcomeObservation: (input: Record<string, unknown>) => Record<string, any>;
};

const base = {
  content_id: '82a030bd-cd2c-4d72-96c9-b38746bc1380',
  authorization_hash: 'a'.repeat(64),
  public_payload_hash: 'b'.repeat(64),
  platform: 'linkedin',
  provider: 'buffer',
  provider_state: 'scheduled',
  observed_at: '2026-08-17T08:25:00.000Z',
};

describe('founder content outcome observation contract', () => {
  it('keeps missing metrics UNKNOWN instead of silently converting them to zero', () => {
    const receipt = buildFounderContentOutcomeObservation({
      ...base,
      metrics: {
        impressions: 1200,
        profile_views: 44,
        qualified_conversations: 3,
      },
    });

    expect(receipt.metrics.impressions).toBe(1200);
    expect(receipt.metric_states.impressions).toBe('observed');
    expect(receipt.metrics.attributed_deals).toBeNull();
    expect(receipt.metric_states.attributed_deals).toBe('UNKNOWN');
    expect(receipt.authority.missing_metrics_are_unknown).toBe(true);
  });

  it('preserves an explicit observed zero as different from unknown', () => {
    const receipt = buildFounderContentOutcomeObservation({
      ...base,
      metrics: { attributed_deals: 0 },
    });

    expect(receipt.metrics.attributed_deals).toBe(0);
    expect(receipt.metric_states.attributed_deals).toBe('observed');
    expect(receipt.metrics.impressions).toBeNull();
    expect(receipt.metric_states.impressions).toBe('UNKNOWN');
  });

  it('keeps analytics observational and unable to mutate publication authority', () => {
    const receipt = buildFounderContentOutcomeObservation({ ...base, metrics: {} });

    expect(receipt.authority.observation_only).toBe(true);
    expect(receipt.authority.learning_authority).toBe('advisory_only');
    expect(receipt.authority.can_authorize_publish).toBe(false);
    expect(receipt.authority.can_change_content).toBe(false);
    expect(receipt.authority.can_increase_authority).toBe(false);
  });

  it('requires provider readback before a published state can be asserted', () => {
    expect(() => buildFounderContentOutcomeObservation({
      ...base,
      provider_state: 'published',
      metrics: {},
    })).toThrow(/provider_receipt_id is required/);

    const receipt = buildFounderContentOutcomeObservation({
      ...base,
      provider_state: 'published',
      provider_receipt_id: 'buffer-receipt-123',
      metrics: {},
    });
    expect(receipt.provider_state).toBe('published');
    expect(receipt.provider_receipt_id).toBe('buffer-receipt-123');
  });

  it('rejects raw private content and provider payloads from analytics receipts', () => {
    for (const [field, value] of [
      ['raw_post_text', 'private copy'],
      ['dm_text', 'private dm'],
      ['comment_text', 'raw comment'],
      ['provider_payload', { raw: true }],
      ['customer_data', { email: 'private@example.com' }],
      ['private_notes', 'internal'],
    ] as const) {
      expect(() => buildFounderContentOutcomeObservation({
        ...base,
        metrics: {},
        [field]: value,
      })).toThrow(new RegExp(`${field} is forbidden`));
    }
  });

  it('rejects negative and fractional metrics', () => {
    expect(() => buildFounderContentOutcomeObservation({
      ...base,
      metrics: { impressions: -1 },
    })).toThrow(/metrics\.impressions must be a non-negative integer or null/);

    expect(() => buildFounderContentOutcomeObservation({
      ...base,
      metrics: { impressions: 1.5 },
    })).toThrow(/metrics\.impressions must be a non-negative integer or null/);
  });

  it('changes the observation hash when observed outcome evidence changes', () => {
    const first = buildFounderContentOutcomeObservation({ ...base, metrics: { impressions: 10 } });
    const second = buildFounderContentOutcomeObservation({ ...base, metrics: { impressions: 11 } });

    expect(first.observation_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.observation_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.observation_hash).not.toBe(second.observation_hash);
  });
});
