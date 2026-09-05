-- Server-side anti-spam authority for founder-progress distribution.
--
-- The existing 20-minute review window remains the earliest requested schedule.
-- This ledger atomically moves later founder-content requests to the earliest
-- provider/channel slot that preserves a rolling 60-minute minimum gap.
-- It stores no post text, private evidence, prompts, credentials, or provider payloads.

create table if not exists public.founder_content_cadence_reservations (
  id uuid primary key default gen_random_uuid(),
  cadence_policy_id text not null default 'founder-content-hourly-cap-v1'
    check (cadence_policy_id = 'founder-content-hourly-cap-v1'),
  provider text not null
    check (provider ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'),
  channel text not null
    check (channel ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'),
  content_id uuid not null,
  requested_schedule_at timestamptz not null,
  reserved_schedule_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (reserved_schedule_at >= requested_schedule_at),
  unique (provider, channel, content_id),
  unique (provider, channel, reserved_schedule_at)
);

create index if not exists founder_content_cadence_latest_idx
  on public.founder_content_cadence_reservations
  (provider, channel, reserved_schedule_at desc);

alter table public.founder_content_cadence_reservations enable row level security;

revoke all on table public.founder_content_cadence_reservations from public;
revoke all on table public.founder_content_cadence_reservations from anon;
revoke all on table public.founder_content_cadence_reservations from authenticated;
grant select, insert on table public.founder_content_cadence_reservations to service_role;

comment on table public.founder_content_cadence_reservations is
  'Service-role-only founder-content cadence reservations. Enforces at most one reserved provider/channel slot per rolling 60 minutes without storing post copy or private proof.';

create or replace function public.reserve_founder_content_cadence(
  p_provider text,
  p_channel text,
  p_content_id uuid,
  p_requested_schedule_at timestamptz
)
returns table (
  reservation_id uuid,
  cadence_policy_id text,
  requested_schedule_at timestamptz,
  reserved_schedule_at timestamptz,
  deferred_seconds integer
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_provider text := lower(btrim(p_provider));
  normalized_channel text := lower(btrim(p_channel));
  existing public.founder_content_cadence_reservations%rowtype;
  latest_reserved_at timestamptz;
  next_reserved_at timestamptz;
  inserted public.founder_content_cadence_reservations%rowtype;
begin
  if normalized_provider !~ '^[a-z0-9][a-z0-9._:-]{0,159}$' then
    raise exception 'FOUNDER_CONTENT_CADENCE_INVALID_PROVIDER';
  end if;
  if normalized_channel !~ '^[a-z0-9][a-z0-9._:-]{0,159}$' then
    raise exception 'FOUNDER_CONTENT_CADENCE_INVALID_CHANNEL';
  end if;
  if p_content_id is null then
    raise exception 'FOUNDER_CONTENT_CADENCE_CONTENT_ID_REQUIRED';
  end if;
  if p_requested_schedule_at is null then
    raise exception 'FOUNDER_CONTENT_CADENCE_REQUESTED_SCHEDULE_REQUIRED';
  end if;

  -- Serialize the cadence lane itself so concurrent progress events cannot both
  -- observe the same latest slot and slip through the one-hour floor.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'founder-content-cadence:' || normalized_provider || ':' || normalized_channel,
      0
    )
  );

  select *
    into existing
    from public.founder_content_cadence_reservations
   where provider = normalized_provider
     and channel = normalized_channel
     and content_id = p_content_id;

  if found then
    return query
      select
        existing.id,
        existing.cadence_policy_id,
        existing.requested_schedule_at,
        existing.reserved_schedule_at,
        greatest(
          0,
          floor(extract(epoch from (existing.reserved_schedule_at - existing.requested_schedule_at)))::integer
        );
    return;
  end if;

  select max(r.reserved_schedule_at)
    into latest_reserved_at
    from public.founder_content_cadence_reservations r
   where r.provider = normalized_provider
     and r.channel = normalized_channel;

  next_reserved_at := greatest(
    p_requested_schedule_at,
    coalesce(latest_reserved_at + interval '1 hour', p_requested_schedule_at)
  );

  insert into public.founder_content_cadence_reservations (
    provider,
    channel,
    content_id,
    requested_schedule_at,
    reserved_schedule_at
  ) values (
    normalized_provider,
    normalized_channel,
    p_content_id,
    p_requested_schedule_at,
    next_reserved_at
  )
  returning * into inserted;

  return query
    select
      inserted.id,
      inserted.cadence_policy_id,
      inserted.requested_schedule_at,
      inserted.reserved_schedule_at,
      greatest(
        0,
        floor(extract(epoch from (inserted.reserved_schedule_at - inserted.requested_schedule_at)))::integer
      );
end;
$function$;

revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) from public;
revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) from anon;
revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) from authenticated;
grant execute on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) to service_role;

comment on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) is
  'Atomically reserves the earliest legal founder-content provider/channel schedule, preserving a rolling 60-minute minimum gap. Same content id returns the original slot.';
