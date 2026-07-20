/**
 * Shared types for the Control Room reconciliation event bus.
 *
 * All three services (founder-control-room, Sekret-Bip, l99-StoryEngine)
 * emit DriftReport objects. The Control Room ingests them via the event bus,
 * stores them, and surfaces them in the dashboard.
 */

export type ServiceName = 'founder-control-room' | 'sekret-bip' | 'l99-story-engine';

export type DriftKind =
  | 'missing_table'
  | 'row_count_zero'
  | 'policy_missing'
  | 'schema_invalid'
  | 'missing_schema'
  | 'manifest_mismatch'
  | 'unknown';

export interface DriftItem {
  type: DriftKind;
  detail: string;
}

export interface DriftReport {
  service: ServiceName;
  timestamp: string;
  durationMs: number;
  status: 'clean' | 'drift_detected';
  drift: DriftItem[];
  /** Optional: number of schemas/tables checked */
  schemasChecked?: number;
}

export interface ReconciliationEvent {
  id: string;            // uuid
  receivedAt: string;    // ISO timestamp when the Control Room ingested the report
  report: DriftReport;
}

export type ReconciliationOutcome =
  | { ok: true; eventId: string }
  | { ok: false; reason: string };
