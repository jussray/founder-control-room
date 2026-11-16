import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebchatHumanHandoff } from './webchatHumanHandoff.js';

/**
 * Persistence for webchat `/human` handoffs.
 *
 * Rows hold only the sanitized handoff contract fields: hashed anonymous
 * visitor identity, the conversation id, an optional visitor-supplied reason
 * (max 280 chars), and queue state. No raw visitor identity is stored.
 */
export const WEBCHAT_HANDOFF_TABLE = 'webchat_human_handoffs';

export type WebchatHandoffState = 'pending_human' | 'released';
export type WebchatHandoffStoreDisposition = 'stored' | 'duplicate';

export interface WebchatHandoffRow {
  idempotencyKey: string;
  projectId: string;
  brandId: string;
  conversationId: string;
  visitorHash: string;
  reason: string | null;
  state: WebchatHandoffState;
  requestedAt: string;
  releasedAt: string | null;
}

export interface WebchatHandoffStore {
  record(handoff: WebchatHumanHandoff): Promise<WebchatHandoffStoreDisposition>;
  hasOpenHandoff(projectId: string, conversationId: string): Promise<boolean>;
  listPending(limit: number): Promise<WebchatHandoffRow[]>;
  /** Returns false when no pending handoff matched the key. */
  release(idempotencyKey: string, releasedBy: string): Promise<boolean>;
}

const COLUMNS = 'idempotency_key,project_id,brand_id,conversation_id,visitor_hash,reason,state,requested_at,released_at';

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rowFrom(raw: Record<string, unknown>): WebchatHandoffRow {
  return {
    idempotencyKey: str(raw.idempotency_key),
    projectId: str(raw.project_id),
    brandId: str(raw.brand_id),
    conversationId: str(raw.conversation_id),
    visitorHash: str(raw.visitor_hash),
    reason: typeof raw.reason === 'string' ? raw.reason : null,
    state: raw.state === 'released' ? 'released' : 'pending_human',
    requestedAt: str(raw.requested_at),
    releasedAt: typeof raw.released_at === 'string' ? raw.released_at : null,
  };
}

export function createSupabaseWebchatHandoffStore(client: SupabaseClient): WebchatHandoffStore {
  return {
    async record(handoff) {
      const { data, error } = await client
        .from(WEBCHAT_HANDOFF_TABLE)
        .upsert({
          idempotency_key: handoff.idempotencyKey,
          project_id: handoff.projectId,
          brand_id: handoff.brandId,
          conversation_id: handoff.providerConversationId,
          visitor_hash: handoff.providerUserId,
          source_event_id: handoff.sourceEventId,
          reason: handoff.reason,
          state: handoff.state,
          requested_at: handoff.requestedAt,
        }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
        .select('idempotency_key');
      if (error) throw new Error(`webchat handoff store failed: ${error.message}`);
      return (data ?? []).length > 0 ? 'stored' : 'duplicate';
    },

    async hasOpenHandoff(projectId, conversationId) {
      const { count, error } = await client
        .from(WEBCHAT_HANDOFF_TABLE)
        .select('idempotency_key', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('conversation_id', conversationId)
        .eq('state', 'pending_human');
      if (error) throw new Error(`webchat handoff lookup failed: ${error.message}`);
      return (count ?? 0) > 0;
    },

    async listPending(limit) {
      const { data, error } = await client
        .from(WEBCHAT_HANDOFF_TABLE)
        .select(COLUMNS)
        .eq('state', 'pending_human')
        .order('requested_at', { ascending: true })
        .limit(limit);
      if (error) throw new Error(`webchat handoff list failed: ${error.message}`);
      return (data ?? []).map((raw) => rowFrom(raw as Record<string, unknown>));
    },

    async release(idempotencyKey, releasedBy) {
      const { data, error } = await client
        .from(WEBCHAT_HANDOFF_TABLE)
        .update({ state: 'released', released_at: new Date().toISOString(), released_by: releasedBy })
        .eq('idempotency_key', idempotencyKey)
        .eq('state', 'pending_human')
        .select('idempotency_key');
      if (error) throw new Error(`webchat handoff release failed: ${error.message}`);
      return (data ?? []).length > 0;
    },
  };
}
