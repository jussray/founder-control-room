-- Bind founder-content cadence reservation to the exact founder approval expiry.
--
-- The cadence lane is serialized with the existing advisory transaction lock.
-- Unusable deferred slots fail before durable insert, while pre-provider slots
-- that never acquire execution authority are bounded by the same two-minute
-- abandoned-preclaim lease used by the execution recovery path.
--
-- Historical cadence rows are never deleted or rewritten. A released row keeps
-- its original requested/reserved timestamps and receives only release metadata;
-- a later retry creates a fresh row. Released rows no longer participate in the
-- active one-hour cadence floor because no founder approval/provider write was
-- allowed to cross their pre-provider boundary.

revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) from public;
revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) from anon;
revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) from authenticated;
revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) from service_role;
drop function public.reserve_founder_content_cadence(text, text, uuid, timestamptz);

alter table public.founder_content_cadence_reservations
  add column if not exists released_at timestamptz,
  add column if not exists release_reason text;

alter table public.founder_content_cadence_reservations
  drop constraint if exists founder_content_cadence_reservations_provider_channel_content_id_key,
  drop constraint if exists founder_content_cadence_reservations_provider_channel_reserved_schedule_at_key;

create unique index if not exists founder_content_cadence_active_content_key
  on public.founder_content_cadence_reservations (provider, channel, content_id)
  where released_at is null;

create unique index if not exists founder_content_cadence_active_slot_key
  on public.founder_content_cadence_reservations (provider, channel, reserved_schedule_at)
  where released_at is null;

create index if not exists founder_content_cadence_active_latest_idx
  on public.founder_content_cadence_reservations
  (provider, channel, reserved_schedule_at desc)
  where released_at is null;

grant select, insert, update on table public.founder_content_cadence_reservations to service_role;

create function public.reserve_founder_content_cadence(
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
  observed_now timestamptz := pg_catalog.statement_timestamp();
  existing public.founder_content_cadence_reservations%rowtype;
  existing_is_active boolean := false;
  latest_execution_status text;
  latest_execution_started_at timestamptz;
  latest_provider_write_attempted text;
  latest_approval_claimed text;
  latest_retryable_before_provider text;
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
  if p_approval_expires_at is null then
    raise exception 'FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRY_REQUIRED';
  end if;
  if p_requested_schedule_at >= p_approval_expires_at then
    raise exception 'FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRED';
  end if;

  -- Serialize the cadence lane itself so concurrent progress events cannot both
  -- observe/release the same slot and slip through the one-hour floor.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'founder-content-cadence:' || normalized_provider || ':' || normalized_channel,
      0
    )
  );

  -- A cadence row is provisional until the execution ledger acquires it. If no
  -- execution row ever appears, retain the historical row but release it after
  -- the same two-minute lease used for abandoned pre-claim execution recovery.
  -- This bounds a source-project/reservation failure without deleting evidence.
  update public.founder_content_cadence_reservations as reservations
     set released_at = observed_now,
         release_reason = 'unbound_preprovider_lease_expired'
   where reservations.provider = normalized_provider
     and reservations.channel = normalized_channel
     and reservations.released_at is null
     and reservations.created_at <= observed_now - interval '2 minutes'
     and not exists (
       select 1
         from public.approval_executions as executions
        where executions.action_type = 'schedule_founder_content'
          and executions.request ->> 'contentId' = reservations.content_id::text
     );

  select *
    into existing
    from public.founder_content_cadence_reservations
   where provider = normalized_provider
     and channel = normalized_channel
     and content_id = p_content_id
     and released_at is null
   limit 1;

  if found then
    existing_is_active := true;

    -- Once the original slot is no longer usable, reuse is allowed only when
    -- the latest execution proves the operation never crossed approval claim or
    -- provider write. A retryable failed generation is immediately safe; an
    -- abandoned pending generation must satisfy the existing two-minute lease.
    if existing.reserved_schedule_at <= observed_now then
      select
        executions.status,
        executions.started_at,
        executions.result ->> 'provider_write_attempted',
        executions.result ->> 'approval_claimed',
        executions.result ->> 'retryable_before_provider'
      into
        latest_execution_status,
        latest_execution_started_at,
        latest_provider_write_attempted,
        latest_approval_claimed,
        latest_retryable_before_provider
      from public.approval_executions as executions
      where executions.action_type = 'schedule_founder_content'
        and executions.request ->> 'contentId' = p_content_id::text
      order by executions.started_at desc
      limit 1;

      if found and (
        (
          latest_execution_status = 'failed'
          and coalesce(latest_retryable_before_provider, 'false') = 'true'
          and coalesce(latest_provider_write_attempted, 'false') = 'false'
          and coalesce(latest_approval_claimed, 'false') = 'false'
        )
        or (
          latest_execution_status = 'pending'
          and latest_execution_started_at <= observed_now - interval '2 minutes'
          and coalesce(latest_provider_write_attempted, 'false') = 'false'
          and coalesce(latest_approval_claimed, 'false') = 'false'
        )
      ) then
        update public.founder_content_cadence_reservations
           set released_at = observed_now,
               release_reason = case
                 when latest_execution_status = 'failed' then 'retryable_preprovider_execution_failed'
                 else 'abandoned_preprovider_execution_lease_expired'
               end
         where id = existing.id
           and released_at is null;
        existing_is_active := false;
      end if;
    end if;

    if existing_is_active then
      if existing.reserved_schedule_at <= observed_now then
        raise exception 'FOUNDER_CONTENT_CADENCE_STALE_RESERVATION_ACTIVE';
      end if;
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
  end if;

  select max(r.reserved_schedule_at)
    into latest_reserved_at
    from public.founder_content_cadence_reservations r
   where r.provider = normalized_provider
     and r.channel = normalized_channel
     and r.released_at is null;

  next_reserved_at := greatest(
    p_requested_schedule_at,
    coalesce(latest_reserved_at + interval '1 hour', p_requested_schedule_at)
  );

  -- Critical authority invariant: reject the unusable slot inside this transaction
  -- before the insert. Raising here rolls back the RPC with zero new cadence row.
  if next_reserved_at >= p_approval_expires_at then
    raise exception 'FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRED';
  end if;

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

revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) from public;
revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) from anon;
revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) from authenticated;
grant execute on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) to service_role;

comment on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) is
  'Atomically reserves the earliest legal active founder-content provider/channel schedule before exact founder approval expiry. Historical released rows are preserved; unbound or proven pre-provider stale slots may leave the active cadence floor only after the bounded two-minute recovery lease.';

comment on column public.founder_content_cadence_reservations.released_at is
  'When non-null, the historical cadence row is no longer an active provider/channel spacing reservation. Original request/reservation timestamps remain immutable.';

comment on column public.founder_content_cadence_reservations.release_reason is
  'Bounded non-secret reason an unused pre-provider cadence reservation left the active cadence floor.';
