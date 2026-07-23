-- Privilege lockdown for the five legacy prototype tables carried since
-- 002_lanes_missions_events.sql (lanes, events, ooda_steps, prototype_evidence,
-- escalations). Each was already documented in config/rls-known-gaps.json as
-- "must remain outside direct authenticated client access" / "service-role
-- only", but that boundary was enforced only by application convention
-- (src/lib/queries.ts calling through supabaseAdmin(), the service-role
-- client) — never by the database itself. A leaked anon/publishable key, or
-- any future code path that constructs a client with a non-service-role key,
-- could read or write these tables directly with no RLS in the way.
--
-- This migration makes the already-documented boundary real: enable RLS,
-- apply the same service-role-only policy already used for
-- approval_executions/terminal_runs/evidence, and revoke the default
-- anon/authenticated grants outright so a missing or misconfigured policy
-- fails closed rather than open.
--
-- No application behavior changes: every caller of these tables already
-- goes through supabaseAdmin() (service_role), which is unaffected by RLS.

alter table lanes enable row level security;
drop policy if exists "control_room_service_role_only" on lanes;
create policy "control_room_service_role_only" on lanes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table lanes from anon, authenticated;
grant select, insert, update, delete on table lanes to service_role;

alter table events enable row level security;
drop policy if exists "control_room_service_role_only" on events;
create policy "control_room_service_role_only" on events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table events from anon, authenticated;
grant select, insert, update, delete on table events to service_role;

alter table ooda_steps enable row level security;
drop policy if exists "control_room_service_role_only" on ooda_steps;
create policy "control_room_service_role_only" on ooda_steps
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table ooda_steps from anon, authenticated;
grant select, insert, update, delete on table ooda_steps to service_role;

alter table prototype_evidence enable row level security;
drop policy if exists "control_room_service_role_only" on prototype_evidence;
create policy "control_room_service_role_only" on prototype_evidence
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table prototype_evidence from anon, authenticated;
grant select, insert, update, delete on table prototype_evidence to service_role;

alter table escalations enable row level security;
drop policy if exists "control_room_service_role_only" on escalations;
create policy "control_room_service_role_only" on escalations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table escalations from anon, authenticated;
grant select, insert, update, delete on table escalations to service_role;
