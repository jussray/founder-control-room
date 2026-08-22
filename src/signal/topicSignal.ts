/**
 * Topic signal contract and Gate 3 verdict.
 *
 * This module is deliberately dependency-free and pure. The upstream provider
 * (Apify, or any replacement) is injected as a `TopicSignalSource` rather than
 * imported, for three reasons:
 *
 *  1. No paid-vendor SDK enters the build graph, so adding or replacing the
 *     provider stays a separate, explicitly approved decision rather than an
 *     implicit consequence of merging this file.
 *  2. Every branch is unit-testable with no network and no credentials.
 *  3. The provider stays a replaceable adapter, consistent with the repository's
 *     existing provider-abstraction boundary.
 *
 * Credentials are never read from the environment here. The caller supplies an
 * already-authenticated source.
 */

/** One post as returned by an upstream provider. All fields are untrusted. */
export interface RawTopicPost {
  replyCount?: unknown;
  likeCount?: unknown;
  retweetCount?: unknown;
}

export interface TopicSignalQuery {
  topic: string;
  sinceIso: string;
  maxItems: number;
}

/**
 * Injected provider boundary.
 *
 * Implementations must resolve or reject. A rejection is treated as `unknown`,
 * never as a zero-engagement signal.
 */
export interface TopicSignalSource {
  fetchRecentPosts(query: TopicSignalQuery): Promise<readonly RawTopicPost[]>;
}

/**
 * Discriminated union: the `unknown` variant carries no engagement number at
 * all, so it is structurally impossible for a consumer to read a fabricated `0`
 * without first narrowing on `status`. This is the type-level repair for the
 * false-KILL failure mode.
 */
export type TopicSignal =
  | {
      status: 'ok';
      topic: string;
      medianEngagement: number;
      sampleSize: number;
      cached: boolean;
    }
  | {
      status: 'unknown';
      topic: string;
      reason: string;
      sampleSize: number;
      cached: boolean;
    };

export type GateThreeVerdict = 'BUILD' | 'HOLD' | 'KILL';

export interface TopicSignalOptions {
  now?: () => number;
  cacheTtlMs?: number;
  minReplies?: number;
  windowHours?: number;
  topNForMedian?: number;
  minSampleSize?: number;
  maxItems?: number;
  timeoutMs?: number;
  cache?: TopicSignalCache;
}

export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MIN_REPLIES = 50;
export const DEFAULT_WINDOW_HOURS = 48;
export const DEFAULT_TOP_N_FOR_MEDIAN = 10;
export const DEFAULT_MIN_SAMPLE_SIZE = 3;
export const DEFAULT_MAX_ITEMS = 40;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_CACHE_MAX_ENTRIES = 500;

/** Bounded cache. An unbounded Map leaks in a long-running worker. */
export class TopicSignalCache {
  private readonly entries = new Map<string, { signal: TopicSignal; storedAt: number }>();

  constructor(private readonly maxEntries: number = DEFAULT_CACHE_MAX_ENTRIES) {}

  get(key: string, nowMs: number, ttlMs: number): TopicSignal | null {
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (nowMs - hit.storedAt >= ttlMs) {
      this.entries.delete(key);
      return null;
    }
    // Refresh recency so eviction is least-recently-used, not insertion order.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.signal;
  }

