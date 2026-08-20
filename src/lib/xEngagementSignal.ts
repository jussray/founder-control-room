import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const X_ENGAGEMENT_ACTOR_SLUG = 'apidojo/tweet-scraper';
export const X_ENGAGEMENT_ACTOR_API_ID = 'apidojo~tweet-scraper';
export const X_ENGAGEMENT_PROVIDER = 'apify';
export const X_ENGAGEMENT_SIGNAL_TYPE = 'founder_signal_x_engagement';
export const X_ENGAGEMENT_FETCH_COUNT = 50;
export const X_ENGAGEMENT_TOP_POOL = 40;
export const X_ENGAGEMENT_SAMPLE_SIZE = 10;
export const X_ENGAGEMENT_MIN_REPLIES = 50;
export const X_ENGAGEMENT_WINDOW_HOURS = 48;
export const X_ENGAGEMENT_HARD_MAX_CHARGE_USD = 0.1;

const APIFY_API_BASE = 'https://api.apify.com/v2';
const LIVE_TRUE = new Set(['1', 'true', 'yes', 'on']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const LEASE_TTL_SECONDS = 300;

type UnknownReason =
  | 'LIVE_DISABLED'
  | 'TOKEN_MISSING'
  | 'COST_CAP_MISSING'
  | 'COST_CAP_INVALID'
  | 'INVALID_TOPIC'
  | 'ACTOR_UNAVAILABLE'
  | 'APIFY_ERROR'
  | 'INSUFFICIENT_DATA'
  | 'CACHE_ERROR'
  | 'CACHE_RESERVED'
  | 'CACHE_BUSY';

export type XEngagementKnown = Readonly<{
  status: 'KNOWN';
  topic: string;
  topicMedianEngagement: number;
  sampleSize: number;
  topPoolSize: number;
  qualifyingCount: number;
  source: 'apify';
  actor: typeof X_ENGAGEMENT_ACTOR_SLUG;
  cached: boolean;
  observedAt: string;
  windowStart: string;
  windowEnd: string;
}>;

export type XEngagementUnknown = Readonly<{
  status: 'UNKNOWN';
  topic: string;
  reason: UnknownReason;
  source: 'apify';
  actor: typeof X_ENGAGEMENT_ACTOR_SLUG;
  cached: boolean;
  observedAt: string;
  windowStart: string;
  windowEnd: string;
}>;

export type XEngagementSignal = XEngagementKnown | XEngagementUnknown;

export type XEngagementGate3State =
  | Readonly<{ state: 'HOLD'; reason: UnknownReason }>
  | Readonly<{ state: 'READY_FOR_MEDIAN_COMPARISON'; topicMedianEngagement: number }>;

export interface XEngagementRuntimeConfig {
  liveEnabled: boolean;
  token?: string;
  maxTotalChargeUsd?: number;
}

export interface XEngagementLease {
  leaseKey: string;
  claimedAt: string;
}

export type XEngagementCacheEnvelope = Readonly<{
  version: 1;
  resourceId: string;
  topicKey: string;
  dateKey: string;
  state: 'RESERVED' | 'COMPLETE';
  reservedAt: string;
  result?: XEngagementSignal;
}>;

export interface XEngagementSignalStore {
  get(resourceId: string): Promise<XEngagementCacheEnvelope | null>;
  acquire(resourceId: string): Promise<XEngagementLease | null>;
  reserve(input: {
    resourceId: string;
    topicKey: string;
    dateKey: string;
    reservedAt: string;
  }): Promise<void>;
  complete(input: {
    resourceId: string;
    topicKey: string;
    dateKey: string;
    reservedAt: string;
    result: XEngagementSignal;
  }): Promise<void>;
  release(lease: XEngagementLease): Promise<void>;
}

export interface XEngagementSignalServiceOptions {
  config: XEngagementRuntimeConfig;
  store: XEngagementSignalStore;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface TweetMetrics {
  createdAtMs: number;
  replyCount: number;
  engagement: number;
}

function normalizedTopic(topic: string): string {
  return topic
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function topicKey(topic: string): string {
  return normalizedTopic(topic).toLocaleLowerCase('en-US');
}

function safeSearchPhrase(topic: string): string {
  return normalizedTopic(topic)
    .replace(/["\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function windowFor(now: Date): { start: Date; end: Date } {
  return {
    start: new Date(now.getTime() - X_ENGAGEMENT_WINDOW_HOURS * 60 * 60 * 1000),
    end: now,
  };
}

function actorDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextUtcDate(date: Date): string {
  return actorDate(new Date(date.getTime() + 24 * 60 * 60 * 1000));
}

function resourceId(topic: string, day: string): string {
  const digest = createHash('sha256').update(`${topic}\n${day}`).digest('hex');
  return `x:${day}:${digest}`;
}

function finiteNonNegative(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function parseTweet(item: unknown): TweetMetrics | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  if (typeof row.createdAt !== 'string') return null;
  const createdAtMs = Date.parse(row.createdAt);
  if (!Number.isFinite(createdAtMs)) return null;

  const replyCount = finiteNonNegative(row.replyCount);
  const engagement =
    finiteNonNegative(row.likeCount)
    + finiteNonNegative(row.retweetCount)
    + replyCount
    + finiteNonNegative(row.quoteCount);

  return { createdAtMs, replyCount, engagement };
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median requires at least one value');
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function unknown(
  topic: string,
  reason: UnknownReason,
  now: Date,
  cached = false,
): XEngagementUnknown {
  const window = windowFor(now);
  return Object.freeze({
    status: 'UNKNOWN',
    topic,
    reason,
    source: 'apify',
    actor: X_ENGAGEMENT_ACTOR_SLUG,
    cached,
    observedAt: now.toISOString(),
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
  });
}

function asCached(result: XEngagementSignal): XEngagementSignal {
  return Object.freeze({ ...result, cached: true });
}

function isSignal(value: unknown): value is XEngagementSignal {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.status === 'KNOWN' || row.status === 'UNKNOWN';
}

function parseCacheEnvelope(value: unknown): XEngagementCacheEnvelope | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    row.version !== 1
    || typeof row.resourceId !== 'string'
    || typeof row.topicKey !== 'string'
    || typeof row.dateKey !== 'string'
    || (row.state !== 'RESERVED' && row.state !== 'COMPLETE')
    || typeof row.reservedAt !== 'string'
    || !ISO_DATE.test(row.reservedAt)
  ) return null;

  if (row.state === 'COMPLETE' && !isSignal(row.result)) return null;
  return row as unknown as XEngagementCacheEnvelope;
}

function runtimeConfigError(config: XEngagementRuntimeConfig): UnknownReason | null {
  if (!config.liveEnabled) return 'LIVE_DISABLED';
  if (!config.token?.trim()) return 'TOKEN_MISSING';
  if (typeof config.maxTotalChargeUsd !== 'number' || !Number.isFinite(config.maxTotalChargeUsd)) {
    return 'COST_CAP_MISSING';
  }
  if (config.maxTotalChargeUsd <= 0 || config.maxTotalChargeUsd > X_ENGAGEMENT_HARD_MAX_CHARGE_USD) {
    return 'COST_CAP_INVALID';
  }
  return null;
}

export function resolveXEngagementRuntimeConfig(
  env: Record<string, string | undefined>,
): XEngagementRuntimeConfig {
  const maxCharge = env.X_ENGAGEMENT_MAX_CHARGE_USD?.trim();
  const parsedMaxCharge = maxCharge ? Number(maxCharge) : undefined;
  return {
    liveEnabled: LIVE_TRUE.has((env.X_ENGAGEMENT_LIVE_ENABLED ?? '').trim().toLowerCase()),
    token: env.APIFY_TOKEN?.trim() || undefined,
    maxTotalChargeUsd:
      parsedMaxCharge !== undefined && Number.isFinite(parsedMaxCharge)
        ? parsedMaxCharge
        : undefined,
  };
}

export function gate3StateFromXEngagement(signal: XEngagementSignal): XEngagementGate3State {
  if (signal.status === 'UNKNOWN') {
    return Object.freeze({ state: 'HOLD', reason: signal.reason });
  }
  return Object.freeze({
    state: 'READY_FOR_MEDIAN_COMPARISON',
    topicMedianEngagement: signal.topicMedianEngagement,
  });
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class XEngagementSignalService {
  readonly #config: XEngagementRuntimeConfig;
  readonly #store: XEngagementSignalStore;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #inFlight = new Map<string, Promise<XEngagementSignal>>();
  #actorValidated = false;

  constructor(options: XEngagementSignalServiceOptions) {
    this.#config = options.config;
    this.#store = options.store;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#now = options.now ?? (() => new Date());
  }

  async getTopicEngagement(topicInput: string): Promise<XEngagementSignal> {
    const topic = normalizedTopic(topicInput);
    const now = this.#now();
    if (!topic || topic.length > 120) return unknown(topic, 'INVALID_TOPIC', now);

    const normalized = topicKey(topic);
    const day = dateKey(now);
    const id = resourceId(normalized, day);
    const existingInFlight = this.#inFlight.get(id);
    if (existingInFlight) return existingInFlight;

    const task = this.#getOrFetch({ topic, topicKey: normalized, day, resourceId: id, now });
    this.#inFlight.set(id, task);
    try {
      return await task;
    } finally {
      this.#inFlight.delete(id);
    }
  }

  async #getOrFetch(input: {
    topic: string;
    topicKey: string;
    day: string;
    resourceId: string;
    now: Date;
  }): Promise<XEngagementSignal> {
    let cached: XEngagementCacheEnvelope | null;
    try {
      cached = await this.#store.get(input.resourceId);
    } catch {
      return unknown(input.topic, 'CACHE_ERROR', input.now);
    }

    if (cached?.state === 'COMPLETE' && cached.result) return asCached(cached.result);
    if (cached?.state === 'RESERVED') return unknown(input.topic, 'CACHE_RESERVED', input.now, true);

    const configError = runtimeConfigError(this.#config);
    if (configError) return unknown(input.topic, configError, input.now);

    let lease: XEngagementLease | null;
    try {
      lease = await this.#store.acquire(input.resourceId);
    } catch {
      return unknown(input.topic, 'CACHE_ERROR', input.now);
    }
    if (!lease) return unknown(input.topic, 'CACHE_BUSY', input.now);

    try {
      const secondRead = await this.#store.get(input.resourceId);
      if (secondRead?.state === 'COMPLETE' && secondRead.result) return asCached(secondRead.result);
      if (secondRead?.state === 'RESERVED') return unknown(input.topic, 'CACHE_RESERVED', input.now, true);

      if (!(await this.#validateActor())) return unknown(input.topic, 'ACTOR_UNAVAILABLE', input.now);

      const reservedAt = input.now.toISOString();
      try {
        await this.#store.reserve({
          resourceId: input.resourceId,
          topicKey: input.topicKey,
          dateKey: input.day,
          reservedAt,
        });
      } catch {
        return unknown(input.topic, 'CACHE_ERROR', input.now);
      }

      const result = await this.#runActor(input.topic, input.now);
      try {
        await this.#store.complete({
          resourceId: input.resourceId,
          topicKey: input.topicKey,
          dateKey: input.day,
          reservedAt,
          result,
        });
      } catch {
        return unknown(input.topic, 'CACHE_ERROR', input.now);
      }

      return result;
    } catch {
      return unknown(input.topic, 'CACHE_ERROR', input.now);
    } finally {
      try {
        await this.#store.release(lease);
      } catch {
        // Durable reservation/result state still prevents a second paid topic/day run.
      }
    }
  }

  async #validateActor(): Promise<boolean> {
    if (this.#actorValidated) return true;
    try {
      const response = await this.#fetch(`${APIFY_API_BASE}/acts/${X_ENGAGEMENT_ACTOR_API_ID}`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${this.#config.token}`,
          accept: 'application/json',
        },
      });
      if (!response.ok) return false;
      this.#actorValidated = true;
      return true;
    } catch {
      return false;
    }
  }

  async #runActor(topic: string, now: Date): Promise<XEngagementSignal> {
    const window = windowFor(now);
    const phrase = safeSearchPhrase(topic);
    const maxCharge = this.#config.maxTotalChargeUsd;
    if (!this.#config.token || maxCharge === undefined) return unknown(topic, 'APIFY_ERROR', now);

    const query = new URLSearchParams({
      clean: 'true',
      format: 'json',
      maxItems: String(X_ENGAGEMENT_FETCH_COUNT),
      maxTotalChargeUsd: String(maxCharge),
    });
    const url = `${APIFY_API_BASE}/acts/${X_ENGAGEMENT_ACTOR_API_ID}/run-sync-get-dataset-items?${query}`;
    const actorInput = {
      searchTerms: [`"${phrase}"`],
      sort: 'Top',
      maxItems: X_ENGAGEMENT_FETCH_COUNT,
      minimumReplies: X_ENGAGEMENT_MIN_REPLIES,
      start: actorDate(window.start),
      end: nextUtcDate(window.end),
      includeSearchTerms: true,
    };

    try {
      const response = await this.#fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.#config.token}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(actorInput),
      });
      if (!response.ok) return unknown(topic, 'APIFY_ERROR', now);

      const payload = await readResponseJson(response);
      if (!Array.isArray(payload)) return unknown(topic, 'APIFY_ERROR', now);

      const qualifying = payload
        .map(parseTweet)
        .filter((row): row is TweetMetrics => row !== null)
        .filter((row) => row.replyCount >= X_ENGAGEMENT_MIN_REPLIES)
        .filter((row) => row.createdAtMs >= window.start.getTime() && row.createdAtMs <= window.end.getTime())
        .sort((left, right) => right.engagement - left.engagement);

      if (qualifying.length === 0) return unknown(topic, 'INSUFFICIENT_DATA', now);

      const topPool = qualifying.slice(0, X_ENGAGEMENT_TOP_POOL);
      const sample = topPool.slice(0, X_ENGAGEMENT_SAMPLE_SIZE);
      return Object.freeze({
        status: 'KNOWN',
        topic,
        topicMedianEngagement: median(sample.map((row) => row.engagement)),
        sampleSize: sample.length,
        topPoolSize: topPool.length,
        qualifyingCount: qualifying.length,
        source: 'apify',
        actor: X_ENGAGEMENT_ACTOR_SLUG,
        cached: false,
        observedAt: now.toISOString(),
        windowStart: window.start.toISOString(),
        windowEnd: window.end.toISOString(),
      });
    } catch {
      return unknown(topic, 'APIFY_ERROR', now);
    }
  }
}

