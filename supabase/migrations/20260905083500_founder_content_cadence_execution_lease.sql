-- Fence founder-content cadence against abandoned pre-provider reservations.
--
-- Historical cadence rows remain durable. New reservations begin as short,
-- non-blocking provisional leases and become cadence authority only when the
-- matching approval_executions generation is durably reserved. A provisional
-- lease that never reaches execution cannot push unrelated founder content by
-- an hour. Pre-provider retryable failures release confirmed cadence authority,
-- while provider-write/approval-claimed/ambiguous outcomes remain conservative.
--
-- This migration is SOURCE ONLY until a separately authorized production apply.
-- Committing it does not mutate the live database, schedule content, publish,
-- deploy, or grant provider authority.

begin;

alter table public.founder_content_cadence_reservations
  add column if not exists lease_state text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists release_reason text;

-- Preserve all predecessor rows as confirmed historical cadence. We do not infer
-- a synthetic confirmation timestamp for them.
update public.founder_content_cadence_reservations
   set lease_state = 'confirmed'
 where lease_state is null;

alter table public.founder_content_cadence_reservations
  alter column lease_state set default 'confirmed',
  alter column lease_state set not null;

do $constraints$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.founder_content_cadence_reservations'::pg_catalog.regclass
       and conname = 'founder_content_cadence_reservations_lease_state_check'
  ) then
    alter table public.founder_content_cadence_reservations
      add constraint founder_content_cadence_reservations_lease_state_check
      check (lease_state in ('provisional', 'confirmed', 'released'));
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.founder_content_cadence_reservations'::pg_catalog.regclass
       and conname = 'founder_content_cadence_reservations_lease_expiry_check'
  ) then
    alter table public.founder_content_cadence_reservations
      add constraint founder_content_cadence_reservations_lease_expiry_check
      check (
        (lease_state = 'provisional' and lease_expires_at is not null and released_at is null)
        or (lease_state = 'confirmed' and released_at is null)
        or (lease_state = 'released' and released_at is not null)
      );
  end if;
end
$constraints$;

-- The original uniqueness constraints made historical rows double as active
-- leases. Replace them with partial active indexes so a released historical row
-- never blocks a safe retry or a newly legal slot.
alter table public.founder_content_cadence_reservations
  drop constraint if exists founder_content_cadence_reservations_provider_channel_content_id_key;
alter table public.founder_content_cadence_reservations
  drop constraint if exists founder_content_cadence_reservations_provider_channel_reserved_schedule_at_key;

create unique index if not exists founder_content_cadence_active_content_unique
  on public.founder_content_cadence_reservations (provider, channel, content_id)
  where lease_state in ('provisional', 'confirmed');

-- Multiple different provisional callers may temporarily propose the same slot.
-- The execution-confirmation fence below serializes the lane and lets only the
-- first still-legal lease become confirmed. This avoids letting an unclaimed
-- provisional lease push unrelated content by a full cadence interval.
create unique index if not exists founder_content_cadence_confirmed_slot_unique
  on public.founder_content_cadence_reservations (provider, channel, reserved_schedule_at)
  where lease_state = 'confirmed';

create index if not exists founder_content_cadence_confirmed_latest_idx
  on public.founder_content_cadence_reservations (provider, channel, reserved_schedule_at desc)
  where lease_state = 'confirmed';

create table if not exists public.founder_content_cadence_lease_events (
  id                   uuid primary key default gen_random_uuid(),
  reservation_id       uuid not null references public.founder_content_cadence_reservations(id) on delete restrict,
  event_kind            text not null
    check (event_kind in ('provisional_reserved', 'execution_confirmed', 'released_expired', 'released_pre_provider', 'released_conflict')),
  provider              text not null,
  channel               text not null,
  content_id            uuid not null,
  reserved_schedule_at  timestamptz not null,
  event_at              timestamptz not null default now(),
  reason                text not null default ''
    check (char_length(reason) <= 500)
);

create index if not exists founder_content_cadence_lease_events_reservation_idx
  on public.founder_content_cadence_lease_events (reservation_id, event_at asc);

alter table public.founder_content_cadence_lease_events enable row level security;
drop policy if exists "founder_content_cadence_lease_events_service_role_only"
  on public.founder_content_cadence_lease_events;
create policy "founder_content_cadence_lease_events_service_role_only"
  on public.founder_content_cadence_lease_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.founder_content_cadence_lease_events from public;
revoke all on table public.founder_content_cadence_lease_events from anon, authenticated;
grant select, insert on table public.founder_content_cadence_lease_events to service_role;

