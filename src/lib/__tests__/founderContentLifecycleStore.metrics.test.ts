import { describe, expect, it, vi } from 'vitest';
import {
  FOUNDER_CONTENT_METRICS_CONTRACT,
  normalizeFounderContentMetricObservation,
} from '../founderContentMetrics.js';
import {
  mutateStoredFounderContentPost,
  type FounderContentLifecycleRepository,
} from '../founderContentLifecycleStore.js';

function mutationInput(data: unknown) {
  return {
    founderUserId: 'founder-1',
    postId: 'post-1',
    expectedStatus: 'posted' as const,
    expectedProviderWriteState: 'verified_published' as const,
    nextStatus: 'posted' as const,
    nextProviderWriteState: 'verified_published' as const,
    patch: { last_metrics_sync_at: '2026-09-17T12:00:00.000Z' },
    eventType: 'metrics_synced',
    actor: 'provider:metricool',
    eventPayload: { data, outcome: 'accepted' },
    now: '2026-09-17T12:00:00.000Z',
  };
}

describe('founder content lifecycle metrics persistence boundary', () => {
  it('recomputes provider-controlled metric receipt hashes before repository persistence', async () => {
    const canonical = normalizeFounderContentMetricObservation({
      provider: 'metricool',
      platform: 'linkedin',
      source: 'aggregator',
      sourceMetricId: 'impressions',
      accountId: 'account-1',
      pageId: 'page-1',
      externalPostId: 'post-1',
      audienceSegment: 'founder',
      metricName: 'impressions',
      metricUnit: 'count',
      metricValue: 42,
      observedAt: '2026-09-17T12:00:00.000Z',
      periodStart: '2026-09-17T00:00:00.000Z',
      periodEnd: '2026-09-17T23:59:59.000Z',
      importKind: 'provider_live',
      provenance: { connector: 'metricool' },
    });
    const forgedSourceRowHash = 'a'.repeat(64);
    const forgedIdempotencyKey = 'b'.repeat(64);
    const mutate = vi.fn(async (value: unknown) => value as never);
    const repository = { mutate } as unknown as FounderContentLifecycleRepository;

    await mutateStoredFounderContentPost(mutationInput({
      contract: FOUNDER_CONTENT_METRICS_CONTRACT,
      observations: [{
        ...canonical,
        sourceRowHash: forgedSourceRowHash,
        idempotencyKey: forgedIdempotencyKey,
      }],
    }), repository);

    expect(mutate).toHaveBeenCalledTimes(1);
    const captured = mutate.mock.calls[0]?.[0] as {
      eventPayload: Record<string, unknown>;
    };
    const persistedData = captured.eventPayload.data as {
      contract: string;
      observations: Array<{ sourceRowHash: string; idempotencyKey: string }>;
    };
    const [persisted] = persistedData.observations;

    expect(persistedData.contract).toBe(FOUNDER_CONTENT_METRICS_CONTRACT);
    expect(persisted.sourceRowHash).toBe(canonical.sourceRowHash);
    expect(persisted.idempotencyKey).toBe(canonical.idempotencyKey);
    expect(persisted.sourceRowHash).not.toBe(forgedSourceRowHash);
    expect(persisted.idempotencyKey).not.toBe(forgedIdempotencyKey);
  });

  it('rejects malformed accepted provider metrics before repository mutation', async () => {
    const mutate = vi.fn(async (value: unknown) => value as never);
    const repository = { mutate } as unknown as FounderContentLifecycleRepository;

    await expect(mutateStoredFounderContentPost(mutationInput({
      contract: FOUNDER_CONTENT_METRICS_CONTRACT,
      observations: [{
        provider: 'metricool',
        platform: 'linkedin',
        source: 'aggregator',
        accountId: 'account-1',
        pageId: '',
        metricName: 'impressions',
        metricUnit: 'count',
        metricValue: 42,
        observedAt: '2026-09-17T12:00:00.000Z',
        importKind: 'provider_live',
      }],
    }), repository)).rejects.toThrow(/FOUNDER_CONTENT_METRICS_REJECTED: pageId is required/);

    expect(mutate).not.toHaveBeenCalled();
  });
});
