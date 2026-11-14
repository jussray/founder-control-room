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
type VersionRead =
  | Readonly<{ identity: SyncPartyRuntimeIdentity; reason: null }>
  | Readonly<{ identity: null; reason: 'VERSION_UNAVAILABLE' | 'VERSION_INVALID' }>;

type ParsedSummary = Readonly<{
  sourceCampaignKey: string;
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
}>;

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

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function parseCountMap(value: unknown): CountMap | null {
  if (!isRecord(value)) return null;
  const output: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    const normalizedKey = normalizedToken(key, 160);
    const normalizedCount = nonNegativeInteger(count);
    if (!normalizedKey || normalizedCount === null) return null;
    output[normalizedKey] = normalizedCount;
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

function parseRecentEvents(value: unknown): readonly SyncPartyRecentGrowthEvent[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const events: SyncPartyRecentGrowthEvent[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.event !== 'string') return null;
    if (!KNOWN_EVENTS.includes(item.event as KnownEvent)) return null;
    const seq = nonNegativeInteger(item.seq);
    const at = finiteTimestamp(item.at);
    const gameSeq = item.game_seq === null ? null : nonNegativeInteger(item.game_seq);
    const fingerprint = typeof item.event_fingerprint === 'string' ? item.event_fingerprint.trim() : '';
    if (seq === null || at === null || (gameSeq === null && item.game_seq !== null) || !fingerprint) return null;
    events.push(Object.freeze({
      event: item.event as KnownEvent,
      seq,
      at,
      gameSeq,
      eventFingerprint: fingerprint.slice(0, 128),
    }));
  }
  return Object.freeze(events);
}

function parseSummary(value: unknown, requestedCampaignId: string): ParsedSummary | null {
  if (!isRecord(value)) return null;

  const sourceCampaignKey = normalizedToken(value.campaign_key, 120);
  const sequence = nonNegativeInteger(value.seq);
  const uniqueVisitors = nonNegativeInteger(value.unique_visitors);
  const sourceCounts = parseCountMap(value.source_counts);
  const mediumCounts = parseCountMap(value.medium_counts);
  const contentCounts = parseCountMap(value.content_counts);
  const recentEvents = parseRecentEvents(value.recent_events);
  const firstAt = value.first_at === null ? null : finiteTimestamp(value.first_at);
  const lastAt = value.last_at === null ? null : finiteTimestamp(value.last_at);

  if (
    !sourceCampaignKey
    || sequence === null
    || uniqueVisitors === null
    || !isRecord(value.counters)
    || sourceCounts === null
    || mediumCounts === null
    || contentCounts === null
    || recentEvents === null
    || (value.first_at !== null && firstAt === null)
    || (value.last_at !== null && lastAt === null)
  ) return null;

  const funnelEntries: Array<[KnownEvent, number]> = [];
  for (const event of KNOWN_EVENTS) {
    const raw = value.counters[event];
    if (raw === undefined) {
      funnelEntries.push([event, 0]);
      continue;
    }
    const count = nonNegativeInteger(raw);
    if (count === null) return null;
    funnelEntries.push([event, count]);
  }

  for (const key of Object.keys(value.counters)) {
    if (!KNOWN_EVENTS.includes(key as KnownEvent)) return null;
  }

  const funnel = Object.freeze(Object.fromEntries(funnelEntries) as Record<KnownEvent, number>);
  const counterTotal = Object.values(funnel).reduce((sum, count) => sum + count, 0);
  if (counterTotal !== sequence || uniqueVisitors > sequence) return null;

  const rawFingerprint = value.campaign_fingerprint;
  const campaignFingerprint = rawFingerprint === null
    ? null
    : typeof rawFingerprint === 'string' && rawFingerprint.trim()
      ? rawFingerprint.trim().slice(0, 128)
      : null;

  if (sequence === 0) {
    if (rawFingerprint !== null || firstAt !== null || lastAt !== null || recentEvents.length !== 0) return null;
  } else {
    if (!campaignFingerprint || !firstAt || !lastAt) return null;
    if (sourceCampaignKey !== requestedCampaignId) return null;
    if (recentEvents.length === 0) return null;
  }

  return Object.freeze({
    sourceCampaignKey,
    campaignFingerprint,
    sequence,
    uniqueVisitors,
    funnel,
    sourceCounts,
    mediumCounts,
    contentCounts,
    firstAt,
    lastAt,
    recentEvents,
  });
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

async function readVersion(fetchImpl: typeof fetch): Promise<VersionRead> {
  try {
    const response = await fetchImpl(`${SYNC_PARTY_GROWTH_SOURCE}/api/version`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return Object.freeze({ identity: null, reason: 'VERSION_UNAVAILABLE' as const });
    const identity = parseRuntime(await readJson(response));
    return identity
      ? Object.freeze({ identity, reason: null })
      : Object.freeze({ identity: null, reason: 'VERSION_INVALID' as const });
  } catch {
    return Object.freeze({ identity: null, reason: 'VERSION_UNAVAILABLE' as const });
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
  const before = await readVersion(fetchImpl);
  if (!before.identity) return unknown(before.reason, now, requestedCampaignId);

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
    return unknown('SOURCE_ERROR', now, requestedCampaignId, before.identity);
  }

  if (response.status === 401) return unknown('READ_KEY_REJECTED', now, requestedCampaignId, before.identity);
  if (response.status === 503) return unknown('SOURCE_NOT_CONFIGURED', now, requestedCampaignId, before.identity);
  if (!response.ok) return unknown('SOURCE_ERROR', now, requestedCampaignId, before.identity);

  const body = await readJson(response);
  const summary = parseSummary(body, requestedCampaignId);
  if (!summary) return unknown('SOURCE_INVALID', now, requestedCampaignId, before.identity);

  const after = await readVersion(fetchImpl);
  if (!after.identity) return unknown(after.reason, now, requestedCampaignId, before.identity);
  if (!sameRuntime(before.identity, after.identity)) {
    return unknown('RUNTIME_MOVED_DURING_READ', now, requestedCampaignId, after.identity);
  }

  return Object.freeze({
    contract: SYNC_PARTY_GROWTH_CONTRACT,
    status: 'KNOWN',
    authority: 'observation_only',
    source: SYNC_PARTY_GROWTH_SOURCE,
    observedAt: now.toISOString(),
    requestedCampaignId,
    sourceCampaignKey: summary.sourceCampaignKey,
    emptyLedger: summary.sequence === 0,
    runtime: before.identity,
    campaignFingerprint: summary.campaignFingerprint,
    sequence: summary.sequence,
    uniqueVisitors: summary.uniqueVisitors,
    funnel: summary.funnel,
    sourceCounts: summary.sourceCounts,
    mediumCounts: summary.mediumCounts,
    contentCounts: summary.contentCounts,
    firstAt: summary.firstAt,
    lastAt: summary.lastAt,
    recentEvents: summary.recentEvents,
    semanticBoundaries: Object.freeze({
      signups: 'UNKNOWN',
      returningUsers: 'UNKNOWN',
      referrals: 'UNKNOWN',
      paidConversions: 'UNKNOWN',
      note: 'SYNC growth event counts stay product-native. Rematch is not a cross-session return, and no signup/referral/revenue semantics are inferred.',
    }),
  });
}
