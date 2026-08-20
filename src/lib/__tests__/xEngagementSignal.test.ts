import { describe, expect, it } from 'vitest';
import {
  X_ENGAGEMENT_ACTOR_API_ID,
  X_ENGAGEMENT_FETCH_COUNT,
  X_ENGAGEMENT_MIN_REPLIES,
  X_ENGAGEMENT_SAMPLE_SIZE,
  X_ENGAGEMENT_TOP_POOL,
  XEngagementSignalService,
  gate3StateFromXEngagement,
  resolveXEngagementRuntimeConfig,
  type XEngagementCacheEnvelope,
  type XEngagementLease,
  type XEngagementSignal,
  type XEngagementSignalStore,
} from '../xEngagementSignal.js';

const FIXED_NOW = new Date('2026-08-19T20:00:00.000Z');

class MemoryStore implements XEngagementSignalStore {
  readonly cache = new Map<string, XEngagementCacheEnvelope>();
  readonly leases = new Set<string>();
  readonly events: string[] = [];
  reserveError = false;
  completeError = false;

  async get(resourceId: string): Promise<XEngagementCacheEnvelope | null> {
    this.events.push(`get:${resourceId}`);
    return this.cache.get(resourceId) ?? null;
  }

  async acquire(resourceId: string): Promise<XEngagementLease | null> {
    this.events.push(`acquire:${resourceId}`);
    if (this.leases.has(resourceId)) return null;
    this.leases.add(resourceId);
    return { leaseKey: resourceId, claimedAt: FIXED_NOW.toISOString() };
  }

  async reserve(input: {
    projectId: string;
    resourceId: string;
    topicKey: string;
    dateKey: string;
    reservedAt: string;
  }): Promise<void> {
    this.events.push(`reserve:${input.resourceId}`);
    if (this.reserveError) throw new Error('reserve failed');
    this.cache.set(input.resourceId, {
      version: 1,
      resourceId: input.resourceId,
      topicKey: input.topicKey,
      dateKey: input.dateKey,
      state: 'RESERVED',
      reservedAt: input.reservedAt,
    });
  }

  async complete(input: {
    projectId: string;
    resourceId: string;
    topicKey: string;
    dateKey: string;
    reservedAt: string;
    result: XEngagementSignal;
  }): Promise<void> {
    this.events.push(`complete:${input.resourceId}`);
    if (this.completeError) throw new Error('complete failed');
    this.cache.set(input.resourceId, {
      version: 1,
      resourceId: input.resourceId,
      topicKey: input.topicKey,
      dateKey: input.dateKey,
      state: 'COMPLETE',
      reservedAt: input.reservedAt,
      result: input.result,
    });
  }

  async release(lease: XEngagementLease): Promise<void> {
    this.events.push(`release:${lease.leaseKey}`);
    this.leases.delete(lease.leaseKey);
  }
}

function tweet({
  hoursAgo = 1,
  likes = 0,
  retweets = 0,
  replies = X_ENGAGEMENT_MIN_REPLIES,
  quotes = 0,
}: {
  hoursAgo?: number;
  likes?: number;
  retweets?: number;
  replies?: number;
  quotes?: number;
} = {}) {
  return {
    createdAt: new Date(FIXED_NOW.getTime() - hoursAgo * 60 * 60 * 1000).toUTCString(),
    likeCount: likes,
    retweetCount: retweets,
    replyCount: replies,
    quoteCount: quotes,
    text: 'raw text must never enter the cache envelope',
    author: { userName: 'not-stored' },
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function liveConfig() {
  return {
    liveEnabled: true,
    token: 'private-test-token',
    maxTotalChargeUsd: 0.05,
  } as const;
}

function fetchHarness(items: unknown[] = [tweet({ likes: 100 })]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith(`/acts/${X_ENGAGEMENT_ACTOR_API_ID}`)) {
      return response({ data: { id: 'actor-id' } });
    }
    return response(items);
  };
  return { calls, fetchImpl };
}

