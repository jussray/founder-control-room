import type { D1Database } from '@cloudflare/workers-types';

import {
  canonicalJson,
  commandEnvelope,
  sha256Canonical,
  type EvidenceReference,
  type GovernedExecutionEnvelope,
  type ProviderExecutionReceipt,
  type ProviderReconciliation,
} from './governedExecutionV1Contract.js';

type ProjectionRow = {
  execution_id: string;
  action_spec_hash: string;
  plan_hash: string | null;
  authority_snapshot_id: string | null;
  policy_version: string;
  idempotency_key: string;
};

type ClaimRow = {
  idempotency_key: string;
  execution_id: string;
  command_hash: string;
};

function nowIso(now: Date): string {
  return now.toISOString();
}

function journalEventId(executionId: string, eventType: string, payload: unknown): string {
  return sha256Canonical({ executionId, eventType, payload });
}

async function assertReservationMatches(
  db: D1Database,
  envelope: GovernedExecutionEnvelope,
  commandHash: string,
): Promise<void> {
  const projection = await db.prepare(
    `SELECT execution_id, action_spec_hash, plan_hash, authority_snapshot_id, policy_version, idempotency_key
       FROM execution_projection
      WHERE execution_id = ?`,
  ).bind(envelope.actionSpec.executionId).first<ProjectionRow>();

  if (!projection
    || projection.execution_id !== envelope.actionSpec.executionId
    || projection.action_spec_hash !== envelope.actionSpecHash
    || projection.plan_hash !== envelope.planHash
    || projection.authority_snapshot_id !== envelope.authoritySnapshotId
    || projection.policy_version !== envelope.policyVersion
    || projection.idempotency_key !== envelope.idempotencyKey) {
    throw new Error('D1 execution projection conflicts with the governed execution envelope.');
  }

  const claim = await db.prepare(
    `SELECT idempotency_key, execution_id, command_hash
       FROM command_claims
      WHERE idempotency_key = ?`,
  ).bind(envelope.idempotencyKey).first<ClaimRow>();

  if (!claim
    || claim.execution_id !== envelope.actionSpec.executionId
    || claim.command_hash !== commandHash) {
    throw new Error('D1 command claim conflicts with the governed command envelope.');
  }
}

