-- Migration: reconciliation_events table
-- Legacy manual bootstrap only. Not a versioned migration for supabase db push.
-- Canonical history: supabase/migrations/20260719213300_reconciliation_events.sql
-- Production read restriction: 20261013223238_restrict_reconciliation_events_authenticated_read_20261013.sql
-- Keep this optional empty-database setup aligned with the *effective* hardened policy.

create table if not exists reconciliation_events (
  id            text        primary key,
  service       text        not null,
  status        text        not null check (status in ('clean', 'drift_detected')),
  drift         jsonb       not null default '[]',
  received_at   timestamptz not null default now(),
  reported_at   timestamptz,
  duration_ms   integer
);

comment on table reconciliation_events is
  'Stores drift reports emitted by Sekret-Bip, l99-StoryEngine, and the Control Room itself.';

-- Index for dashboard queries: latest events per service
create index if not exists idx_reconciliation_service_received
  on reconciliation_events (service, received_at desc);

-- RLS: only the service role can insert; ordinary authenticated readers are denied.
-- The API's privileged service-role read must independently enforce founder auth.
alter table reconciliation_events enable row level security;

create policy "service_insert" on reconciliation_events
  for insert to service_role with check (true);

create policy "auth_read" on reconciliation_events
  for select to authenticated using (false);
