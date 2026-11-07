-- Portfolio-scoped external market observations.
--
-- This table is deliberately separate from project-scoped provider_observations:
-- a public-market aggregate may be reused across projects, while project-private
-- evidence must remain isolated. Raw provider payloads and social content do not
-- belong here.

create table if not exists public.portfolio_signal_observations (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  signal_type text not null,
  resource_id text not null,
  observed_state jsonb not null default '{}',
  observed_at timestamptz not null default now(),
  constraint portfolio_signal_observations_resource
    unique (provider, signal_type, resource_id)
);

create index if not exists idx_portfolio_signal_observations_lookup
  on public.portfolio_signal_observations (provider, signal_type, resource_id, observed_at desc);

alter table public.portfolio_signal_observations enable row level security;

create policy "control_room_service_role_only"
  on public.portfolio_signal_observations
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.portfolio_signal_observations is
  'Service-role-only aggregate external signals for portfolio decision support. No raw social/provider payloads or project-private user data.';
