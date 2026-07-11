/**
 * Transactional controller outbox.
 *
 * Reconcile work is enqueued in the same logical operation as state updates,
 * preventing the "saved to DB but crashed before queuing" split-brain problem.
 *
 * Workers claim entries atomically via FOR UPDATE SKIP LOCKED.
 */

import { supabase } from '../lib/supabaseClient.js';
import type { OutboxEntry } from '../reconciliation/types.js';

export interface EnqueueOptions {
  /** Delay processing until this ISO timestamp (for debounce coalescing) */
  availableAt?: string;
}

/**
 * Enqueue a reconcile request.
 * Coalesces: if an identical (project_id, controller, resource_id) entry
 * already exists and is unclaimed, it updates available_at instead of
 * inserting a duplicate.
 */
export async function enqueueReconcile(
  entry: OutboxEntry,
  opts: EnqueueOptions = {},
): Promise<string> {
  const availableAt = opts.availableAt ?? new Date().toISOString();

  const { data, error } = await supabase
    .from('controller_outbox')
    .upsert(
      {
        project_id: entry.projectId,
        controller: entry.controller,
        resource_id: entry.resourceId ?? null,
        reason: entry.reason,
        source_event_id: entry.sourceEventId ?? null,
        available_at: availableAt,
        attempt_count: 0,
      },
      {
        onConflict: 'project_id,controller,resource_id',
        ignoreDuplicates: false, // update available_at on conflict
      },
    )
    .select('id')
    .single();

  if (error) throw new Error(`Failed to enqueue reconcile: ${error.message}`);
  return data!.id;
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

export async function completeWork(id: string): Promise<void> {
  await supabase
    .from('controller_outbox')
    .update({ completed_at: new Date().toISOString(), claimed_at: null })
    .eq('id', id);
}

export async function failWork(id: string, error: string): Promise<void> {
  await supabase.rpc('fail_outbox_work', { p_id: id, p_error: error });
}
