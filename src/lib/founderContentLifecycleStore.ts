import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FIRST_PARTY_SOCIAL_PLATFORMS,
  type FirstPartySocialPlatform,
} from './firstPartySocialPublisher.js';
import type {
  FounderContentPostStatus,
  FounderContentProviderWriteState,
} from './founderContentLifecycle.js';
// @ts-expect-error -- canonical public-payload hashing remains in the CommonJS founder-content authority contract.
import founderContentAuthorizationContract from '../../tools/founder-content-contracts/founder-content-authorization-contract.cjs';

type JsonRecord = Record<string, unknown>;

interface CanonicalFounderContentHashContract {
  hashPublicPayload(value: unknown): string;
}

const canonicalFounderContent = founderContentAuthorizationContract as CanonicalFounderContentHashContract;

export const FOUNDER_CONTENT_LIFECYCLE_STORE_CONTRACT =
  'fcr/founder-content-lifecycle-store@v1' as const;

export interface StoredFounderContentPost {
  contract: typeof FOUNDER_CONTENT_LIFECYCLE_STORE_CONTRACT;
  postId: string;
  founderUserId: string;
  provider: string;
  platform: FirstPartySocialPlatform;
  accountId: string;
  title: string;
  publicPayload: JsonRecord;
  contentHash: string;
  mediaCount: number;
  status: FounderContentPostStatus;
  providerWriteState: FounderContentProviderWriteState;
  approvalId: string | null;
  executionId: string | null;
  scheduledAt: string | null;
  postedAt: string | null;
  externalPostId: string | null;
  permalink: string | null;
  retryCount: number;
  lastError: string | null;
  lastMetricsSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FounderContentPostEvent {
  eventId: string;
  postId: string;
  founderUserId: string;
  eventType: string;
  actor: string;
  payload: JsonRecord;
  observedAt: string;
}

export interface CreateStoredFounderContentDraftInput {
  founderUserId: string;
  provider: string;
  platform: FirstPartySocialPlatform;
  accountId: string;
  title?: string;
  publicPayload: JsonRecord;
  mediaCount?: number;
  scheduledAt?: string | null;
  actor?: string;
  now?: string;
}

export interface ListStoredFounderContentPostsInput {
  founderUserId: string;
  status?: FounderContentPostStatus | null;
  platform?: FirstPartySocialPlatform | null;
  limit?: number;
}

export interface FounderContentLifecycleMutationInput {
  founderUserId: string;
  postId: string;
  expectedStatus: FounderContentPostStatus;
  expectedProviderWriteState: FounderContentProviderWriteState;
  nextStatus: FounderContentPostStatus;
  nextProviderWriteState: FounderContentProviderWriteState;
  patch?: JsonRecord;
  eventType: string;
  actor?: string;
  eventPayload?: JsonRecord;
  now?: string;
}

export interface FounderContentLifecycleRepository {
  createDraft(input: CreateStoredFounderContentDraftInput & {
    postId: string;
    contentHash: string;
    now: string;
    actor: string;
  }): Promise<StoredFounderContentPost>;
  get(founderUserId: string, postId: string): Promise<StoredFounderContentPost | null>;
  list(input: ListStoredFounderContentPostsInput): Promise<StoredFounderContentPost[]>;
  listEvents(founderUserId: string, postId: string, eventType?: string | null): Promise<FounderContentPostEvent[]>;
  recordEvent(input: {
    founderUserId: string;
    postId: string;
    eventType: string;
    actor: string;
    payload: JsonRecord;
    observedAt: string;
  }): Promise<FounderContentPostEvent>;
  mutate(input: FounderContentLifecycleMutationInput & {
    actor: string;
    eventPayload: JsonRecord;
    now: string;
  }): Promise<StoredFounderContentPost>;
  bulkScheduleIntent(input: {
    founderUserId: string;
    postIds: string[];
    startAt: string;
    intervalMinutes: number;
    actor: string;
    observedAt: string;
  }): Promise<StoredFounderContentPost[]>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function iso(value: unknown): string | null {
  const raw = text(value);
  return raw && Number.isFinite(Date.parse(raw)) ? new Date(Date.parse(raw)).toISOString() : null;
}

function requireIso(value: unknown, label: string): string {
  const normalized = iso(value);
  if (!normalized) throw new Error(`${label} must be a valid timestamp`);
  return normalized;
}

function optionalText(value: unknown): string | null {
  const normalized = text(value);
  return normalized || null;
}

function status(value: unknown): FounderContentPostStatus {
  const candidate = text(value) as FounderContentPostStatus;
  const allowed: FounderContentPostStatus[] = [
    'pending_approval', 'approved', 'scheduled', 'publishing',
    'posted', 'rejected', 'failed', 'outcome_unknown',
  ];
  if (!allowed.includes(candidate)) throw new Error(`invalid founder-content post status: ${candidate || 'blank'}`);
  return candidate;
}

function writeState(value: unknown): FounderContentProviderWriteState {
  const candidate = text(value) as FounderContentProviderWriteState;
  const allowed: FounderContentProviderWriteState[] = [
    'not_attempted', 'attempted', 'verified_published', 'verified_failed', 'unknown',
  ];
  if (!allowed.includes(candidate)) throw new Error(`invalid founder-content provider write state: ${candidate || 'blank'}`);
  return candidate;
}

function platform(value: unknown): FirstPartySocialPlatform {
  const candidate = text(value).toLowerCase() as FirstPartySocialPlatform;
  if (!FIRST_PARTY_SOCIAL_PLATFORMS.includes(candidate)) {
    throw new Error(`unsupported founder-content platform: ${candidate || 'blank'}`);
  }
  return candidate;
}

function normalizePost(row: Record<string, unknown>): StoredFounderContentPost {
  return {
    contract: FOUNDER_CONTENT_LIFECYCLE_STORE_CONTRACT,
    postId: text(row.post_id),
    founderUserId: text(row.founder_user_id),
    provider: text(row.provider),
    platform: platform(row.platform),
    accountId: text(row.account_id),
    title: typeof row.title === 'string' ? row.title : '',
    publicPayload: record(row.public_payload),
    contentHash: text(row.content_hash).toLowerCase(),
    mediaCount: Number(row.media_count ?? 0),
    status: status(row.status),
    providerWriteState: writeState(row.provider_write_state),
    approvalId: optionalText(row.approval_id),
    executionId: optionalText(row.execution_id),
    scheduledAt: iso(row.scheduled_at),
    postedAt: iso(row.posted_at),
    externalPostId: optionalText(row.external_post_id),
    permalink: optionalText(row.permalink),
    retryCount: Number(row.retry_count ?? 0),
    lastError: optionalText(row.last_error),
    lastMetricsSyncAt: iso(row.last_metrics_sync_at),
    createdAt: requireIso(row.created_at, 'created_at'),
    updatedAt: requireIso(row.updated_at, 'updated_at'),
  };
}

function normalizeEvent(row: Record<string, unknown>): FounderContentPostEvent {
  return {
    eventId: text(row.event_id),
    postId: text(row.post_id),
    founderUserId: text(row.founder_user_id),
    eventType: text(row.event_type),
    actor: text(row.actor),
    payload: record(row.payload),
    observedAt: requireIso(row.observed_at, 'observed_at'),
  };
}

function supabaseRepository(client: SupabaseClient): FounderContentLifecycleRepository {
  return {
    async createDraft(input) {
      const { data, error } = await client.rpc('create_founder_content_post_draft', {
        p_post_id: input.postId,
        p_founder_user_id: input.founderUserId,
        p_provider: input.provider,
        p_platform: input.platform,
        p_account_id: input.accountId,
        p_title: input.title ?? '',
        p_public_payload: input.publicPayload,
        p_content_hash: input.contentHash,
        p_media_count: input.mediaCount ?? 0,
        p_scheduled_at: input.scheduledAt ?? null,
        p_actor: input.actor,
        p_created_at: input.now,
      });
      if (error || !data) throw new Error(error?.message || 'founder-content draft create returned no row');
      return normalizePost(data as Record<string, unknown>);
    },

    async get(founderUserId, postId) {
      const { data, error } = await client
        .from('founder_content_posts')
        .select('*')
        .eq('founder_user_id', founderUserId)
        .eq('post_id', postId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? normalizePost(data as Record<string, unknown>) : null;
    },

    async list(input) {
      let query = client
        .from('founder_content_posts')
        .select('*')
        .eq('founder_user_id', input.founderUserId)
        .order('updated_at', { ascending: false })
        .limit(Math.max(1, Math.min(input.limit ?? 50, 200)));
      if (input.status) query = query.eq('status', input.status);
      if (input.platform) query = query.eq('platform', input.platform);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => normalizePost(row as Record<string, unknown>));
    },

    async listEvents(founderUserId, postId, eventType) {
      let query = client
        .from('founder_content_post_events')
        .select('*')
        .eq('founder_user_id', founderUserId)
        .eq('post_id', postId)
        .order('observed_at', { ascending: false })
        .limit(500);
      if (eventType) query = query.eq('event_type', eventType);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => normalizeEvent(row as Record<string, unknown>));
    },

    async recordEvent(input) {
      const { data, error } = await client.rpc('record_founder_content_post_event', {
        p_post_id: input.postId,
        p_founder_user_id: input.founderUserId,
        p_event_type: input.eventType,
        p_actor: input.actor,
        p_payload: input.payload,
        p_observed_at: input.observedAt,
      });
      if (error || !data) throw new Error(error?.message || 'founder-content event create returned no row');
      return normalizeEvent(data as Record<string, unknown>);
    },

    async mutate(input) {
      const { data, error } = await client.rpc('mutate_founder_content_post_lifecycle', {
        p_post_id: input.postId,
        p_founder_user_id: input.founderUserId,
        p_expected_status: input.expectedStatus,
        p_expected_provider_write_state: input.expectedProviderWriteState,
        p_next_status: input.nextStatus,
        p_next_provider_write_state: input.nextProviderWriteState,
        p_patch: input.patch ?? {},
        p_event_type: input.eventType,
        p_actor: input.actor,
        p_event_payload: input.eventPayload,
        p_observed_at: input.now,
      });
      if (error || !data) throw new Error(error?.message || 'founder-content lifecycle mutation returned no row');
      return normalizePost(data as Record<string, unknown>);
    },

    async bulkScheduleIntent(input) {
      const { data, error } = await client.rpc('bulk_set_founder_content_schedule_intent', {
        p_founder_user_id: input.founderUserId,
        p_post_ids: input.postIds,
        p_start_at: input.startAt,
        p_interval_minutes: input.intervalMinutes,
        p_actor: input.actor,
        p_observed_at: input.observedAt,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((row) => normalizePost(row));
    },
  };
}

async function defaultRepository(): Promise<FounderContentLifecycleRepository> {
  const { supabase } = await import('./supabaseClient.js');
  return supabaseRepository(supabase);
}

function normalizeCreateInput(input: CreateStoredFounderContentDraftInput) {
  const founderUserId = text(input.founderUserId);
  const provider = text(input.provider).toLowerCase();
  const accountId = text(input.accountId);
  const actor = text(input.actor) || 'founder';
  const now = requireIso(input.now ?? new Date().toISOString(), 'now');
  if (!founderUserId) throw new Error('authenticated founder user id is required');
  if (!/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(provider)) throw new Error('provider is invalid');
  platform(input.platform);
  if (!accountId) throw new Error('accountId is required');
  if (input.mediaCount !== undefined && (!Number.isInteger(input.mediaCount) || input.mediaCount < 0 || input.mediaCount > 100)) {
    throw new Error('mediaCount must be an integer from 0 through 100');
  }
  const scheduledAt = input.scheduledAt ? requireIso(input.scheduledAt, 'scheduledAt') : null;
  const publicPayload = record(input.publicPayload);
  const contentHash = canonicalFounderContent.hashPublicPayload(publicPayload).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(contentHash)) throw new Error('canonical content hash is invalid');
  return { founderUserId, provider, accountId, actor, now, scheduledAt, publicPayload, contentHash };
}

export async function createStoredFounderContentDraft(
  input: CreateStoredFounderContentDraftInput,
  repository?: FounderContentLifecycleRepository,
): Promise<StoredFounderContentPost> {
  const normalized = normalizeCreateInput(input);
  const store = repository ?? await defaultRepository();
  return store.createDraft({
    ...input,
    ...normalized,
    postId: randomUUID(),
    title: input.title ?? '',
    mediaCount: input.mediaCount ?? 0,
  });
}

export async function getStoredFounderContentPost(
  founderUserId: string,
  postId: string,
  repository?: FounderContentLifecycleRepository,
): Promise<StoredFounderContentPost | null> {
  const store = repository ?? await defaultRepository();
  return store.get(text(founderUserId), text(postId));
}

export async function listStoredFounderContentPosts(
  input: ListStoredFounderContentPostsInput,
  repository?: FounderContentLifecycleRepository,
): Promise<StoredFounderContentPost[]> {
  const store = repository ?? await defaultRepository();
  return store.list({ ...input, founderUserId: text(input.founderUserId) });
}

export async function listStoredFounderContentPostEvents(
  founderUserId: string,
  postId: string,
  eventType?: string | null,
  repository?: FounderContentLifecycleRepository,
): Promise<FounderContentPostEvent[]> {
  const store = repository ?? await defaultRepository();
  return store.listEvents(text(founderUserId), text(postId), eventType ? text(eventType) : null);
}

export async function recordStoredFounderContentPostEvent(
  input: {
    founderUserId: string;
    postId: string;
    eventType: string;
    actor?: string;
    payload: JsonRecord;
    observedAt?: string;
  },
  repository?: FounderContentLifecycleRepository,
): Promise<FounderContentPostEvent> {
  const store = repository ?? await defaultRepository();
  return store.recordEvent({
    founderUserId: text(input.founderUserId),
    postId: text(input.postId),
    eventType: text(input.eventType),
    actor: text(input.actor) || 'founder',
    payload: record(input.payload),
    observedAt: requireIso(input.observedAt ?? new Date().toISOString(), 'observedAt'),
  });
}

export async function mutateStoredFounderContentPost(
  input: FounderContentLifecycleMutationInput,
  repository?: FounderContentLifecycleRepository,
): Promise<StoredFounderContentPost> {
  const store = repository ?? await defaultRepository();
  return store.mutate({
    ...input,
    founderUserId: text(input.founderUserId),
    postId: text(input.postId),
    actor: text(input.actor) || 'founder',
    eventPayload: record(input.eventPayload),
    now: requireIso(input.now ?? new Date().toISOString(), 'now'),
  });
}

export async function bulkScheduleStoredFounderContentPosts(
  input: {
    founderUserId: string;
    postIds: string[];
    startAt: string;
    intervalMinutes?: number;
    actor?: string;
    observedAt?: string;
  },
  repository?: FounderContentLifecycleRepository,
): Promise<StoredFounderContentPost[]> {
  const postIds = input.postIds.map(text).filter(Boolean);
  if (postIds.length !== input.postIds.length || postIds.length < 1) throw new Error('postIds are required');
  const store = repository ?? await defaultRepository();
  return store.bulkScheduleIntent({
    founderUserId: text(input.founderUserId),
    postIds,
    startAt: requireIso(input.startAt, 'startAt'),
    intervalMinutes: input.intervalMinutes ?? 30,
    actor: text(input.actor) || 'founder',
    observedAt: requireIso(input.observedAt ?? new Date().toISOString(), 'observedAt'),
  });
}
