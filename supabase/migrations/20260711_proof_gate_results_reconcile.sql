-- =============================================================================
-- proof_gate_results — forward reconciliation migration
--
-- The table was created by 20260711_proof_gate_results.sql with these columns:
--   id, mission_id, project_id, gate_id, status, evidence, approved_by, ran_at
--
-- The branch code (feat/proof-gate) expected a different schema:
--   mission_id, gate_id, status, all_failures, evidence, approved_by, created_at
-- (no project_id, no ran_at)
--
-- This migration reconciles the live table forward:
--   1. Adds all_failures (text[] — carries gate-detected failure messages).
--   2. Adds created_at as a human-friendly alias to ran_at.
--
-- Does NOT remove project_id or ran_at — both columns exist in the live table
-- and may contain data. Any removal requires a separate decision after
-- confirming live data is empty or migrated.
-- =============================================================================

alter table proof_gate_results
  add column if not exists all_failures text[] not null default array[]::text[];

alter table proof_gate_results
  add column if not exists created_at timestamptz not null default now();

-- Update the existing ordering indexes to include the new column where useful
create index if not exists idx_proof_gate_results_created
  on proof_gate_results (mission_id, gate_id, created_at desc);

comment on column proof_gate_results.all_failures is
  'Merged list of caller-reported and gate-detected failure messages. Empty array = gate passed cleanly.';

comment on column proof_gate_results.created_at is
  'Insertion timestamp (alias to ran_at for forward-compatibility with branch code). Defaults to now().';

comment on column proof_gate_results.ran_at is
  'Original insertion timestamp column. Retained for backwards compatibility. See also: created_at.';
