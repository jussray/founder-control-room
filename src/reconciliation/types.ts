/**
 * Shared types for the Control Room reconciliation event bus and controller loop.
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

export type ProviderKind =
  | 'github'
  | 'supabase'
  | 'cloudflare'
  | 'control-room'
  | 'manual'
  | 'system';

export type EvidenceKind =
  | 'typecheck'
  | 'lint'
  | 'unit_test'
  | 'browser_test'
  | 'rls_audit'
  | 'security_scan'
  | 'integration_test'
  | 'artifact_provenance'
  | 'deployment_result'
  | 'manual_attestation';

/**
 * Evidence kinds only GitHub's own systems can attest to — a founder running
 * a guarded-terminal command cannot make a deployment happen on GitHub's
 * infrastructure, so unlike typecheck/lint/unit_test/browser_test/etc.
 * (which the guarded terminal legitimately proves exact-head, as an
 * independently-audited alternative to CI), this kind must come from the
 * signature-verified GitHub webhook path (evidence.provider === 'github'),
 * never a self-reported 'custom' row.
 */
export const WEBHOOK_ONLY_EVIDENCE_KINDS: ReadonlySet<EvidenceKind> = new Set(['deployment_result']);

export type EvidenceStatus = 'pass' | 'fail' | 'warn' | 'pending';

export type ReconcileReason =
  | 'provider_event'
  | 'dependency_changed'
  | 'periodic_resync'
  | 'startup'
  | 'founder_triggered'
  | 'manual'
  | (string & {});

export interface ObservedChange {
  resourceType: string;
  resourceId: string;
  field: string;
  previousValue: unknown;
  newValue: unknown;
}

export interface ProposedAction {
  actionType: string;
  resourceType: string;
  resourceId?: string;
  requiresApproval: boolean;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
}

export interface EvidenceRecord {
  projectId: string;
  missionId?: string;
  subject: string;
  kind: EvidenceKind;
  status: EvidenceStatus;
  provider: ProviderKind;
  commitSha?: string;
  environment?: string;
  detailsRef?: string;
}

export interface ReconcileRequest {
  projectId: string;
  controller: string;
  resourceId?: string;
  reason: ReconcileReason;
  sourceEventId?: string;
  meta?: Record<string, unknown>;
}

export interface ReconcileResult {
  status: 'converged' | 'drifted' | 'blocked' | 'retry';
  observedChanges: ObservedChange[];
  proposedActions: ProposedAction[];
  evidenceIds: string[];
  requiresApproval: boolean;
  retryAfter?: string;
  message?: string;
}

export interface OutboxEntry {
  projectId: string;
  controller: string;
  resourceId?: string | null;
  reason: ReconcileReason;
  sourceEventId?: string | null;
  meta?: Record<string, unknown>;
}
