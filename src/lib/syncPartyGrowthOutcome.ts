export const SYNC_PARTY_GROWTH_CONTRACT = 'fcr/sync-party-growth-outcome@v1' as const;
export const SYNC_PARTY_GROWTH_SOURCE = 'https://sync-party-game.mcgill-raylene.workers.dev' as const;

const CAMPAIGN_TOKEN = /^[a-z0-9._:/-]{1,120}$/;
const EXACT_SHA = /^[0-9a-f]{40}$/i;
const KNOWN_EVENTS = [
  'landing_view',
  'play_intent',
  'room_created',
  'room_joined',
  'game_started',
  'game_finished',
  'rematch_started',
] as const;

type KnownEvent = typeof KNOWN_EVENTS[number];
type CountMap = Readonly<Record<string, number>>;

export type SyncPartyGrowthUnknownReason =
  | 'INVALID_CAMPAIGN'
  | 'READ_KEY_MISSING'
  | 'VERSION_UNAVAILABLE'
  | 'VERSION_INVALID'
  | 'SOURCE_NOT_CONFIGURED'
  | 'READ_KEY_REJECTED'
  | 'SOURCE_ERROR'
  | 'SOURCE_INVALID'
  | 'RUNTIME_MOVED_DURING_READ';

export type SyncPartyRuntimeIdentity = Readonly<{
  service: 'sync-party-game';
  sha: string;
  build: string;
}>;

export type SyncPartyRecentGrowthEvent = Readonly<{
  event: KnownEvent;
  seq: number;
  at: number;
  gameSeq: number | null;
  eventFingerprint: string;
}>;

export type SyncPartyGrowthKnown = Readonly<{
  contract: typeof SYNC_PARTY_GROWTH_CONTRACT;
  status: 'KNOWN';
  authority: 'observation_only';
  source: typeof SYNC_PARTY_GROWTH_SOURCE;
  observedAt: string;
  requestedCampaignId: string;
  sourceCampaignKey: string;
  emptyLedger: boolean;
  runtime: SyncPartyRuntimeIdentity;
  campaignFingerprint: string | null;
  sequence: number;
  uniqueVisitors: number;
  funnel: Readonly<Record<KnownEvent, number>>;
  sourceCounts: CountMap;
  mediumCounts: CountMap;
  contentCounts: CountMap;
  firstAt: number | null;
  lastAt: number | null;
  recentEvents: readonly SyncPartyRecentGrowthEvent[];
  semanticBoundaries: Readonly<{
    signups: 'UNKNOWN';
    returningUsers: 'UNKNOWN';
    referrals: 'UNKNOWN';
    paidConversions: 'UNKNOWN';
    note: string;
  }>;
}>;

export type SyncPartyGrowthUnknown = Readonly<{
  contract: typeof SYNC_PARTY_GROWTH_CONTRACT;
  status: 'UNKNOWN';
  authority: 'observation_only';
  source: typeof SYNC_PARTY_GROWTH_SOURCE;
  observedAt: string;
  requestedCampaignId: string | null;
  reason: SyncPartyGrowthUnknownReason;
  runtime: SyncPartyRuntimeIdentity | null;
}>;

export type SyncPartyGrowthOutcome = SyncPartyGrowthKnown | SyncPartyGrowthUnknown;

export interface SyncPartyGrowthRuntimeConfig {
  readKey?: string;
}

export interface ReadSyncPartyGrowthOptions {
  campaignId: string;
  config: SyncPartyGrowthRuntimeConfig;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedToken(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().slice(0, max);
  if (!raw) return null;
  const normalized = raw
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._:/-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-./:]+|[-./:]+$/g, '');
  return normalized && CAMPAIGN_TOKEN.test(normalized) ? normalized : null;
}

function finiteNonNegativeInteger(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeCountMap(value: unknown): CountMap {
  if (!isRecord(value)) return Object.freeze({});
  const output: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    const normalizedKey = normalizedToken(key, 160);
    if (!normalizedKey) continue;
    output[normalizedKey] = finiteNonNegativeInteger(count);
  }
  return Object.freeze(output);
}

function parseRuntime(value: unknown): SyncPartyRuntimeIdentity | null {
  if (!isRecord(value)) return null;
  const service = value.service;
  const sha = typeof value.sha === 'string' ? value.sha.trim().toLowerCase() : '';
  const build = typeof value.build === 'string' ? value.build.trim() : '';
  if (service !== 'sync-party-game' || !EXACT_SHA.test(sha) || !build) return null;
  return Object.freeze({ service: 'sync-party-game', sha, build });
}

function sameRuntime(left: SyncPartyRuntimeIdentity, right: SyncPartyRuntimeIdentity): boolean {
  return left.sha === right.sha && left.build === right.build;
}

function parseRecentEvents(value: unknown): readonly SyncPartyRecentGrowthEvent[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const events: SyncPartyRecentGrowthEvent[] = [];
  for (const item of value.slice(-20)) {
    if (!isRecord(item) || typeof item.event !== 'string') continue;
    if (!KNOWN_EVENTS.includes(item.event as KnownEvent)) continue;
    const fingerprint = typeof item.event_fingerprint === 'string' ? item.event_fingerprint.trim() : '';
    if (!fingerprint) continue;
    events.push(Object.freeze({
      event: item.event as KnownEvent,
      seq: finiteNonNegativeInteger(item.seq),
      at: finiteTimestamp(item.at) ?? 0,
      gameSeq: Number.isInteger(item.game_seq) && Number(item.game_seq) >= 0 ? Number(item.game_seq) : null,
      eventFingerprint: fingerprint.slice(0, 128),
    }));
  }
  return Object.freeze(events);
}

