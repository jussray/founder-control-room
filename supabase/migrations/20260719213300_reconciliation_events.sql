-- Migration: reconciliation_events
-- Auto-applied by `supabase db push` in deploy.yml supabase-migrate job.
-- Stores drift reports emitted by all registered services.

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
  'Drift reports from founder-control-room, Sekret-Bip, and l99-StoryEngine.';

create index if not exists idx_reconciliation_service_received
  on reconciliation_events (service, received_at desc);

alter table reconciliation_events enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'reconciliation_events'
    and policyname = 'service_insert'
  ) then
    create policy "service_insert" on reconciliation_events
      for insert to service_role with check (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'reconciliation_events'
    and policyname = 'auth_read'
  ) then
    create policy "auth_read" on reconciliation_events
      for select to authenticated using (true);
  end if;
end $$;