  set(key: string, signal: TopicSignal, nowMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, { signal, storedAt: nowMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Coerce an untrusted provider field to a non-negative finite count.
 *
 * Provider payloads are untrusted data. A numeric string would otherwise
 * string-concatenate during summation and produce a meaningless engagement
 * total, so anything not a finite number resolves to 0.
 */
export function toCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

export function engagementOf(post: RawTopicPost): number {
  return toCount(post.likeCount) + toCount(post.retweetCount) + toCount(post.replyCount);
}

export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

export function topicCacheKey(topic: string, nowMs: number): string {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return `${topic.toLowerCase().trim()}::${day}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`topic signal source timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function unknownSignal(topic: string, reason: string, sampleSize = 0): TopicSignal {
  return { status: 'unknown', topic, reason, sampleSize, cached: false };
}

/**
 * Resolve a topic signal.
 *
 * Never throws for provider failure and never reports a fabricated engagement
 * number. Any failure, timeout, malformed response, or insufficient sample
 * resolves to `status: 'unknown'`, which Gate 3 treats as HOLD.
 */
export async function getTopicSignal(
  topic: string,
  source: TopicSignalSource,
  options: TopicSignalOptions = {},
): Promise<TopicSignal> {
  const now = options.now ?? Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const minReplies = options.minReplies ?? DEFAULT_MIN_REPLIES;
  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS;
  const topN = options.topNForMedian ?? DEFAULT_TOP_N_FOR_MEDIAN;
  const minSampleSize = options.minSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE;
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cache = options.cache;

  const trimmed = topic.trim();
  if (trimmed === '') {
    return unknownSignal(topic, 'topic is empty');
  }

  const nowMs = now();
  const key = topicCacheKey(trimmed, nowMs);

  if (cache) {
    const hit = cache.get(key, nowMs, cacheTtlMs);
    if (hit) return { ...hit, cached: true };
  }

  let posts: readonly RawTopicPost[];
  try {
    // The entire provider interaction is inside this boundary. A failure at any
    // stage -- dispatch, polling, or result listing -- must surface as unknown.
    posts = await withTimeout(
      source.fetchRecentPosts({
        topic: trimmed,
        sinceIso: new Date(nowMs - windowHours * 3_600_000).toISOString(),
        maxItems,
      }),
      timeoutMs,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'topic signal source failed';
    return unknownSignal(trimmed, reason);
  }

  if (!Array.isArray(posts)) {
    return unknownSignal(trimmed, 'topic signal source returned a non-array result');
  }

  const qualified = posts.filter((post) => toCount(post.replyCount) >= minReplies);

  if (qualified.length < minSampleSize) {
    return unknownSignal(
      trimmed,
      `insufficient sample (${qualified.length} posts, min ${minSampleSize} required)`,
      qualified.length,
    );
  }

  // Sort descending by engagement before slicing, so topN is genuinely the top
  // N rather than whichever N the provider happened to return first.
  const engagements = qualified
    .map(engagementOf)
    .sort((a, b) => b - a)
    .slice(0, topN);

  const signal: TopicSignal = {
    status: 'ok',
    topic: trimmed,
    medianEngagement: medianOf(engagements),
    sampleSize: qualified.length,
    cached: false,
  };

  // Only successful signals are cached. Caching a failure would extend one
  // provider outage across the whole TTL window.
  cache?.set(key, signal, nowMs);
  return signal;
}

/**
 * Gate 3.
 *
 *   BUILD — signal verified and at or above the comparison median
 *   HOLD  — signal unverified, or the comparison median is unusable
 *   KILL  — signal verified and below the comparison median
 *
 * KILL requires a verified signal AND a usable threshold. Both an unknown
 * signal and a malformed threshold fail closed to HOLD: a non-finite or
 * negative `userMedian` would otherwise make every comparison false and
 * silently return the permissive BUILD verdict.
 */
export function gateThree(signal: TopicSignal, userMedian: number): GateThreeVerdict {
  if (signal.status !== 'ok') return 'HOLD';
  if (typeof userMedian !== 'number' || !Number.isFinite(userMedian) || userMedian < 0) {
    return 'HOLD';
  }
  return signal.medianEngagement < userMedian ? 'KILL' : 'BUILD';
}

export async function runGateThree(
  topic: string,
  userMedian: number,
  source: TopicSignalSource,
  options: TopicSignalOptions = {},
): Promise<{ verdict: GateThreeVerdict; signal: TopicSignal }> {
  const signal = await getTopicSignal(topic, source, options);
  return { verdict: gateThree(signal, userMedian), signal };
}