-- Same public signature as the existing cadence RPC. TypeScript callers do not
-- receive new authority or need a second source of cadence identity.
create or replace function public.reserve_founder_content_cadence(
  p_provider text,
  p_channel text,
  p_content_id uuid,
  p_requested_schedule_at timestamptz,
  p_approval_expires_at timestamptz
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
  lease_now timestamptz := pg_catalog.clock_timestamp();
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
  if p_approval_expires_at is null then
    raise exception 'FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRY_REQUIRED';
  end if;
  if p_requested_schedule_at >= p_approval_expires_at then
    raise exception 'FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'founder-content-cadence:' || normalized_provider || ':' || normalized_channel,
      0
    )
  );

  -- Provisional cadence is a bounded execution lease, not an hour-long posting
  -- claim. Expiry is safe because approval_executions insertion is separately
  -- fenced below: a stalled caller cannot resume after its cadence lease expired.
  with released as (
    update public.founder_content_cadence_reservations as r
       set lease_state = 'released',
           lease_expires_at = null,
           released_at = lease_now,
           release_reason = 'provisional execution lease expired before durable execution confirmation'
     where r.provider = normalized_provider
       and r.channel = normalized_channel
       and r.lease_state = 'provisional'
       and r.lease_expires_at <= lease_now
    returning r.*
  )
  insert into public.founder_content_cadence_lease_events (
    reservation_id, event_kind, provider, channel, content_id, reserved_schedule_at, event_at, reason
  )
  select
    released.id,
    'released_expired',
    released.provider,
    released.channel,
    released.content_id,
    released.reserved_schedule_at,
    lease_now,
    released.release_reason
  from released;

  -- A confirmed cadence row may stop influencing future slots only when its
  -- execution ledger independently proves a pre-provider retryable failure or a
  -- stale preclaim generation. Provider-write, approval-claimed, succeeded, and
  -- ambiguous states remain conservative.
  with released as (
    update public.founder_content_cadence_reservations as r
       set lease_state = 'released',
           released_at = lease_now,
           release_reason = case
             when e.status = 'failed' then 'execution failed retryably before provider write and before approval claim'
             else 'pending preclaim execution exceeded the bounded two-minute generation lease'
           end
      from public.approval_executions as e
     where r.provider = normalized_provider
       and r.channel = normalized_channel
       and r.lease_state = 'confirmed'
       and e.action_type = 'schedule_founder_content'
       and lower(btrim(coalesce(e.request->>'contentId', ''))) = r.content_id::text
       and btrim(coalesce(e.request->>'scheduleAt', '')) <> ''
       and (e.request->>'scheduleAt')::timestamptz = r.reserved_schedule_at
       and (
         (
           e.idempotency_key like 'fcr-n8n-social-v2:%'
           and r.provider = 'n8n'
           and r.channel = lower(btrim(coalesce(e.request->>'platform', '')))
         )
         or (
           e.idempotency_key not like 'fcr-n8n-social-v2:%'
           and r.provider = lower(btrim(coalesce(e.request->>'provider', '')))
           and r.channel = lower(btrim(coalesce(e.request->>'channel', '')))
         )
       )
       and lower(coalesce(e.result->>'provider_write_attempted', 'false')) <> 'true'
       and lower(coalesce(e.result->>'approval_claimed', 'false')) <> 'true'
       and (
         (
           e.status = 'failed'
           and lower(coalesce(e.result->>'retryable_before_provider', 'false')) = 'true'
         )
         or (
           e.status = 'pending'
           and e.started_at <= lease_now - interval '2 minutes'
         )
       )
    returning r.*
  )
  insert into public.founder_content_cadence_lease_events (
    reservation_id, event_kind, provider, channel, content_id, reserved_schedule_at, event_at, reason
  )
  select
    released.id,
    'released_pre_provider',
    released.provider,
    released.channel,
    released.content_id,
    released.reserved_schedule_at,
    lease_now,
    released.release_reason
  from released;

  select *
    into existing
    from public.founder_content_cadence_reservations
   where provider = normalized_provider
     and channel = normalized_channel
     and content_id = p_content_id
     and lease_state in ('provisional', 'confirmed')
   order by created_at desc
   limit 1;

  if found then
    if existing.reserved_schedule_at >= p_approval_expires_at then
      raise exception 'FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRED';
    end if;

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

  -- Only execution-confirmed cadence is an hourly floor. Unclaimed provisional
  -- leases may share a candidate slot; the execution trigger serializes and
  -- confirms exactly one still-legal winner.
  select max(r.reserved_schedule_at)
    into latest_reserved_at
    from public.founder_content_cadence_reservations as r
   where r.provider = normalized_provider
     and r.channel = normalized_channel
     and r.lease_state = 'confirmed';

  next_reserved_at := greatest(
    p_requested_schedule_at,
    coalesce(latest_reserved_at + interval '1 hour', p_requested_schedule_at)
  );

  if next_reserved_at >= p_approval_expires_at then
    raise exception 'FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRED';
  end if;

  insert into public.founder_content_cadence_reservations (
    provider,
    channel,
    content_id,
    requested_schedule_at,
    reserved_schedule_at,
    lease_state,
    lease_expires_at,
    confirmed_at,
    released_at,
    release_reason
  ) values (
    normalized_provider,
    normalized_channel,
    p_content_id,
    p_requested_schedule_at,
    next_reserved_at,
    'provisional',
    lease_now + interval '2 minutes',
    null,
    null,
    null
  )
  returning * into inserted;

  insert into public.founder_content_cadence_lease_events (
    reservation_id, event_kind, provider, channel, content_id, reserved_schedule_at, event_at, reason
  ) values (
    inserted.id,
    'provisional_reserved',
    inserted.provider,
    inserted.channel,
    inserted.content_id,
    inserted.reserved_schedule_at,
    lease_now,
    'bounded pre-provider execution lease; not yet cadence authority'
  );

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

