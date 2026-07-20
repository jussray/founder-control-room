/**
 * Durable provider event inbox.
 *
 * Persists every incoming provider event before any processing.
 * Deduplication key: provider + provider_event_id.
 * Returns the persisted row id for outbox linkage.
 */

import { supabase } from '../lib/supabaseClient.js';
import type { ProviderKind } from '../reconciliation/types.js';

export type InboxHandler = (payload: unknown) => void | Promise<void>;

export interface Inbox {
  publish(topic: string, payload: unknown): Promise<void>;
  subscribe(topic: string, handler: InboxHandler): void;
}

class InMemoryInbox implements Inbox {
  private readonly handlers = new Map<string, Set<InboxHandler>>();

  subscribe(topic: string, handler: InboxHandler): void {
    const topicHandlers = this.handlers.get(topic) ?? new Set<InboxHandler>();
    topicHandlers.add(handler);
    this.handlers.set(topic, topicHandlers);
  }

  async publish(topic: string, payload: unknown): Promise<void> {
    const topicHandlers = this.handlers.get(topic);
    if (!topicHandlers?.size) return;

    await Promise.all([...topicHandlers].map((handler) => handler(payload)));
  }
}

let singletonInbox: Inbox | null = null;

export function getInbox(): Inbox {
  singletonInbox ??= new InMemoryInbox();
  return singletonInbox;
}

export interface RawProviderEvent {
  provider: ProviderKind;
  projectId: string;
  providerEventId: string; // e.g. GitHub delivery GUID
  eventType: string; // e.g. "check_run", "pull_request"
  resourceType: string; // e.g. "check_run", "pull_request", "push"
  resourceId: string; // e.g. check run id, PR number
  payload: Record<string, unknown>;
}

export interface InboxResult {
  id: string;
  isDuplicate: boolean;
}

/**
 * Persist a provider event.
 * If a duplicate arrives (same provider + providerEventId), returns the
 * existing row id with isDuplicate: true so the caller can skip processing.
 */
export async function persistProviderEvent(
  event: RawProviderEvent,
): Promise<InboxResult> {
  const { data, error } = await supabase
    .from('provider_events')
    .upsert(
      {
        provider: event.provider,
        project_id: event.projectId,
        provider_event_id: event.providerEventId,
        event_type: event.eventType,
        resource_type: event.resourceType,
        resource_id: event.resourceId,
        payload: event.payload,
        received_at: new Date().toISOString(),
        processing_status: 'pending',
        attempt_count: 0,
      },
      {
        onConflict: 'provider,provider_event_id',
        ignoreDuplicates: true,
      },
    )
    .select('id, processing_status')
    .single();

  if (error) {
    // If ignoreDuplicates returned nothing, fetch the existing row
    if (error.code === 'PGRST116') {
      const { data: existing } = await supabase
        .from('provider_events')
        .select('id')
        .eq('provider', event.provider)
        .eq('provider_event_id', event.providerEventId)
        .single();
      return { id: existing!.id, isDuplicate: true };
    }
    throw new Error(`Failed to persist provider event: ${error.message}`);
  }

  return { id: data!.id, isDuplicate: false };
}

export async function markEventProcessed(eventId: string): Promise<void> {
  await supabase
    .from('provider_events')
    .update({
      processing_status: 'processed',
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventId);
}

export async function markEventFailed(
  eventId: string,
  error: string,
): Promise<void> {
  const { error: updateError } = await supabase
    .from('provider_events')
    .update({
      processing_status: 'failed',
      last_error: error,
    })
    .eq('id', eventId);

  if (updateError) {
    throw new Error(`Failed to mark provider event failed: ${updateError.message}`);
  }

  const { error: incrementError } = await supabase.rpc('increment_attempt_count', {
    row_id: eventId,
  });

  if (incrementError) {
    throw new Error(`Failed to increment provider event attempts: ${incrementError.message}`);
  }
}
