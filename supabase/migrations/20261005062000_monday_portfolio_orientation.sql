create table if not exists public.portfolio_orientation_runs (
  id uuid primary key default gen_random_uuid(),
  week_key date not null unique,
  scheduled_local_date date not null,
  timezone text not null check (timezone = 'America/New_York'),
  recipient text not null check (recipient = 'sekretbip@gmail.com'),
  status text not null check (status in ('running', 'sent', 'failed')),
  attempt_count integer not null default 1 check (attempt_count >= 1),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  message_id text,
  source_status jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portfolio_orientation_runs enable row level security;

comment on table public.portfolio_orientation_runs is
  'Idempotent founder-only receipts for the Monday 08:00 America/New_York Juss & Co portfolio orientation.';

comment on column public.portfolio_orientation_runs.week_key is
  'Local America/New_York Monday date. Unique so one week cannot emit duplicate founder briefs.';

create or replace function public.touch_portfolio_orientation_runs_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portfolio_orientation_runs_touch_updated_at on public.portfolio_orientation_runs;
create trigger portfolio_orientation_runs_touch_updated_at
before update on public.portfolio_orientation_runs
for each row execute function public.touch_portfolio_orientation_runs_updated_at();

revoke all on table public.portfolio_orientation_runs from anon, authenticated;
