/**
 * Durable controller work queue.
 *
 * Provider delivery deduplication belongs in provider_events. Each legitimate
 * reconciliation request receives its own outbox row so completed history,
 * retries, and events arriving during active work cannot overwrite one another.
 *
 * Workers claim entries atomically via FOR UPDATE SKIP LOCKED. Completion and
 * terminal abandonment also update linked provider-event state atomically.
 */

import { supabase } from '../lib/supabaseClient.js';
import type { OutboxEntry } from '../reconciliation/types.js';

export type OutboxHandler = (payload: unknown) => void | Promise<void>;

export interface Outbox {
  publish(topic: string, payload: unknown): Promise<void>;
  subscribe(topic: string, handler: OutboxHandler): void;
}

class InMemoryOutbox implements Outbox {
  private readonly handlers = new Map<string, Set<OutboxHandler>>();

  subscribe(topic: string, handler: OutboxHandler): void {
    const topicHandlers = this.handlers.get(topic) ?? new Set<OutboxHandler>();
    topicHandlers.add(handler);
    this.handlers.set(topic, topicHandlers);
  }

  async publish(topic: string, payload: unknown): Promise<void> {
    const topicHandlers = this.handlers.get(topic);
    if (!topicHandlers?.size) {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        bus: 'reconciliation_outbox',
        topic,
        payload,
      }));
      return;
    }

    await Promise.all([...topicHandlers].map((handler) => handler(payload)));
  }
}

let singletonOutbox: Outbox | null = null;

export function getOutbox(): Outbox {
  singletonOutbox ??= new InMemoryOutbox();
  return singletonOutbox;
}

export interface EnqueueOptions {
  /** Delay processing until this ISO timestamp. */
  availableAt?: string;
}

/** Enqueue one durable reconciliation request. */
export async function enqueueReconcile(
  entry: OutboxEntry,
  opts: EnqueueOptions = {},
): Promise<string> {
  const availableAt = opts.availableAt ?? new Date().toISOString();

  const { data, error } = await supabase
    .from('controller_outbox')
    .insert({
      project_id: entry.projectId,
      controller: entry.controller,
      resource_id: entry.resourceId ?? null,
      reason: entry.reason,
      source_event_id: entry.sourceEventId ?? null,
      available_at: availableAt,
      attempt_count: 0,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to enqueue reconcile: ${error.message}`);
  if (!data?.id) throw new Error('Failed to enqueue reconcile: insert returned no id');
  return String(data.id);
}

export interface ClaimedWork {
  id: string;
  projectId: string;
  controller: string;
  resourceId: string | null;
  reason: string;
  sourceEventId: string | null;
  attemptCount: number;
}

/**
 * Claim up to `limit` outbox entries for processing.
 * Uses row-level locking (FOR UPDATE SKIP LOCKED via Postgres function).
 */
export async function claimWork(limit = 10): Promise<ClaimedWork[]> {
  const { data, error } = await supabase.rpc('claim_outbox_work', { p_limit: limit });

  if (error) throw new Error(`Failed to claim outbox work: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    projectId: row.project_id as string,
    controller: row.controller as string,
    resourceId: row.resource_id as string | null,
    reason: row.reason as string,
    sourceEventId: row.source_event_id as string | null,
    attemptCount: row.attempt_count as number,
  }));
}

/** Atomically complete work and mark its source provider event processed. */
export async function completeWork(
  id: string,
  sourceEventId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('complete_outbox_work', {
    p_id: id,
    p_source_event_id: sourceEventId ?? null,
  });

  if (error) throw new Error(`Failed to complete outbox work: ${error.message}`);
}

/** Reschedule retryable work using database-side attempt increment and backoff. */
export async function failWork(id: string, errorMessage: string): Promise<void> {
  const { error } = await supabase.rpc('fail_outbox_work', {
    p_id: id,
    p_error: errorMessage,
  });

  if (error) throw new Error(`Failed to reschedule outbox work: ${error.message}`);
}

/** Atomically stop poison work and mark its source provider event failed. */
export async function abandonWork(
  id: string,
  sourceEventId: string | null,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabase.rpc('abandon_outbox_work', {
    p_id: id,
    p_source_event_id: sourceEventId,
    p_error: errorMessage,
  });

  if (error) throw new Error(`Failed to abandon outbox work: ${error.message}`);
}
