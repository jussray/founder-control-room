-- Founder Control Room V10 capability governance persistence.
--
-- This migration keeps existing approval/execution rows valid while giving new
-- V10 flows durable bindings to the exact Chief AI capability plan, registry
-- snapshot, project, and Git head. New registry and receipt tables are
-- service-role-only; no browser/client policy is introduced here.

begin;

-- -----------------------------------------------------------------------------
-- 1. Bind durable founder approvals to the V10 plan identity when present.
--    Columns stay nullable so historical approvals remain readable.
-- -----------------------------------------------------------------------------
alter table public.approvals
  add column if not exists project_slug text,
  add column if not exists expected_head_sha text,
  add column if not exists capability_plan_hash text,
  add column if not exists registry_hash text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approvals'::regclass
      and conname = 'approvals_v10_head_sha_check'
  ) then
    alter table public.approvals
      add constraint approvals_v10_head_sha_check
      check (expected_head_sha is null or expected_head_sha ~ '^[0-9a-f]{40}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approvals'::regclass
      and conname = 'approvals_v10_plan_hash_check'
  ) then
    alter table public.approvals
      add constraint approvals_v10_plan_hash_check
      check (capability_plan_hash is null or capability_plan_hash ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approvals'::regclass
      and conname = 'approvals_v10_registry_hash_check'
  ) then
    alter table public.approvals
      add constraint approvals_v10_registry_hash_check
      check (registry_hash is null or registry_hash ~ '^[0-9a-f]{64}$');
  end if;
end $$;

create index if not exists approvals_v10_plan_idx
  on public.approvals (capability_plan_hash)
  where capability_plan_hash is not null;

-- -----------------------------------------------------------------------------
-- 2. Bind the actual external-mutation reservation ledger to V10 identity.
--    This is the durable replay/audit boundary used by /approvals/:id/execute.
-- -----------------------------------------------------------------------------
alter table public.approval_executions
  add column if not exists capability_plan_hash text,
  add column if not exists registry_hash text,
  add column if not exists plan_contract text,
  add column if not exists requested_authority text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approval_executions'::regclass
      and conname = 'approval_executions_v10_plan_hash_check'
  ) then
    alter table public.approval_executions
      add constraint approval_executions_v10_plan_hash_check
      check (capability_plan_hash is null or capability_plan_hash ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approval_executions'::regclass
      and conname = 'approval_executions_v10_registry_hash_check'
  ) then
    alter table public.approval_executions
      add constraint approval_executions_v10_registry_hash_check
      check (registry_hash is null or registry_hash ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approval_executions'::regclass
      and conname = 'approval_executions_v10_contract_check'
  ) then
    alter table public.approval_executions
      add constraint approval_executions_v10_contract_check
      check (plan_contract is null or plan_contract = 'juss-v10/capability-plan@v1');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approval_executions'::regclass
      and conname = 'approval_executions_v10_authority_check'
  ) then
    alter table public.approval_executions
      add constraint approval_executions_v10_authority_check
      check (requested_authority is null or requested_authority in ('reason', 'draft', 'reversible', 'privileged'));
  end if;
end $$;

create index if not exists approval_executions_v10_plan_idx
  on public.approval_executions (capability_plan_hash, started_at desc)
  where capability_plan_hash is not null;

-- -----------------------------------------------------------------------------
-- 3. Trusted capability-registry snapshots.
--    A registry hash is not trusted merely because a plan contains it. This
--    table is the durable approval boundary that L1+ runtime checks can resolve.
-- -----------------------------------------------------------------------------
create table if not exists public.capability_registry_snapshots (
  registry_hash text primary key
    check (registry_hash ~ '^[0-9a-f]{64}$'),
  contract text not null default 'juss-v10/capability-registry@v1'
    check (contract = 'juss-v10/capability-registry@v1'),
  status text not null default 'candidate'
    check (status in ('candidate', 'approved', 'retired')),
  entries jsonb not null default '[]'::jsonb
    check (jsonb_typeof(entries) = 'array'),
  approved_by text,
  approved_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    status <> 'approved'
    or (approved_by is not null and length(trim(approved_by)) > 0 and approved_at is not null)
  )
);

comment on table public.capability_registry_snapshots is
  'Founder-approved immutable capability registry snapshots. Plan self-consistency is not registry trust.';

alter table public.capability_registry_snapshots enable row level security;
drop policy if exists "control_room_service_role_only" on public.capability_registry_snapshots;
create policy "control_room_service_role_only" on public.capability_registry_snapshots
  for all
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');
revoke all on table public.capability_registry_snapshots from anon, authenticated;
grant select, insert, update on table public.capability_registry_snapshots to service_role;

create or replace function public.is_v10_registry_approved(candidate_hash text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.capability_registry_snapshots
    where registry_hash = lower(candidate_hash)
      and status = 'approved'
  );
$$;

revoke all on function public.is_v10_registry_approved(text) from public, anon, authenticated;
grant execute on function public.is_v10_registry_approved(text) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Sanitized V10 execution receipts.
--    No raw founder goal, prompt, provider token, or private content is stored.
-- -----------------------------------------------------------------------------
create table if not exists public.capability_execution_receipts (
  receipt_id text primary key
    check (receipt_id ~ '^fcr-conveyor-receipt-v3:[0-9a-f]{64}$'),
  run_id text not null check (length(run_id) between 1 and 200),
  project_slug text not null check (length(project_slug) between 1 and 160),
  expected_head_sha text not null
    check (expected_head_sha ~ '^[0-9a-f]{40}$'),
  capability_plan_hash text not null
    check (capability_plan_hash ~ '^[0-9a-f]{64}$'),
  registry_hash text not null
    references public.capability_registry_snapshots(registry_hash),
  from_stage text not null check (length(from_stage) between 1 and 80),
  to_stage text not null check (length(to_stage) between 1 and 80),
  requested_authority text not null
    check (requested_authority in ('reason', 'draft', 'reversible', 'privileged')),
  execution_status text not null
    check (execution_status in ('accepted', 'completed', 'blocked', 'failed')),
  evidence_digest text
    check (evidence_digest is null or evidence_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (run_id, capability_plan_hash, from_stage, to_stage)
);

comment on table public.capability_execution_receipts is
  'Sanitized V10 execution identity: exact head + plan hash + trusted registry hash + authority. No raw prompt or founder content.';

alter table public.capability_execution_receipts enable row level security;
drop policy if exists "control_room_service_role_only" on public.capability_execution_receipts;
create policy "control_room_service_role_only" on public.capability_execution_receipts
  for all
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');
revoke all on table public.capability_execution_receipts from anon, authenticated;
grant select, insert, update on table public.capability_execution_receipts to service_role;

create index if not exists capability_execution_receipts_project_created_idx
  on public.capability_execution_receipts (project_slug, created_at desc);
create index if not exists capability_execution_receipts_plan_idx
  on public.capability_execution_receipts (capability_plan_hash);

-- -----------------------------------------------------------------------------
-- 5. Resolve the live Supabase security-advisor warning on the public trigger
--    function without touching managed Stripe schema functions.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'update_onboarding_updated_at'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute 'alter function public.update_onboarding_updated_at() set search_path = pg_catalog, public';
  end if;
end $$;

commit;
