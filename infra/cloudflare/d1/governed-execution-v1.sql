-- fcr/governed-execution-workflow@v1
-- D1 is a durable execution journal and local projection only.
-- It is NOT the canonical governance, approval, verification, or terminal truth store.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS execution_journal (
  journal_event_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_payload_canonical TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  previous_event_hash TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (execution_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS execution_projection (
  execution_id TEXT PRIMARY KEY,
  workflow_instance_id TEXT UNIQUE,
  action_spec_hash TEXT NOT NULL,
  plan_hash TEXT,
  authority_snapshot_id TEXT,
  policy_version TEXT NOT NULL,
  status TEXT NOT NULL,
  current_step TEXT,
  reconciliation_state TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_reference_json TEXT,
  canonical_receipt_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS command_claims (
  idempotency_key TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  command_name TEXT NOT NULL,
  command_hash TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL,
  provider_reference_json TEXT,
  reconciled_at TEXT,
  reconciliation_result TEXT,
  FOREIGN KEY (execution_id) REFERENCES execution_projection(execution_id)
);

CREATE TABLE IF NOT EXISTS evidence_index (
  evidence_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  assertion_id TEXT,
  evidence_type TEXT NOT NULL,
  r2_bucket TEXT,
  r2_object_key TEXT,
  object_version TEXT,
  content_hash TEXT NOT NULL,
  canonical_receipt_ref TEXT,
  captured_at TEXT NOT NULL,
  metadata_canonical TEXT,
  FOREIGN KEY (execution_id) REFERENCES execution_projection(execution_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_journal_execution
  ON execution_journal (execution_id, sequence_no);

CREATE INDEX IF NOT EXISTS idx_evidence_index_execution
  ON evidence_index (execution_id, captured_at);

-- Historical journal events are append-only. Projection rows remain mutable by design.
CREATE TRIGGER IF NOT EXISTS execution_journal_no_update
BEFORE UPDATE ON execution_journal
BEGIN
  SELECT RAISE(ABORT, 'execution_journal is append-only');
END;

CREATE TRIGGER IF NOT EXISTS execution_journal_no_delete
BEFORE DELETE ON execution_journal
BEGIN
  SELECT RAISE(ABORT, 'execution_journal is append-only');
END;
