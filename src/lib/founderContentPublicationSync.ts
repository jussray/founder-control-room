import type { SupabaseClient } from '@supabase/supabase-js';
import type { TemporallyGovernedFounderPublishResult } from './temporallyGovernedFounderContentExecutor.js';
import {
  getStoredFounderContentPost,
  type FounderContentLifecycleRepository,
  type StoredFounderContentPost,
} from './founderContentLifecycleStore.js';

export const FOUNDER_CONTENT_PUBLICATION_SYNC_CONTRACT =
  'fcr/founder-content-publication-sync@v1' as const;

type JsonRecord = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function firstReason(result: TemporallyGovernedFounderPublishResult): string | null {
  return Array.isArray(result.reasons) && result.reasons.length > 0
    ? text(result.reasons[0]) || null
    : null;
}

export interface FounderContentPublicationSyncInput {
  founderUserId: string;
  postId: string;
  result: TemporallyGovernedFounderPublishResult;
  actor?: string;
  now?: string;
}

export interface FounderContentPublicationSyncRepository {
  sync(input: {
    founderUserId: string;
    postId: string;
    executionId: string;
    truthState: 'PUBLISHED' | 'FAILED' | 'UNKNOWN';
    externalPostId: string | null;
    permalink: string | null;
    publishedAt: string | null;
    error: string | null;
    actor: string;
    observedAt: string;
  }): Promise<boolean>;
}

function supabaseRepository(client: SupabaseClient): FounderContentPublicationSyncRepository {
  return {
    async sync(input) {
      const { error } = await client.rpc('sync_founder_content_post_publication_result', {
        p_post_id: input.postId,
        p_founder_user_id: input.founderUserId,
        p_execution_id: input.executionId,
        p_truth_state: input.truthState,
        p_external_post_id: input.externalPostId,
        p_permalink: input.permalink,
        p_published_at: input.publishedAt,
        p_error: input.error,
        p_actor: input.actor,
        p_observed_at: input.observedAt,
      });
      if (error) throw new Error(error.message);
      return true;
    },
  };
}

async function defaultRepository(): Promise<FounderContentPublicationSyncRepository> {
  const { supabase } = await import('./supabaseClient.js');
  return supabaseRepository(supabase);
}

export async function syncStoredFounderContentPublicationResult(
  input: FounderContentPublicationSyncInput,
  options: {
    repository?: FounderContentPublicationSyncRepository;
    lifecycleRepository?: FounderContentLifecycleRepository;
  } = {},
): Promise<StoredFounderContentPost | null> {
  const founderUserId = text(input.founderUserId);
  const postId = text(input.postId);
  const executionId = text(input.result.executionId);
  if (!founderUserId || !postId) throw new Error('founder user id and post id are required');

  // BLOCKED means FCR did not establish an execution/provider outcome. Keep the
  // editorial state unchanged; the route may append a blocked diagnostic event.
  if (input.result.truthState === 'BLOCKED' || !executionId) {
    return getStoredFounderContentPost(
      founderUserId,
      postId,
      options.lifecycleRepository,
    );
  }

  if (!['PUBLISHED', 'FAILED', 'UNKNOWN'].includes(input.result.truthState)) {
    throw new Error(`unsupported authoritative publication truth state: ${input.result.truthState}`);
  }

  const receipt = input.result.receipt;
  const evidence = record(input.result.providerEvidence);
  const publishedAt = text(receipt?.publishedAt) || text(evidence.publishedAt) || null;
  const externalPostId = text(receipt?.externalPostId) || text(evidence.externalPostId) || null;
  const permalink = text(receipt?.permalink) || text(evidence.permalink) || null;
  const observedAt = input.now ?? new Date().toISOString();
  const actor = text(input.actor) || 'fcr-authoritative-publisher';

  const repository = options.repository ?? await defaultRepository();
  await repository.sync({
    founderUserId,
    postId,
    executionId,
    truthState: input.result.truthState,
    externalPostId,
    permalink,
    publishedAt,
    error: firstReason(input.result),
    actor,
    observedAt,
  });

  return getStoredFounderContentPost(
    founderUserId,
    postId,
    options.lifecycleRepository,
  );
}
