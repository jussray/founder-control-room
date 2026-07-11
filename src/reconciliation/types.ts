/**
 * Core reconciliation domain types.
 * No provider-specific concepts belong here.
 */

export type ReconcileReason =
  | 'provider_event'
  | 'periodic_resync'
  | 'manifest_changed'
  | 'manual_refresh'
  | 'dependency_changed'
  | 'recovery'
  | 'startup';

export type ReconcileStatus =
  | 'converged'
  | 'drifted'
  | 'blocked'
  | 'retry';

export type ProviderKind =
  | 'github'
  | 'cloudflare'
  | 'supabase'
  | 'expo'
  | 'shopify'
  | 'custom';

export type EvidenceKind =
  | 'typecheck'
  | 'lint'
  | 'unit_test'
  | 'integration_test'
  | 'security_scan'
  | 'preview_health'
  | 'deployment_result'
  | 'migration_verification'
  | 'storefront_check'
  | 'artifact_provenance'
  | 'rls_audit';

export type EvidenceStatus = 'pass' | 'fail' | 'warn' | 'pending';

export interface ReconcileRequest {
  projectId: string;
  controller: string;
  resourceId?: string;
  reason: ReconcileReason;
  sourceEventId?: string;
  /** ISO timestamp – do not process before this time (for debounce / delay) */
  availableAt?: string;
}

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
  resourceId: string;
  requiresApproval: boolean;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export interface EvidenceRecord {
  missionId?: string;
  projectId: string;
  subject: string;
  kind: EvidenceKind;
  status: EvidenceStatus;
  provider: ProviderKind;
  commitSha?: string;
  environment?: string;
  detailsRef?: string;
  reusableUntil?: string;
}

export interface ReconcileResult {
  status: ReconcileStatus;
  observedChanges: ObservedChange[];
  proposedActions: ProposedAction[];
  evidenceIds: string[];
  retryAfter?: string;
  requiresApproval: boolean;
  message?: string;
}

/** The shape persisted in controller_outbox.reason */
export interface OutboxEntry {
  projectId: string;
  controller: string;
  resourceId?: string;
  reason: ReconcileReason;
  sourceEventId?: string;
}
