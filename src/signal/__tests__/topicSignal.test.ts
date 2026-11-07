import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CACHE_TTL_MS,
  TopicSignalCache,
  engagementOf,
  gateThree,
  getTopicSignal,
  medianOf,
  runGateThree,
  toCount,
  type RawTopicPost,
  type TopicSignal,
  type TopicSignalSource,
} from '../topicSignal.js';

const NOW = Date.parse('2026-08-20T12:00:00.000Z');
const now = () => NOW;

function post(replyCount: unknown, likeCount: unknown = 0, retweetCount: unknown = 0): RawTopicPost {
  return { replyCount, likeCount, retweetCount };
}

function sourceOf(posts: readonly RawTopicPost[]): TopicSignalSource {
  return { fetchRecentPosts: async () => posts };
}

function failingSource(error: unknown): TopicSignalSource {
  return {
    fetchRecentPosts: async () => {
      throw error;
    },
  };
}

/** Qualifying posts: replyCount at or above the default 50 threshold. */
function qualifying(count: number, engagementEach = 100): RawTopicPost[] {
  return Array.from({ length: count }, () => post(60, engagementEach, 0));
}

describe('toCount — untrusted provider payload coercion', () => {
  it('accepts finite non-negative numbers', () => {
    expect(toCount(0)).toBe(0);
    expect(toCount(42)).toBe(42);
  });

  it('parses numeric strings instead of string-concatenating them', () => {
    expect(toCount('123')).toBe(123);
  });

  it('rejects values that would poison a sum', () => {
    for (const bad of [undefined, null, NaN, Infinity, -5, 'abc', '', {}, [], true]) {
      expect(toCount(bad)).toBe(0);
    }
  });

  it('sums engagement numerically even when the provider returns strings', () => {
    // The original implementation used `?? 0` and would produce "0" + "1" + "2".
    expect(engagementOf({ likeCount: '1', retweetCount: '2', replyCount: '3' })).toBe(6);
  });
});

describe('medianOf', () => {
  it('returns the middle value for odd-length input', () => {
    expect(medianOf([5, 1, 3])).toBe(3);
  });

  it('rounds the mean of the two middle values for even-length input', () => {
    expect(medianOf([1, 2, 3, 4])).toBe(3);
  });

  it('returns 0 for empty input', () => {
    expect(medianOf([])).toBe(0);
  });
});

describe('getTopicSignal — provider failure never fabricates a number', () => {
  it('returns unknown, and carries no engagement field at all, when the source throws', async () => {
    const signal = await getTopicSignal('mcp stateless', failingSource(new Error('apify 503')), { now });

    expect(signal.status).toBe('unknown');
    expect(signal).not.toHaveProperty('medianEngagement');
    if (signal.status === 'unknown') {
      expect(signal.reason).toContain('apify 503');
    }
  });

  it('returns unknown when the source rejects with a non-Error value', async () => {
    const signal = await getTopicSignal('topic', failingSource('string rejection'), { now });
    expect(signal.status).toBe('unknown');
  });

  it('returns unknown when the source exceeds the timeout instead of hanging', async () => {
    const hangingSource: TopicSignalSource = {
      fetchRecentPosts: () => new Promise(() => {}),
    };

    const signal = await getTopicSignal('topic', hangingSource, { now, timeoutMs: 10 });

    expect(signal.status).toBe('unknown');
    if (signal.status === 'unknown') expect(signal.reason).toContain('timed out');
  });

  it('returns unknown when the source resolves a non-array', async () => {
    const bogus = { fetchRecentPosts: async () => null as unknown as RawTopicPost[] };
    const signal = await getTopicSignal('topic', bogus, { now });
    expect(signal.status).toBe('unknown');
  });

  it('returns unknown for an empty topic without calling the source', async () => {
    let called = false;
    const spy: TopicSignalSource = {
      fetchRecentPosts: async () => {
        called = true;
        return [];
      },
    };

    const signal = await getTopicSignal('   ', spy, { now });

    expect(signal.status).toBe('unknown');
    expect(called).toBe(false);
  });
});