-- Confirm/release cadence in the same transaction that changes the durable
-- execution generation. This closes the time-of-check/time-of-use gap that a
-- plain provisional TTL would leave behind.
create or replace function public.reconcile_founder_content_cadence_execution_lease()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $trigger$
declare
  content_raw text;
  platform_raw text;
  provider_raw text;
  channel_raw text;
  schedule_raw text;
  cadence_provider text;
  cadence_channel text;
  cadence_content_id uuid;
  cadence_schedule_at timestamptz;
  lease public.founder_content_cadence_reservations%rowtype;
  latest_confirmed timestamptz;
  event_now timestamptz := pg_catalog.clock_timestamp();
begin
  if new.action_type <> 'schedule_founder_content' then
    return new;
  end if;

  content_raw := lower(btrim(coalesce(new.request->>'contentId', '')));
  platform_raw := lower(btrim(coalesce(new.request->>'platform', '')));
  provider_raw := lower(btrim(coalesce(new.request->>'provider', '')));
  channel_raw := lower(btrim(coalesce(new.request->>'channel', '')));
  schedule_raw := btrim(coalesce(new.request->>'scheduleAt', ''));

  if content_raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or platform_raw = ''
    or schedule_raw = '' then
    raise exception 'FOUNDER_CONTENT_CADENCE_EXECUTION_IDENTITY_INVALID';
  end if;

  cadence_content_id := content_raw::uuid;
  cadence_schedule_at := schedule_raw::timestamptz;

  if new.idempotency_key like 'fcr-n8n-social-v2:%' then
    cadence_provider := 'n8n';
    cadence_channel := platform_raw;
  else
    if provider_raw = '' or channel_raw = '' then
      raise exception 'FOUNDER_CONTENT_CADENCE_EXECUTION_DESTINATION_INVALID';
    end if;
    cadence_provider := provider_raw;
    cadence_channel := channel_raw;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'founder-content-cadence:' || cadence_provider || ':' || cadence_channel,
      0
    )
  );

  -- A proven pre-provider retryable terminal state releases cadence authority.
  if new.status = 'failed'
    and lower(coalesce(new.result->>'retryable_before_provider', 'false')) = 'true'
    and lower(coalesce(new.result->>'provider_write_attempted', 'false')) <> 'true'
    and lower(coalesce(new.result->>'approval_claimed', 'false')) <> 'true' then

    update public.founder_content_cadence_reservations as r
       set lease_state = 'released',
           lease_expires_at = null,
           released_at = event_now,
           release_reason = 'execution failed retryably before provider write and before approval claim'
     where r.provider = cadence_provider
       and r.channel = cadence_channel
       and r.content_id = cadence_content_id
       and r.reserved_schedule_at = cadence_schedule_at
       and r.lease_state = 'confirmed'
    returning r.* into lease;

    if found then
      insert into public.founder_content_cadence_lease_events (
        reservation_id, event_kind, provider, channel, content_id, reserved_schedule_at, event_at, reason
      ) values (
        lease.id,
        'released_pre_provider',
        lease.provider,
        lease.channel,
        lease.content_id,
        lease.reserved_schedule_at,
        event_now,
        lease.release_reason
      );
    end if;

    return new;
  end if;

  -- Only pending execution generations claim cadence. Later provider/audit state
  -- transitions retain the already confirmed cadence record.
  if new.status <> 'pending' then
    return new;
  end if;

  select *
    into lease
    from public.founder_content_cadence_reservations as r
   where r.provider = cadence_provider
     and r.channel = cadence_channel
     and r.content_id = cadence_content_id
     and r.reserved_schedule_at = cadence_schedule_at
     and r.lease_state in ('provisional', 'confirmed')
   order by r.created_at desc
   limit 1
   for update;

  if not found then
    raise exception 'FOUNDER_CONTENT_CADENCE_EXECUTION_LEASE_REQUIRED';
  end if;

  if lease.lease_state = 'confirmed' then
    return new;
  end if;

  if lease.lease_expires_at is null or lease.lease_expires_at <= coalesce(new.started_at, event_now) then
    update public.founder_content_cadence_reservations
       set lease_state = 'released',
           lease_expires_at = null,
           released_at = event_now,
           release_reason = 'execution attempted to claim an expired provisional cadence lease'
     where id = lease.id;

    insert into public.founder_content_cadence_lease_events (
      reservation_id, event_kind, provider, channel, content_id, reserved_schedule_at, event_at, reason
    ) values (
      lease.id,
      'released_expired',
      lease.provider,
      lease.channel,
      lease.content_id,
      lease.reserved_schedule_at,
      event_now,
      'execution attempted to claim an expired provisional cadence lease'
    );

    return null;
  end if;

  select max(r.reserved_schedule_at)
    into latest_confirmed
    from public.founder_content_cadence_reservations as r
   where r.provider = cadence_provider
     and r.channel = cadence_channel
     and r.lease_state = 'confirmed'
     and r.id <> lease.id;

  if latest_confirmed is not null
     and lease.reserved_schedule_at < latest_confirmed + interval '1 hour' then
    update public.founder_content_cadence_reservations
       set lease_state = 'released',
           lease_expires_at = null,
           released_at = event_now,
           release_reason = 'another execution confirmed first; cadence must be recomputed'
     where id = lease.id;

    insert into public.founder_content_cadence_lease_events (
      reservation_id, event_kind, provider, channel, content_id, reserved_schedule_at, event_at, reason
    ) values (
      lease.id,
      'released_conflict',
      lease.provider,
      lease.channel,
      lease.content_id,
      lease.reserved_schedule_at,
      event_now,
      'another execution confirmed first; cadence must be recomputed'
    );

    -- Skipping the row makes the existing Supabase .insert().single() path fail
    -- closed with no durable execution. The caller may safely recompute cadence.
    return null;
  end if;

  update public.founder_content_cadence_reservations
     set lease_state = 'confirmed',
         lease_expires_at = null,
         confirmed_at = coalesce(new.started_at, event_now),
         released_at = null,
         release_reason = null
   where id = lease.id;

  insert into public.founder_content_cadence_lease_events (
    reservation_id, event_kind, provider, channel, content_id, reserved_schedule_at, event_at, reason
  ) values (
    lease.id,
    'execution_confirmed',
    lease.provider,
    lease.channel,
    lease.content_id,
    lease.reserved_schedule_at,
    event_now,
    'durable approval_executions generation confirmed cadence authority'
  );

  return new;
