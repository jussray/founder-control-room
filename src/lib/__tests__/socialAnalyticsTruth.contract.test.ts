import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildSocialAnalyticsObservation,
  validateSocialAnalyticsObservation,
  deriveRate,
} = require('../../../tools/zapier/social-analytics-truth-contract.cjs') as {
  buildSocialAnalyticsObservation: (input: Record<string, unknown>) => Record<string, any>;
  validateSocialAnalyticsObservation: (input: Record<string, unknown>) => Record<string, any>;
  deriveRate: (receipt: Record<string, unknown>, numerator: string, denominator: string) => Record<string, any>;
};

const base = {
  source_observation_hash: 'a'.repeat(64),
  platform: 'instagram',
  provider: 'instagram-cli',
  account_id: '@juss_fn_ray',
  scope: 'post',
  post_id: 'ig-post-1',
  observed_at: '2026-10-03T18:00:00.000Z',
  window: {
    kind: 'rolling_30d',
    start: '2026-09-04T18:00:00.000Z',
    end: '2026-10-03T18:00:00.000Z',
  },
  metrics: {
    views: 100,
    reach: 80,
    likes: 12,
    shares: 4,
    saves: 3,
  },
  metric_definitions: {
    views: 'Provider-native content views for this post and observation window.',
    reach: 'Provider-native unique accounts reached for this post and observation window.',
    likes: 'Provider-native likes for this post and observation window.',
    shares: 'Provider-native shares for this post and observation window.',
    saves: 'Provider-native saves for this post and observation window.',
  },
  evidence_refs: ['instagram-cli:receipt:post-1'],
  truth_state: 'OBSERVED',
};

describe('social analytics truth contract', () => {
  it('binds an observation to one account, post, window, provider, and metric definition', () => {
    const receipt = buildSocialAnalyticsObservation(base);
    expect(receipt.account_id).toBe('@juss_fn_ray');
    expect(receipt.scope).toBe('post');
    expect(receipt.window.kind).toBe('rolling_30d');
    expect(receipt.metrics.views).toBe(100);
    expect(receipt.metric_states.views).toBe('observed');
    expect(receipt.metrics.follower_change).toBeNull();
    expect(receipt.metric_states.follower_change).toBe('UNKNOWN');
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(validateSocialAnalyticsObservation(receipt).receipt_hash).toBe(receipt.receipt_hash);
  });

  it('rejects a rolling window that lacks exact start and end', () => {
    expect(() => buildSocialAnalyticsObservation({
      ...base,
      window: { kind: 'rolling_30d' },
    })).toThrow(/window\.start is required/);
  });

  it('rejects post-level evidence without a post id', () => {
    expect(() => buildSocialAnalyticsObservation({ ...base, post_id: null })).toThrow(/post scope requires a valid post_id/);
  });

  it('rejects account-level evidence that smuggles in a post id', () => {
    expect(() => buildSocialAnalyticsObservation({ ...base, scope: 'account' })).toThrow(/account scope must not contain post_id/);
  });

  it('requires provider-native definitions instead of silently treating unlike metrics as interchangeable', () => {
    const metricDefinitions = { ...base.metric_definitions } as Record<string, string>;
    delete metricDefinitions.views;
    expect(() => buildSocialAnalyticsObservation({ ...base, metric_definitions: metricDefinitions }))
      .toThrow(/metric_definitions\.views is required/);
  });

  it('keeps missing metrics UNKNOWN and preserves an observed zero', () => {
    const receipt = buildSocialAnalyticsObservation({
      ...base,
      metrics: { reach: 0 },
      metric_definitions: { reach: 'Provider-native unique accounts reached.' },
    });
    expect(receipt.metrics.reach).toBe(0);
    expect(receipt.metric_states.reach).toBe('observed');
    expect(receipt.metrics.views).toBeNull();
    expect(receipt.metric_states.views).toBe('UNKNOWN');
  });

  it('allows signed follower deltas without converting them into monthly growth', () => {
    const receipt = buildSocialAnalyticsObservation({
      ...base,
      metrics: { follower_change: -2 },
      metric_definitions: { follower_change: 'Observed follower count delta only for the bound custom range.' },
      window: {
        kind: 'custom_range',
        start: '2026-09-25T00:00:00.000Z',
        end: '2026-10-03T18:00:00.000Z',
      },
    });
    expect(receipt.metrics.follower_change).toBe(-2);
    expect(receipt.window.kind).toBe('custom_range');
  });

  it('derives a rate only from observed metrics on the same receipt', () => {
    const receipt = buildSocialAnalyticsObservation(base);
    const rate = deriveRate(receipt, 'shares', 'reach');
    expect(rate.state).toBe('observed');
    expect(rate.value).toBe(0.05);
    expect(rate.source_receipt_hash).toBe(receipt.receipt_hash);
  });

  it('returns UNKNOWN when the denominator is missing or zero', () => {
    const receipt = buildSocialAnalyticsObservation({
      ...base,
      metrics: { likes: 2 },
      metric_definitions: { likes: 'Provider-native likes.' },
    });
    expect(deriveRate(receipt, 'likes', 'reach').state).toBe('UNKNOWN');
  });

  it('detects receipt tampering', () => {
    const receipt = buildSocialAnalyticsObservation(base);
    expect(() => validateSocialAnalyticsObservation({
      ...receipt,
      account_id: '@some_other_account',
    })).toThrow(/receipt_hash does not match observation identity/);
  });

  it('cannot launder analytics into publication authority', () => {
    const receipt = buildSocialAnalyticsObservation(base);
    expect(() => validateSocialAnalyticsObservation({
      ...receipt,
      authority: { ...receipt.authority, can_publish: true },
    })).toThrow(/authority must remain observation-only/);
  });
});