export function createSupabaseXEngagementSignalStore(client: SupabaseClient): XEngagementSignalStore {
  const leaseKey = (id: string) => `founder-signal:x-engagement:${id}`;

  return {
    async get(id) {
      const { data, error } = await client
        .from('portfolio_signal_observations')
        .select('observed_state')
        .eq('provider', X_ENGAGEMENT_PROVIDER)
        .eq('signal_type', X_ENGAGEMENT_SIGNAL_TYPE)
        .eq('resource_id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return parseCacheEnvelope(data.observed_state);
    },

    async acquire(id) {
      const key = leaseKey(id);
      const { data: acquired, error: acquireError } = await client.rpc(
        'try_acquire_controller_lease',
        { p_lease_key: key, p_ttl_seconds: LEASE_TTL_SECONDS },
      );
      if (acquireError) throw acquireError;
      if (acquired !== true) return null;

      const { data: lease, error: leaseError } = await client
        .from('controller_leases')
        .select('claimed_at')
        .eq('lease_key', key)
        .single();
      if (leaseError || !lease?.claimed_at) throw leaseError ?? new Error('lease token missing');
      return { leaseKey: key, claimedAt: String(lease.claimed_at) };
    },

    async reserve(input) {
      const envelope: XEngagementCacheEnvelope = Object.freeze({
        version: 1,
        resourceId: input.resourceId,
        topicKey: input.topicKey,
        dateKey: input.dateKey,
        state: 'RESERVED',
        reservedAt: input.reservedAt,
      });
      const { error } = await client.from('portfolio_signal_observations').insert({
        provider: X_ENGAGEMENT_PROVIDER,
        signal_type: X_ENGAGEMENT_SIGNAL_TYPE,
        resource_id: input.resourceId,
        observed_state: envelope,
        observed_at: input.reservedAt,
      });
      if (error) throw error;
    },

    async complete(input) {
      const envelope: XEngagementCacheEnvelope = Object.freeze({
        version: 1,
        resourceId: input.resourceId,
        topicKey: input.topicKey,
        dateKey: input.dateKey,
        state: 'COMPLETE',
        reservedAt: input.reservedAt,
        result: input.result,
      });
      const { error } = await client
        .from('portfolio_signal_observations')
        .update({ observed_state: envelope, observed_at: input.result.observedAt })
        .eq('provider', X_ENGAGEMENT_PROVIDER)
        .eq('signal_type', X_ENGAGEMENT_SIGNAL_TYPE)
        .eq('resource_id', input.resourceId);
      if (error) throw error;
    },

    async release(lease) {
      const { error } = await client
        .from('controller_leases')
        .delete()
        .eq('lease_key', lease.leaseKey)
        .eq('claimed_at', lease.claimedAt);
      if (error) throw error;
    },
  };
}