end;
$trigger$;

drop trigger if exists founder_content_cadence_execution_lease_guard
  on public.approval_executions;
create trigger founder_content_cadence_execution_lease_guard
before insert or update of status, request, result, started_at
on public.approval_executions
for each row
execute function public.reconcile_founder_content_cadence_execution_lease();

revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) from public;
revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) from anon;
revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) from authenticated;
grant execute on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) to service_role;

revoke all on function public.reconcile_founder_content_cadence_execution_lease() from public;
revoke all on function public.reconcile_founder_content_cadence_execution_lease() from anon;
revoke all on function public.reconcile_founder_content_cadence_execution_lease() from authenticated;
revoke all on function public.reconcile_founder_content_cadence_execution_lease() from service_role;

comment on table public.founder_content_cadence_reservations is
  'Service-role cadence history plus active lease state. Provisional rows do not become rolling-hour cadence authority until the exact approval_executions generation confirms them; released rows remain historical evidence and do not block safe retries.';

comment on table public.founder_content_cadence_lease_events is
  'Immutable service-role cadence lease transition history. Records provisional reservation, execution confirmation, and bounded pre-provider release without storing post copy, private proof, credentials, or provider payloads.';

comment on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) is
  'Reserves a bounded provisional founder-content cadence lease. Only execution-confirmed cadence contributes to the rolling 60-minute floor; expired or independently proven pre-provider-abandoned leases are released without deleting history.';

comment on function public.reconcile_founder_content_cadence_execution_lease() is
  'Database trigger fence binding cadence authority to the matching approval_executions generation. Confirms a still-legal provisional lease, releases proven pre-provider retryable failures, and refuses stale/conflicting execution claims before any provider-write authority can be inferred.';

commit;
