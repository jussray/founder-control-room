-- Close the live Supabase Security Advisor gaps verified on 2026-08-03.
--
-- The five legacy prototype tables are already handled by
-- 20260723000000_lockdown_legacy_prototype_tables.sql, but production has not
-- applied that migration yet. Re-declaring the final policy here is deliberate:
-- this additive migration also covers founder_users and the repository
-- verification tables, and replaces auth.role()-based policies with direct
-- service_role targeting so the resulting policies do not trigger per-row auth
-- function evaluation warnings.
--
-- No rows are inserted, updated, or deleted. Ordinary database roles remain
-- fail-closed; backend service-role callers retain their existing access.

alter table public.lanes enable row level security;
drop policy if exists "control_room_service_role_only" on public.lanes;
create policy "control_room_service_role_only" on public.lanes
  for all
  to service_role
  using (true)
  with check (true);
revoke all on table public.lanes from anon, authenticated;
grant select, insert, update, delete on table public.lanes to service_role;

alter table public.events enable row level security;
drop policy if exists "control_room_service_role_only" on public.events;
create policy "control_room_service_role_only" on public.events
  for all
  to service_role
  using (true)
  with check (true);
revoke all on table public.events from anon, authenticated;
grant select, insert, update, delete on table public.events to service_role;

alter table public.ooda_steps enable row level security;
drop policy if exists "control_room_service_role_only" on public.ooda_steps;
create policy "control_room_service_role_only" on public.ooda_steps
  for all
  to service_role
  using (true)
  with check (true);
revoke all on table public.ooda_steps from anon, authenticated;
grant select, insert, update, delete on table public.ooda_steps to service_role;

alter table public.escalations enable row level security;
drop policy if exists "control_room_service_role_only" on public.escalations;
create policy "control_room_service_role_only" on public.escalations
  for all
  to service_role
  using (true)
  with check (true);
revoke all on table public.escalations from anon, authenticated;
grant select, insert, update, delete on table public.escalations to service_role;

alter table public.founder_users enable row level security;
drop policy if exists "control_room_service_role_only" on public.founder_users;
create policy "control_room_service_role_only" on public.founder_users
  for all
  to service_role
  using (true)
  with check (true);
revoke all on table public.founder_users from anon, authenticated;
grant select, insert, update, delete on table public.founder_users to service_role;

alter table public.repository_capability_evidence enable row level security;
drop policy if exists "control_room_service_role_only" on public.repository_capability_evidence;
create policy "control_room_service_role_only" on public.repository_capability_evidence
  for all
  to service_role
  using (true)
  with check (true);
revoke all on table public.repository_capability_evidence from anon, authenticated;
grant select, insert, update, delete on table public.repository_capability_evidence to service_role;

alter table public.repository_findings enable row level security;
drop policy if exists "control_room_service_role_only" on public.repository_findings;
create policy "control_room_service_role_only" on public.repository_findings
  for all
  to service_role
  using (true)
  with check (true);
revoke all on table public.repository_findings from anon, authenticated;
grant select, insert, update, delete on table public.repository_findings to service_role;

alter table public.repository_verification_runs enable row level security;
drop policy if exists "control_room_service_role_only" on public.repository_verification_runs;
create policy "control_room_service_role_only" on public.repository_verification_runs
  for all
  to service_role
  using (true)
  with check (true);
revoke all on table public.repository_verification_runs from anon, authenticated;
grant select, insert, update, delete on table public.repository_verification_runs to service_role;

create or replace function public.update_onboarding_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$function$;
