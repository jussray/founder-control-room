-- Extend FCR's canonical, already-RLS-protected continuity ledger.
-- No new dashboard/table, no transcript storage, no release authority.
-- Apply only after exact-head review and explicit database migration approval.

alter table public.continuity_records
  add column if not exists task_id text;

alter table public.continuity_records
  add column if not exists execution_state jsonb;

create index if not exists continuity_records_project_task_created_idx
  on public.continuity_records (project_id, task_id, created_at desc)
  where task_id is not null;

comment on column public.continuity_records.task_id is
  'Opaque task identity for founder-authenticated cross-surface continuation.';
comment on column public.continuity_records.execution_state is
  'Reference-only, non-authorizing execution pointer; never store transcripts, secrets, or credentials.';

-- Preserve the stronger server-side-only boundary even on new columns.
alter table public.continuity_records enable row level security;
revoke all on table public.continuity_records from anon, authenticated;