export async function reserveGovernedCommand(
  db: D1Database,
  envelope: GovernedExecutionEnvelope,
  workflowInstanceId: string,
  now = new Date(),
): Promise<{ commandHash: string }> {
  const claimedAt = nowIso(now);
  const command = commandEnvelope(envelope);
  const eventPayload = {
    executionId: envelope.actionSpec.executionId,
    idempotencyKey: envelope.idempotencyKey,
    commandHash: command.sha256,
    actionSpecHash: envelope.actionSpecHash,
    planHash: envelope.planHash,
    authoritySnapshotId: envelope.authoritySnapshotId,
    policyVersion: envelope.policyVersion,
    claimedAt,
  };
  const eventHash = sha256Canonical(eventPayload);
  const eventId = journalEventId(envelope.actionSpec.executionId, 'COMMAND_CLAIMED', eventPayload);

  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO execution_projection (
         execution_id, workflow_instance_id, action_spec_hash, plan_hash,
         authority_snapshot_id, policy_version, status, current_step,
         reconciliation_state, idempotency_key, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'PERMITTED', 'COMMAND_CLAIM', 'NOT_REQUIRED', ?, ?, ?)`,
    ).bind(
      envelope.actionSpec.executionId,
      workflowInstanceId,
      envelope.actionSpecHash,
      envelope.planHash,
      envelope.authoritySnapshotId,
      envelope.policyVersion,
      envelope.idempotencyKey,
      claimedAt,
      claimedAt,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO command_claims (
         idempotency_key, execution_id, command_name, command_hash,
         claimed_at, attempt_count, state
       ) VALUES (?, ?, 'deploy_pinned_revision', ?, ?, 0, 'CLAIMED')`,
    ).bind(
      envelope.idempotencyKey,
      envelope.actionSpec.executionId,
      command.sha256,
      claimedAt,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO execution_journal (
         journal_event_id, execution_id, sequence_no, event_type,
         event_payload_canonical, event_hash, previous_event_hash, created_at
       ) VALUES (?, ?, 1, 'COMMAND_CLAIMED', ?, ?, NULL, ?)`,
    ).bind(
      eventId,
      envelope.actionSpec.executionId,
      canonicalJson(eventPayload),
      eventHash,
      claimedAt,
    ),
  ]);

  await assertReservationMatches(db, envelope, command.sha256);
  return { commandHash: command.sha256 };
}

async function appendJournalEvent(
  db: D1Database,
  executionId: string,
  eventType: string,
  payload: unknown,
  createdAt: string,
): Promise<void> {
  const eventHash = sha256Canonical(payload);
  const eventId = journalEventId(executionId, eventType, payload);

  await db.prepare(
    `INSERT OR IGNORE INTO execution_journal (
       journal_event_id, execution_id, sequence_no, event_type,
       event_payload_canonical, event_hash, previous_event_hash, created_at
     )
     SELECT ?, ?, COALESCE(MAX(sequence_no), 0) + 1, ?, ?, ?,
            (SELECT event_hash FROM execution_journal WHERE execution_id = ? ORDER BY sequence_no DESC LIMIT 1), ?
       FROM execution_journal
      WHERE execution_id = ?`,
  ).bind(
    eventId,
    executionId,
    eventType,
    canonicalJson(payload),
    eventHash,
    executionId,
    createdAt,
    executionId,
  ).run();
}

export async function recordProviderExecutionReceipt(
  db: D1Database,
  envelope: GovernedExecutionEnvelope,
  receipt: ProviderExecutionReceipt,
): Promise<void> {
  if (receipt.executionId !== envelope.actionSpec.executionId
    || receipt.idempotencyKey !== envelope.idempotencyKey) {
    throw new Error('Provider receipt does not bind to this governed execution.');
  }

  const state = receipt.status === 'unknown' ? 'UNKNOWN' : receipt.status.toUpperCase();
  const reconciliation = receipt.status === 'unknown' ? 'REQUIRED' : 'NOT_REQUIRED';

  await db.prepare(
    `UPDATE execution_projection
        SET status = ?, current_step = 'PROVIDER_RECEIPT', reconciliation_state = ?,
            provider_reference_json = ?, updated_at = ?
      WHERE execution_id = ? AND idempotency_key = ?`,
  ).bind(
    state,
    reconciliation,
    receipt.providerReference ? canonicalJson({ providerReference: receipt.providerReference }) : null,
    receipt.observedAt,
    receipt.executionId,
    receipt.idempotencyKey,
  ).run();

  await appendJournalEvent(db, receipt.executionId, 'PROVIDER_RECEIPT', receipt, receipt.observedAt);
}

export async function recordProviderReconciliation(
  db: D1Database,
  envelope: GovernedExecutionEnvelope,
  reconciliation: ProviderReconciliation,
): Promise<void> {
  if (reconciliation.executionId !== envelope.actionSpec.executionId
    || reconciliation.idempotencyKey !== envelope.idempotencyKey) {
    throw new Error('Provider reconciliation does not bind to this governed execution.');
  }

  const status = reconciliation.result === 'unknown'
    ? 'UNKNOWN'
    : reconciliation.result.toUpperCase();
  const reconciliationState = reconciliation.result === 'unknown' ? 'UNRESOLVED' : 'RESOLVED';

  await db.prepare(
    `UPDATE execution_projection
        SET status = ?, current_step = 'RECONCILIATION', reconciliation_state = ?,
            provider_reference_json = COALESCE(?, provider_reference_json), updated_at = ?
      WHERE execution_id = ? AND idempotency_key = ?`,
  ).bind(
    status,
    reconciliationState,
    reconciliation.providerReference
      ? canonicalJson({ providerReference: reconciliation.providerReference })
      : null,
    reconciliation.observedAt,
    reconciliation.executionId,
    reconciliation.idempotencyKey,
  ).run();

  await appendJournalEvent(
    db,
    reconciliation.executionId,
    'PROVIDER_RECONCILIATION',
    reconciliation,
    reconciliation.observedAt,
  );
}

export async function indexEvidenceReference(
  db: D1Database,
  envelope: GovernedExecutionEnvelope,
  evidence: EvidenceReference,
  canonicalReceiptRef?: string,
): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO evidence_index (
       evidence_id, execution_id, assertion_id, evidence_type,
       r2_bucket, r2_object_key, object_version, content_hash,
       canonical_receipt_ref, captured_at, metadata_canonical
     ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    evidence.evidenceId,
    envelope.actionSpec.executionId,
    evidence.evidenceType,
    evidence.r2Bucket ?? null,
    evidence.r2ObjectKey ?? null,
    evidence.objectVersion ?? null,
    evidence.contentHash,
    canonicalReceiptRef ?? null,
    evidence.capturedAt,
    canonicalJson({ indexedBy: GOVERNED_EXECUTION_JOURNAL_METADATA }),
  ).run();
}

const GOVERNED_EXECUTION_JOURNAL_METADATA = 'd1-local-index-not-canonical-truth' as const;