function unknown(
  reason: SyncPartyGrowthUnknownReason,
  now: Date,
  requestedCampaignId: string | null,
  runtime: SyncPartyRuntimeIdentity | null = null,
): SyncPartyGrowthUnknown {
  return Object.freeze({
    contract: SYNC_PARTY_GROWTH_CONTRACT,
    status: 'UNKNOWN',
    authority: 'observation_only',
    source: SYNC_PARTY_GROWTH_SOURCE,
    observedAt: now.toISOString(),
    requestedCampaignId,
    reason,
    runtime,
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readVersion(fetchImpl: typeof fetch): Promise<SyncPartyRuntimeIdentity | null> {
  try {
    const response = await fetchImpl(`${SYNC_PARTY_GROWTH_SOURCE}/api/version`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    return parseRuntime(await readJson(response));
  } catch {
    return null;
  }
}

export function resolveSyncPartyGrowthRuntimeConfig(
  env: Record<string, string | undefined>,
): SyncPartyGrowthRuntimeConfig {
  return {
    readKey: env.SYNC_PARTY_GROWTH_READ_KEY?.trim() || undefined,
  };
}

export async function readSyncPartyGrowthOutcome(
  options: ReadSyncPartyGrowthOptions,
): Promise<SyncPartyGrowthOutcome> {
  const now = (options.now ?? (() => new Date()))();
  const requestedCampaignId = normalizedToken(options.campaignId, 120);
  if (!requestedCampaignId) return unknown('INVALID_CAMPAIGN', now, null);

  const readKey = options.config.readKey?.trim();
  if (!readKey) return unknown('READ_KEY_MISSING', now, requestedCampaignId);

  const fetchImpl = options.fetchImpl ?? fetch;
  const runtimeBefore = await readVersion(fetchImpl);
  if (!runtimeBefore) return unknown('VERSION_UNAVAILABLE', now, requestedCampaignId);

  let response: Response;
  try {
    const url = new URL('/api/growth/summary', SYNC_PARTY_GROWTH_SOURCE);
    url.searchParams.set('campaign', requestedCampaignId);
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-growth-read-key': readKey,
      },
    });
  } catch {
    return unknown('SOURCE_ERROR', now, requestedCampaignId, runtimeBefore);
  }

  if (response.status === 401) return unknown('READ_KEY_REJECTED', now, requestedCampaignId, runtimeBefore);
  if (response.status === 503) return unknown('SOURCE_NOT_CONFIGURED', now, requestedCampaignId, runtimeBefore);
  if (!response.ok) return unknown('SOURCE_ERROR', now, requestedCampaignId, runtimeBefore);

  const body = await readJson(response);
  if (!isRecord(body)) return unknown('SOURCE_INVALID', now, requestedCampaignId, runtimeBefore);

  const runtimeAfter = await readVersion(fetchImpl);
  if (!runtimeAfter) return unknown('VERSION_UNAVAILABLE', now, requestedCampaignId, runtimeBefore);
  if (!sameRuntime(runtimeBefore, runtimeAfter)) {
    return unknown('RUNTIME_MOVED_DURING_READ', now, requestedCampaignId, runtimeAfter);
  }

  const sequence = finiteNonNegativeInteger(body.seq);
  const counters = isRecord(body.counters) ? body.counters : {};
  const funnel = Object.fromEntries(
    KNOWN_EVENTS.map((event) => [event, finiteNonNegativeInteger(counters[event])]),
  ) as Record<KnownEvent, number>;
  const sourceCampaignKey = normalizedToken(body.campaign_key, 120) ?? 'unattributed';
  const campaignFingerprint = typeof body.campaign_fingerprint === 'string' && body.campaign_fingerprint.trim()
    ? body.campaign_fingerprint.trim().slice(0, 128)
    : null;

  return Object.freeze({
    contract: SYNC_PARTY_GROWTH_CONTRACT,
    status: 'KNOWN',
    authority: 'observation_only',
    source: SYNC_PARTY_GROWTH_SOURCE,
    observedAt: now.toISOString(),
    requestedCampaignId,
    sourceCampaignKey,
    emptyLedger: sequence === 0,
    runtime: runtimeBefore,
    campaignFingerprint,
    sequence,
    uniqueVisitors: finiteNonNegativeInteger(body.unique_visitors),
    funnel: Object.freeze(funnel),
    sourceCounts: safeCountMap(body.source_counts),
    mediumCounts: safeCountMap(body.medium_counts),
    contentCounts: safeCountMap(body.content_counts),
    firstAt: finiteTimestamp(body.first_at),
    lastAt: finiteTimestamp(body.last_at),
    recentEvents: parseRecentEvents(body.recent_events),
    semanticBoundaries: Object.freeze({
      signups: 'UNKNOWN',
      returningUsers: 'UNKNOWN',
      referrals: 'UNKNOWN',
      paidConversions: 'UNKNOWN',
      note: 'SYNC growth event counts stay product-native. Rematch is not a cross-session return, and no signup/referral/revenue semantics are inferred.',
    }),
  });
}