describe('resolveXEngagementRuntimeConfig', () => {
  it('requires an explicit live flag, private token, and explicit cost cap', () => {
    expect(resolveXEngagementRuntimeConfig({})).toEqual({
      liveEnabled: false,
      token: undefined,
      maxTotalChargeUsd: undefined,
    });

    expect(resolveXEngagementRuntimeConfig({
      X_ENGAGEMENT_LIVE_ENABLED: 'true',
      APIFY_TOKEN: ' secret ',
      X_ENGAGEMENT_MAX_CHARGE_USD: '0.05',
    })).toEqual({
      liveEnabled: true,
      token: 'secret',
      maxTotalChargeUsd: 0.05,
    });
  });
});

describe('XEngagementSignalService', () => {
  it('keeps mock-first mode at UNKNOWN -> HOLD with zero provider calls', async () => {
    const store = new MemoryStore();
    const { fetchImpl, calls } = fetchHarness();
    const service = new XEngagementSignalService({
      config: { liveEnabled: false },
      store,
      fetchImpl,
      now: () => FIXED_NOW,
    });

    const result = await service.getTopicEngagement({ projectId: 'project-1', topic: 'lace wigs' });
    expect(result.status).toBe('UNKNOWN');
    expect(result.status === 'UNKNOWN' && result.reason).toBe('LIVE_DISABLED');
    expect(gate3StateFromXEngagement(result)).toEqual({ state: 'HOLD', reason: 'LIVE_DISABLED' });
    expect(calls).toHaveLength(0);
  });

  it('fails closed when a token exists but no founder-set cost cap exists', async () => {
    const store = new MemoryStore();
    const { fetchImpl, calls } = fetchHarness();
    const service = new XEngagementSignalService({
      config: { liveEnabled: true, token: 'secret' },
      store,
      fetchImpl,
      now: () => FIXED_NOW,
    });

    const result = await service.getTopicEngagement({ projectId: 'project-1', topic: 'bundles' });
    expect(result.status).toBe('UNKNOWN');
    expect(result.status === 'UNKNOWN' && result.reason).toBe('COST_CAP_MISSING');
    expect(calls).toHaveLength(0);
  });

  it('validates the exact actor before any paid run and returns UNKNOWN if unavailable', async () => {
    const store = new MemoryStore();
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input));
      return response({ error: 'missing' }, 404);
    };
    const service = new XEngagementSignalService({
      config: liveConfig(),
      store,
      fetchImpl,
      now: () => FIXED_NOW,
    });

    const result = await service.getTopicEngagement({ projectId: 'project-1', topic: 'hair extensions' });
    expect(result.status).toBe('UNKNOWN');
    expect(result.status === 'UNKNOWN' && result.reason).toBe('ACTOR_UNAVAILABLE');
    expect(calls).toEqual([`https://api.apify.com/v2/acts/${X_ENGAGEMENT_ACTOR_API_ID}`]);
    expect(store.events.some((event) => event.startsWith('reserve:'))).toBe(false);
  });

  it('persists a reservation before the paid actor POST so a crash cannot double-spend the topic/day', async () => {
    const store = new MemoryStore();
    const events = store.events;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith(`/acts/${X_ENGAGEMENT_ACTOR_API_ID}`)) return response({ data: { id: 'actor-id' } });
      events.push('provider:paid-post');
      return response([tweet({ likes: 100 })]);
    };
    const service = new XEngagementSignalService({
      config: liveConfig(),
      store,
      fetchImpl,
      now: () => FIXED_NOW,
    });

    const result = await service.getTopicEngagement({ projectId: 'project-1', topic: 'protective styles' });
    expect(result.status).toBe('KNOWN');
    const reserveIndex = events.findIndex((event) => event.startsWith('reserve:'));
    const paidIndex = events.indexOf('provider:paid-post');
    expect(reserveIndex).toBeGreaterThanOrEqual(0);
    expect(paidIndex).toBeGreaterThan(reserveIndex);
  });

  it('treats an existing durable reservation as HOLD and never starts another paid run', async () => {
    const store = new MemoryStore();
    const { fetchImpl, calls } = fetchHarness();
    const seedService = new XEngagementSignalService({
      config: liveConfig(),
      store,
      fetchImpl,
      now: () => FIXED_NOW,
    });
    store.completeError = true;
    const first = await seedService.getTopicEngagement({ projectId: 'project-1', topic: 'closures' });
    expect(first.status).toBe('UNKNOWN');
    expect(first.status === 'UNKNOWN' && first.reason).toBe('CACHE_ERROR');
    const paidCallsAfterFirst = calls.filter((call) => call.init?.method === 'POST').length;
    expect(paidCallsAfterFirst).toBe(1);

    store.completeError = false;
    const secondService = new XEngagementSignalService({
      config: liveConfig(),
      store,
      fetchImpl,
      now: () => FIXED_NOW,
    });
    const second = await secondService.getTopicEngagement({ projectId: 'project-2', topic: 'closures' });
    expect(second.status).toBe('UNKNOWN');
    expect(second.status === 'UNKNOWN' && second.reason).toBe('CACHE_RESERVED');
    expect(gate3StateFromXEngagement(second)).toEqual({ state: 'HOLD', reason: 'CACHE_RESERVED' });
    expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(1);
  });

  it('requests 50 provider rows, locally uses a top-40 pool, and returns the median of the top 10', async () => {
    const rows = Array.from({ length: X_ENGAGEMENT_FETCH_COUNT }, (_, index) => tweet({
      hoursAgo: 1 + (index % 40),
      likes: (index + 1) * 100,
      retweets: 10,
      replies: 50,
      quotes: 5,
    }));
    const store = new MemoryStore();
    const { fetchImpl, calls } = fetchHarness(rows);
    const service = new XEngagementSignalService({
      config: liveConfig(),
      store,
      fetchImpl,
      now: () => FIXED_NOW,
    });

    const result = await service.getTopicEngagement({ projectId: 'project-1', topic: ' lace   wigs ' });
    expect(result.status).toBe('KNOWN');
    if (result.status !== 'KNOWN') throw new Error('expected known result');
    expect(result.topic).toBe('lace wigs');
    expect(result.topicMedianEngagement).toBe(4615);
    expect(result.sampleSize).toBe(X_ENGAGEMENT_SAMPLE_SIZE);
    expect(result.topPoolSize).toBe(X_ENGAGEMENT_TOP_POOL);
    expect(result.qualifyingCount).toBe(X_ENGAGEMENT_FETCH_COUNT);
    expect(gate3StateFromXEngagement(result)).toEqual({
      state: 'READY_FOR_MEDIAN_COMPARISON',
      topicMedianEngagement: 4615,
    });

    const paid = calls.find((call) => call.init?.method === 'POST');
    expect(paid).toBeDefined();
    const paidUrl = new URL(paid!.url);
    expect(paidUrl.searchParams.get('maxItems')).toBe(String(X_ENGAGEMENT_FETCH_COUNT));
    expect(paidUrl.searchParams.get('maxTotalChargeUsd')).toBe('0.05');
    const body = JSON.parse(String(paid!.init?.body)) as Record<string, unknown>;
    expect(body.sort).toBe('Top');
    expect(body.maxItems).toBe(X_ENGAGEMENT_FETCH_COUNT);
    expect(body.minimumReplies).toBe(X_ENGAGEMENT_MIN_REPLIES);
    expect(body.includeSearchTerms).toBe(true);
  });

  it('enforces the exact local 48-hour window and minimum replies after provider output', async () => {
    const rows = [
      tweet({ hoursAgo: 49, likes: 999_999, replies: 500 }),
      tweet({ hoursAgo: 2, likes: 999_999, replies: 49 }),
    ];
    const store = new MemoryStore();
    const { fetchImpl } = fetchHarness(rows);
    const service = new XEngagementSignalService({
      config: liveConfig(),
      store,
      fetchImpl,
      now: () => FIXED_NOW,
    });

    const result = await service.getTopicEngagement({ projectId: 'project-1', topic: 'hair care' });
    expect(result.status).toBe('UNKNOWN');
    expect(result.status === 'UNKNOWN' && result.reason).toBe('INSUFFICIENT_DATA');
    expect(gate3StateFromXEngagement(result)).toEqual({ state: 'HOLD', reason: 'INSUFFICIENT_DATA' });
  });

  it('returns UNKNOWN instead of zero when Apify fails and caches that result for the UTC day', async () => {
    const store = new MemoryStore();
    let postCalls = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith(`/acts/${X_ENGAGEMENT_ACTOR_API_ID}`)) return response({ data: { id: 'actor-id' } });
      if (init?.method === 'POST') postCalls += 1;
      return response({ error: 'rate limited' }, 429);
    };
    const service = new XEngagementSignalService({
      config: liveConfig(),
      store,
      fetchImpl,
      now: () => FIXED_NOW,
    });

    const first = await service.getTopicEngagement({ projectId: 'project-1', topic: 'hair trends' });
    const second = await service.getTopicEngagement({ projectId: 'project-2', topic: '  HAIR trends  ' });
    expect(first.status).toBe('UNKNOWN');
    expect(first.status === 'UNKNOWN' && first.reason).toBe('APIFY_ERROR');
    expect('topicMedianEngagement' in first).toBe(false);
    expect(second.status).toBe('UNKNOWN');
    expect(second.cached).toBe(true);
    expect(postCalls).toBe(1);
  });

  it('shares one topic/day observation across portfolio projects without storing raw tweets', async () => {
    const store = new MemoryStore();
    const { fetchImpl, calls } = fetchHarness([tweet({ likes: 300, retweets: 20, replies: 60, quotes: 5 })]);
    const firstService = new XEngagementSignalService({
      config: liveConfig(),
      store,
      fetchImpl,
      now: () => FIXED_NOW,
    });
    const first = await firstService.getTopicEngagement({ projectId: 'jbh', topic: 'lace wigs' });
    expect(first.status).toBe('KNOWN');

    const secondService = new XEngagementSignalService({
      config: liveConfig(),
      store,
      fetchImpl,
      now: () => FIXED_NOW,
    });
    const second = await secondService.getTopicEngagement({ projectId: 'sweats', topic: 'LACE WIGS' });
    expect(second.status).toBe('KNOWN');
    expect(second.cached).toBe(true);
    expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(1);

    const serializedCache = JSON.stringify([...store.cache.values()]);
    expect(serializedCache).not.toContain('raw text must never enter the cache envelope');
    expect(serializedCache).not.toContain('not-stored');
  });

  it('coalesces concurrent same-topic requests into one paid run', async () => {
    const store = new MemoryStore();
    const { fetchImpl, calls } = fetchHarness([tweet({ likes: 100 })]);
    const service = new XEngagementSignalService({
      config: liveConfig(),
      store,
      fetchImpl,
      now: () => FIXED_NOW,
    });

    const [left, right] = await Promise.all([
      service.getTopicEngagement({ projectId: 'project-1', topic: 'bundles' }),
      service.getTopicEngagement({ projectId: 'project-2', topic: 'bundles' }),
    ]);
    expect(left.status).toBe('KNOWN');
    expect(right.status).toBe('KNOWN');
    expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(1);
  });

  it('uses a new cache key on the next UTC date', async () => {
    const store = new MemoryStore();
    const { fetchImpl, calls } = fetchHarness([tweet({ likes: 100 })]);
    let now = FIXED_NOW;
    const service = new XEngagementSignalService({
      config: liveConfig(),
      store,
      fetchImpl,
      now: () => now,
    });

    const first = await service.getTopicEngagement({ projectId: 'project-1', topic: 'wigs' });
    now = new Date('2026-08-20T20:00:00.000Z');
    const second = await service.getTopicEngagement({ projectId: 'project-1', topic: 'wigs' });
    expect(first.status).toBe('KNOWN');
    expect(second.status).toBe('UNKNOWN');
    expect(second.status === 'UNKNOWN' && second.reason).toBe('INSUFFICIENT_DATA');
    expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(2);
  });
});
