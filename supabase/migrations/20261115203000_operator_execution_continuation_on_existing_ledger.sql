-- Extend FCR's canonical, already-RLS-protected continuity ledger.
-- No new dashboard/table, no transcript storage, no release authority.
-- Apply only after exact-head review and explicit database migration approval.

alter table public.continuity_records
  add column if not exists task_id text;

alter table public.continuity_records
  add column if not exists execution_state jsonb;

-- Source observation time, not arrival order, determines the latest resume point.
-- This is historical task context, never a truth-lease renewal.
alter table public.continuity_records
  add column if not exists checkpoint_observed_at timestamptz;

create index if not exists continuity_records_project_task_created_idx
  on public.continuity_records (project_id, task_id, checkpoint_observed_at desc, created_at desc)
  where task_id is not null;

-- A concurrent retry must not create competing checkpoints for one logical
-- task/version. Existing canonical proof rows have task_id null and are excluded.
create unique index if not exists continuity_records_task_observation_unique_idx
  on public.continuity_records (project_id, task_id, checkpoint_observed_at)
  where task_id is not null;


comment on column public.continuity_records.task_id is
  'Opaque task identity for founder-authenticated cross-surface continuation.';
comment on column public.continuity_records.checkpoint_observed_at is
  'Task observation timestamp for ordering, never an approval or renewed truth lease.';
comment on column public.continuity_records.execution_state is
  'Reference-only, non-authorizing execution pointer; never store transcripts, secrets, or credentials.';

-- Preserve the stronger server-side-only boundary even on new columns.
alter table public.continuity_records enable row level security;
revoke all on table public.continuity_records from anon, authenticated;
