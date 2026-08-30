-- Immutable founder-attested external publication evidence.
--
-- provider_observations remains the latest-state carrier. Every manual founder
-- attestation is first written here so later corrections cannot erase history.
-- This table is server-only evidence and grants no publication/provider authority.

create table if not exists public.founder_content_attestation_events (
  event_id text primary key,
  project_id uuid not null references public.projects(id),
  founder_user_id text not null,
  provider text not null check (provider = 'linkedin'),
  resource_type text not null check (resource_type = 'founder_content_post'),
  resource_id text not null,
  observed_state jsonb not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_founder_content_attestation_events_history
  on public.founder_content_attestation_events (
    project_id,
    provider,
    resource_type,
    resource_id,
    observed_at desc
  );

-- Keep the existing provider_observations.source_event_id relationship reserved
-- for provider_events(id). Manual founder attestations use their own compatible
-- foreign key so observation provenance does not overload provider webhook truth.
alter table public.provider_observations
  add column if not exists attestation_event_id text
    references public.founder_content_attestation_events(event_id) on delete set null;

create index if not exists idx_provider_observations_attestation_event
  on public.provider_observations (attestation_event_id)
  where attestation_event_id is not null;

alter table public.founder_content_attestation_events enable row level security;

revoke all on table public.founder_content_attestation_events from anon, authenticated;
grant select, insert on table public.founder_content_attestation_events to service_role;

create or replace function public.reject_founder_content_attestation_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'founder_content_attestation_events is append-only';
end;
$$;

revoke all on function public.reject_founder_content_attestation_event_mutation() from public, anon, authenticated;

create trigger founder_content_attestation_events_append_only
  before update or delete on public.founder_content_attestation_events
  for each row execute function public.reject_founder_content_attestation_event_mutation();

comment on table public.founder_content_attestation_events is
  'Append-only service-role evidence for manual founder publication attestations. Rows are non-authorizing and cannot be updated or deleted.';
