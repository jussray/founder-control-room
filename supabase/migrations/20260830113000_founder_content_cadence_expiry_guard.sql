-- Bind founder-content cadence reservation to the exact founder approval expiry.
--
-- The cadence lane is still serialized with the existing advisory transaction lock,
-- but an unusable deferred slot must now fail before any durable reservation insert.
-- This migration changes only the RPC contract; it does not mutate or delete prior rows.

revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) from public;
revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) from anon;
revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) from authenticated;
revoke all on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz) from service_role;
drop function public.reserve_founder_content_cadence(text, text, uuid, timestamptz);

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
  if p_approval_expires_at is null then
    raise exception 'FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRY_REQUIRED';
  end if;
  if p_requested_schedule_at >= p_approval_expires_at then
    raise exception 'FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRED';
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

  select max(r.reserved_schedule_at)
    into latest_reserved_at
    from public.founder_content_cadence_reservations r
   where r.provider = normalized_provider
     and r.channel = normalized_channel;

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
  'Atomically reserves the earliest legal founder-content provider/channel schedule before exact founder approval expiry, preserving a rolling 60-minute minimum gap. Expired candidate slots fail before insert; same content id returns the original slot only when still inside the supplied approval lease.';
