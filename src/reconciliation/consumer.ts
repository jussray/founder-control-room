/**
 * Reconciliation Event Bus Consumer — founder-control-room
 *
 * Subscribes to incoming drift reports from all registered services.
 * Each report is:
 *  1. Validated against the DriftReport schema
 *  2. Persisted to Supabase (reconciliation_events table)
 *  3. Dispatched to the outbox as a `reconciliation.drift` event if drift is found
 *  4. Logged to the Control Room terminal
 *
 * Wire-up: call `startReconciliationConsumer(inbox, outbox)` in src/index.ts
 */
import { createId } from '@paralleldrive/cuid2';
import type { DriftReport, ReconciliationEvent, ReconciliationOutcome } from './types';
import type { Inbox } from '../events/inbox';
import type { Outbox } from '../events/outbox';
import type { SupabaseClient } from '@supabase/supabase-js';

const RECONCILIATION_EVENTS_TABLE = 'reconciliation_events';

export function startReconciliationConsumer(
  inbox: Inbox,
  outbox: Outbox,
  db: SupabaseClient
): void {
  inbox.subscribe('reconciliation.report', async (payload: unknown) => {
    const outcome = await handleDriftReport(payload, outbox, db);
    if (!outcome.ok) {
      console.error('[ReconciliationConsumer] Failed to process report:', outcome.reason);
    }
  });

  console.log('[ReconciliationConsumer] Listening on reconciliation.report');
}

async function handleDriftReport(
  payload: unknown,
  outbox: Outbox,
  db: SupabaseClient
): Promise<ReconciliationOutcome> {
  // 1. Validate shape
  const validation = validateDriftReport(payload);
  if (!validation.ok) {
    return { ok: false, reason: `Invalid DriftReport: ${validation.error}` };
  }
  const report = validation.report;

  // 2. Persist
  const event: ReconciliationEvent = {
    id: createId(),
    receivedAt: new Date().toISOString(),
    report,
  };

  const { error } = await db
    .from(RECONCILIATION_EVENTS_TABLE)
    .insert({
      id: event.id,
      service: report.service,
      status: report.status,
      drift: report.drift,
      received_at: event.receivedAt,
      reported_at: report.timestamp,
      duration_ms: report.durationMs,
    });

  if (error) {
    return { ok: false, reason: `DB insert failed: ${error.message}` };
  }

  // 3. Forward to outbox if drift was detected
  if (report.status === 'drift_detected') {
    await outbox.publish('reconciliation.drift', {
      eventId: event.id,
      service: report.service,
      driftCount: report.drift.length,
      drift: report.drift,
      timestamp: event.receivedAt,
    });
  }

  // 4. Terminal log
  const icon = report.status === 'clean' ? '✅' : '⚠️';
  console.log(
    `[ReconciliationConsumer] ${icon} ${report.service} — ${report.status}` +
      (report.drift.length > 0 ? ` (${report.drift.length} drift items)` : '')
  );

  return { ok: true, eventId: event.id };
}

// ---- Schema validation (no external deps) ----

type ValidationResult =
  | { ok: true; report: DriftReport }
  | { ok: false; error: string };

function validateDriftReport(payload: unknown): ValidationResult {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'payload must be an object' };
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.service !== 'string') return { ok: false, error: 'service must be a string' };
  if (typeof p.timestamp !== 'string') return { ok: false, error: 'timestamp must be a string' };
  if (typeof p.status !== 'string') return { ok: false, error: 'status must be a string' };
  if (!Array.isArray(p.drift)) return { ok: false, error: 'drift must be an array' };
  return { ok: true, report: p as unknown as DriftReport };
}
