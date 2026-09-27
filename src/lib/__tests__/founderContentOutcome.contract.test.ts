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

  it('binds product-user learning to one product without mixing investor outcomes', () => {
    const receipt = buildFounderContentOutcomeObservation({
      ...base,
      target: {
        scope: 'product',
        subject_id: 'sekret-bip',
        audience: 'product_user',
        campaign_id: 'bip-proof-loop-1',
      },
      target_metrics: {
        proof_link_clicks: 25,
        signups: 8,
        activations: 5,
        core_actions: 4,
        returning_users: 3,
        referrals: 2,
        paid_conversions: 1,
      },
      measurement_sources: {
        github_proof: ['github:jussray/sekret-bip@abc123'],
        metricool_performance: ['metricool:brand:bip:post:1'],
        exa_external: ['exa:mention:bip:1'],
      },
      metrics: { impressions: 1200, reactions: 42, comments: 9 },
    });

    expect(receipt.target).toEqual({
      scope: 'product',
      subject_id: 'sekret-bip',
      audience: 'product_user',
      campaign_id: 'bip-proof-loop-1',
    });
    expect(receipt.target_metrics.signups).toBe(8);
    expect(receipt.target_metric_states.signups).toBe('observed');
    expect(receipt.target_metrics.investor_meetings).toBeNull();
    expect(receipt.target_metric_states.investor_meetings).toBe('UNKNOWN');
    expect(receipt.measurement_sources.github_proof).toMatchObject({ provider: 'github', state: 'observed' });
    expect(receipt.measurement_sources.metricool_performance).toMatchObject({ provider: 'metricool', state: 'observed' });
    expect(receipt.measurement_sources.exa_external).toMatchObject({ provider: 'exa', state: 'observed' });
    expect(receipt.authority.target_attribution_only).toBe(true);
    expect(receipt.authority.target_metrics_can_authorize_action).toBe(false);
  });

  it('binds investor learning to either a product or portfolio target', () => {
    const receipt = buildFounderContentOutcomeObservation({
      ...base,
      target: {
        scope: 'portfolio',
        subject_id: 'jussray-portfolio',
        audience: 'investor',
        campaign_id: 'investor-proof-1',
      },
      target_metrics: {
        proof_link_clicks: 14,
        qualified_investor_connections: 3,
        investor_conversations: 2,
        investor_introductions: 1,
        investor_meetings: 1,
      },
      measurement_sources: {
        github_proof: ['github:jussray/founder-control-room@abc123'],
        exa_external: ['exa:indexed-post:1'],
      },
      metrics: { impressions: 400, qualified_conversations: 2 },
    });

    expect(receipt.target.audience).toBe('investor');
    expect(receipt.target.scope).toBe('portfolio');
    expect(receipt.target_metrics.investor_meetings).toBe(1);
    expect(receipt.measurement_sources.metricool_performance.state).toBe('UNKNOWN');
    expect(receipt.measurement_sources.metricool_performance.evidence_refs).toEqual([]);
  });

  it('rejects cross-product ambiguity and cross-audience target metrics', () => {
    expect(() => buildFounderContentOutcomeObservation({
      ...base,
      target: { scope: 'portfolio', subject_id: 'portfolio', audience: 'product_user' },
      metrics: {},
    })).toThrow(/product_user observations must bind to target.scope=product/);

    expect(() => buildFounderContentOutcomeObservation({
      ...base,
      target: { scope: 'product', subject_id: 'sekret-bip', audience: 'product_user' },
      target_metrics: { investor_meetings: 1 },
      metrics: {},
    })).toThrow(/does not belong to the product_user audience lane/);

    expect(() => buildFounderContentOutcomeObservation({
      ...base,
      target: { scope: 'product', subject_id: 'founder-control-room', audience: 'investor' },
      target_metrics: { activations: 1 },
      metrics: {},
    })).toThrow(/does not belong to the investor audience lane/);
  });

  it('keeps missing GitHub, Metricool, or Exa coverage UNKNOWN rather than inventing proof', () => {
    const receipt = buildFounderContentOutcomeObservation({
      ...base,
      target: { scope: 'product', subject_id: 'sync-party', audience: 'product_user' },
      target_metrics: { proof_link_clicks: 0 },
      metrics: { impressions: 10 },
    });

    expect(receipt.measurement_sources.github_proof.state).toBe('UNKNOWN');
    expect(receipt.measurement_sources.metricool_performance.state).toBe('UNKNOWN');
    expect(receipt.measurement_sources.exa_external.state).toBe('UNKNOWN');
    expect(receipt.target_metrics.proof_link_clicks).toBe(0);
    expect(receipt.target_metric_states.proof_link_clicks).toBe('observed');
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

  it('changes the observation hash when target attribution changes', () => {
    const first = buildFounderContentOutcomeObservation({
      ...base,
      target: { scope: 'product', subject_id: 'sekret-bip', audience: 'product_user' },
      target_metrics: { signups: 1 },
      metrics: {},
    });
    const second = buildFounderContentOutcomeObservation({
      ...base,
      target: { scope: 'product', subject_id: 'sync-party', audience: 'product_user' },
      target_metrics: { signups: 1 },
      metrics: {},
    });

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

  it('refuses to sign tampered product or audience attribution', () => {
    const observation = buildFounderContentOutcomeObservation({
      ...base,
      target: { scope: 'product', subject_id: 'sekret-bip', audience: 'product_user' },
      target_metrics: { signups: 2 },
      metrics: {},
    });
    const tampered = {
      ...observation,
      target: { ...observation.target, subject_id: 'sync-party' },
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
