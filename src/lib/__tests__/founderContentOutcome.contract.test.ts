import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildFounderContentOutcomeObservation,
  buildFounderContentLearningRequest,
} = require('../../../tools/zapier/founder-content-outcome-contract.cjs') as {
  buildFounderContentOutcomeObservation: (input: Record<string, unknown>) => Record<string, any>;
  buildFounderContentLearningRequest: (
    observation: Record<string, unknown>,
    options: { secret: string; key_id: string; issued_at: string },
  ) => Record<string, any>;
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
      metrics: { impressions: 1200, profile_views: 44, qualified_conversations: 3 },
    });

    expect(receipt.metrics.impressions).toBe(1200);
    expect(receipt.metric_states.impressions).toBe('observed');
    expect(receipt.metrics.attributed_deals).toBeNull();
    expect(receipt.metric_states.attributed_deals).toBe('UNKNOWN');
    expect(receipt.authority.missing_metrics_are_unknown).toBe(true);
  });

  it('preserves explicit observed zero as distinct from unknown', () => {
    const receipt = buildFounderContentOutcomeObservation({
      ...base,
      metrics: { attributed_deals: 0 },
    });

    expect(receipt.metrics.attributed_deals).toBe(0);
    expect(receipt.metric_states.attributed_deals).toBe('observed');
    expect(receipt.metrics.impressions).toBeNull();
    expect(receipt.metric_states.impressions).toBe('UNKNOWN');
  });

  it('keeps analytics observational and unable to increase publication authority', () => {
    const receipt = buildFounderContentOutcomeObservation({ ...base, metrics: {} });

    expect(receipt.authority.observation_only).toBe(true);
    expect(receipt.authority.learning_authority).toBe('advisory_only');
    expect(receipt.authority.can_authorize_publish).toBe(false);
    expect(receipt.authority.can_change_content).toBe(false);
    expect(receipt.authority.can_increase_authority).toBe(false);
  });

  it('requires provider readback before published can become true', () => {
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

  it('rejects raw private content and provider payloads', () => {
    for (const [field, value] of [
      ['raw_post_text', 'private copy'],
      ['dm_text', 'private dm'],
      ['comment_text', 'raw comment'],
      ['provider_payload', { raw: true }],
      ['customer_data', { email: 'private@example.com' }],
      ['private_notes', 'internal'],
    ] as const) {
      expect(() => buildFounderContentOutcomeObservation({ ...base, metrics: {}, [field]: value }))
        .toThrow(new RegExp(`${field} is forbidden`));
    }
  });

  it('rejects negative and fractional metrics', () => {
    expect(() => buildFounderContentOutcomeObservation({ ...base, metrics: { impressions: -1 } }))
      .toThrow(/metrics\.impressions must be a non-negative integer or null/);
    expect(() => buildFounderContentOutcomeObservation({ ...base, metrics: { impressions: 1.5 } }))
      .toThrow(/metrics\.impressions must be a non-negative integer or null/);
  });

  it('changes the observation hash when observed evidence changes', () => {
    const first = buildFounderContentOutcomeObservation({ ...base, metrics: { impressions: 10 } });
    const second = buildFounderContentOutcomeObservation({ ...base, metrics: { impressions: 11 } });

    expect(first.observation_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.observation_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.observation_hash).not.toBe(second.observation_hash);
  });

  it('signs the exact observation bytes for Chief with an interoperable HMAC test vector', () => {
    const observation = buildFounderContentOutcomeObservation({
      ...base,
      provider_state: 'published',
      provider_receipt_id: 'buffer-receipt-123',
      observed_at: '2026-08-19T21:00:00.000Z',
      metrics: {
        impressions: 1200,
        reactions: 42,
        comments: 9,
        profile_views: 21,
        attributed_visits: 17,
        qualified_conversations: 3,
        attributed_contacts: 2,
        attributed_deals: null,
      },
    });
    const request = buildFounderContentLearningRequest(observation, {
      secret: 'fixture-fcr-learning-secret',
      key_id: 'founder-content-learning-v1',
      issued_at: '2026-08-19T22:00:00.000Z',
    });

    expect(observation.observation_hash).toBe('6421424f851374efc617813190a10c4204585e3e7917dedafdc92bc1301c12d3');
    expect(request.contract).toBe('juss-v10/fcr-founder-content-learning-http@v1');
    expect(request.method).toBe('POST');
    expect(request.path).toBe('/api/chief/founder-content-learning');
    expect(request.body_hash).toBe('33fa996757c1936230db77bc17fb684b1cde25795599a836d94a1383c89f92c2');
    expect(request.headers['X-FCR-Learning-Signature'])
      .toBe('ad79928db19b479541828086bc60fb18714454ca8002eb388f6c61c01093f62d');
    expect(request.authority).toMatchObject({
      source_authentication_only: true,
      learning_authority: 'advisory_only',
      can_authorize_publish: false,
      can_execute: false,
      can_increase_authority: false,
    });
    expect(JSON.stringify(request)).not.toContain('fixture-fcr-learning-secret');
  });

  it('refuses to sign evidence that was tampered after the observation hash was created', () => {
    const observation = buildFounderContentOutcomeObservation({ ...base, metrics: { impressions: 10 } });
    const tampered = {
      ...observation,
      metrics: { ...observation.metrics, impressions: 999 },
    };

    expect(() => buildFounderContentLearningRequest(tampered, {
      secret: 'fixture-fcr-learning-secret',
      key_id: 'founder-content-learning-v1',
      issued_at: '2026-08-19T22:00:00.000Z',
    })).toThrow(/observation_hash does not match outcome identity/);
  });

  it('refuses to sign an observation that tries to launder analytics into publish authority', () => {
    const observation = buildFounderContentOutcomeObservation({ ...base, metrics: {} });
    const widened = {
      ...observation,
      authority: { ...observation.authority, can_authorize_publish: true },
    };

    expect(() => buildFounderContentLearningRequest(widened, {
      secret: 'fixture-fcr-learning-secret',
      key_id: 'founder-content-learning-v1',
      issued_at: '2026-08-19T22:00:00.000Z',
    })).toThrow(/authority must remain advisory-only and non-authorizing/);
  });
});
