-- =============================================================================
-- Harden post-migration advisor findings for guarded terminal and merge audit.
--
-- This migration is intentionally narrow:
--   1. remove the duplicate idempotency index created alongside the UNIQUE key;
--   2. add covering indexes for foreign keys on tables changed by the guarded
--      terminal reconciliation migration;
--   3. evaluate auth.role() once per statement in the two new RLS policies.
-- =============================================================================

begin;

-- The table-level UNIQUE constraint already owns
-- approval_executions_idempotency_key_key. Keep that canonical index and remove
-- the redundant manually-created copy.
drop index if exists public.approval_executions_idempotency;

create index if not exists idx_approval_executions_project
  on public.approval_executions (project_id, started_at desc);

create index if not exists idx_change_proposals_mission
  on public.change_proposals (mission_id)
  where mission_id is not null;

create index if not exists idx_releases_change_proposal
  on public.releases (change_proposal_id)
  where change_proposal_id is not null;

-- Service-role-only remains the authority boundary. Wrapping auth.role() in a
-- scalar subquery prevents per-row re-evaluation without widening access.
drop policy if exists "control_room_service_role_only"
  on public.approval_executions;

create policy "control_room_service_role_only"
  on public.approval_executions
  for all
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists "control_room_service_role_only"
  on public.terminal_runs;

create policy "control_room_service_role_only"
  on public.terminal_runs
  for all
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

commit;