describe('getTopicSignal — sampling', () => {
  it('filters out posts below the reply threshold', async () => {
    const signal = await getTopicSignal('topic', sourceOf([post(10), post(20), post(30)]), { now });
    expect(signal.status).toBe('unknown');
    if (signal.status === 'unknown') expect(signal.reason).toContain('insufficient sample');
  });

  it('reports the qualified sample size on an insufficient sample', async () => {
    const signal = await getTopicSignal('topic', sourceOf([post(60), post(60), post(10)]), { now });
    expect(signal.status).toBe('unknown');
    expect(signal.sampleSize).toBe(2);
  });

  it('produces an ok signal once the minimum sample is met', async () => {
    const signal = await getTopicSignal('topic', sourceOf(qualifying(3, 100)), { now });
    expect(signal.status).toBe('ok');
    if (signal.status === 'ok') {
      expect(signal.medianEngagement).toBe(160); // 100 likes + 60 replies
      expect(signal.sampleSize).toBe(3);
    }
  });

  it('takes the top N by engagement, not the first N returned', async () => {
    // Five qualifying posts, ascending engagement, deliberately unsorted input.
    // Top 3 by engagement are 500/400/300 -> median 400.
    // Slicing the first 3 unsorted would instead yield 100/500/300 -> median 300.
    const posts = [post(60, 100), post(60, 500), post(60, 300), post(60, 400), post(60, 200)];

    const signal = await getTopicSignal('topic', sourceOf(posts), { now, topNForMedian: 3 });

    expect(signal.status).toBe('ok');
    if (signal.status === 'ok') expect(signal.medianEngagement).toBe(460); // +60 replies each
  });
});

describe('getTopicSignal — caching', () => {
  it('serves a cached ok signal and marks it cached', async () => {
    const cache = new TopicSignalCache();
    const first = await getTopicSignal('topic', sourceOf(qualifying(3)), { now, cache });
    expect(first.cached).toBe(false);

    // A source that would throw proves the second call never reached it.
    const second = await getTopicSignal('topic', failingSource(new Error('must not be called')), {
      now,
      cache,
    });

    expect(second.status).toBe('ok');
    expect(second.cached).toBe(true);
  });

  it('does not cache failures, so one outage does not persist for the whole TTL', async () => {
    const cache = new TopicSignalCache();
    const failed = await getTopicSignal('topic', failingSource(new Error('down')), { now, cache });
    expect(failed.status).toBe('unknown');
    expect(cache.size).toBe(0);

    const recovered = await getTopicSignal('topic', sourceOf(qualifying(3)), { now, cache });
    expect(recovered.status).toBe('ok');
  });

  it('expires entries after the ttl', async () => {
    const cache = new TopicSignalCache();
    await getTopicSignal('topic', sourceOf(qualifying(3)), { now, cache });

    const later = () => NOW + DEFAULT_CACHE_TTL_MS + 1;
    const afterExpiry = await getTopicSignal('topic', sourceOf(qualifying(3, 999)), {
      now: later,
      cache,
    });

    expect(afterExpiry.cached).toBe(false);
  });

  it('bounds cache growth by evicting the least recently used entry', () => {
    const cache = new TopicSignalCache(2);
    const ok = (topic: string): TopicSignal => ({
      status: 'ok',
      topic,
      medianEngagement: 1,
      sampleSize: 3,
      cached: false,
    });

    cache.set('a', ok('a'), NOW);
    cache.set('b', ok('b'), NOW);
    cache.set('c', ok('c'), NOW);

    expect(cache.size).toBe(2);
    expect(cache.get('a', NOW, DEFAULT_CACHE_TTL_MS)).toBeNull();
    expect(cache.get('c', NOW, DEFAULT_CACHE_TTL_MS)).not.toBeNull();
  });
});

describe('gateThree', () => {
  const okSignal = (medianEngagement: number): TopicSignal => ({
    status: 'ok',
    topic: 'topic',
    medianEngagement,
    sampleSize: 5,
    cached: false,
  });

  const unknown: TopicSignal = {
    status: 'unknown',
    topic: 'topic',
    reason: 'provider down',
    sampleSize: 0,
    cached: false,
  };

  it('BUILDs when a verified signal meets or exceeds the median', () => {
    expect(gateThree(okSignal(600), 524)).toBe('BUILD');
    expect(gateThree(okSignal(524), 524)).toBe('BUILD');
  });

  it('KILLs only on a verified signal below the median', () => {
    expect(gateThree(okSignal(100), 524)).toBe('KILL');
  });

  it('HOLDs on an unknown signal and never KILLs it', () => {
    // The core invariant: a provider outage must not silently kill every idea.
    expect(gateThree(unknown, 524)).toBe('HOLD');
  });

  it('HOLDs rather than BUILDs when the comparison median is unusable', () => {
    // `x < NaN` is false, so a naive comparison returns the permissive BUILD.
    for (const bad of [NaN, Infinity, -1, undefined as unknown as number]) {
      expect(gateThree(okSignal(100), bad)).toBe('HOLD');
    }
  });
});

describe('runGateThree', () => {
  it('HOLDs and reports the reason when the provider fails', async () => {
    const { verdict, signal } = await runGateThree('topic', 524, failingSource(new Error('429')), {
      now,
    });

    expect(verdict).toBe('HOLD');
    expect(signal.status).toBe('unknown');
  });

  it('returns a verified verdict with its signal', async () => {
    const { verdict, signal } = await runGateThree('topic', 100, sourceOf(qualifying(3, 500)), {
      now,
    });

    expect(verdict).toBe('BUILD');
    expect(signal.status).toBe('ok');
  });
});
