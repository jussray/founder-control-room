-- Bind founder-content cadence authority to a durable FCR execution record.
--
-- Before this migration, cadence reservation and approval_executions reservation
-- were separate transactions. If the cadence RPC committed and the subsequent
-- execution reservation failed, the unused cadence row could still become the
-- anchor for later content and permanently push the lane forward.
--
-- This migration keeps the existing call order but makes an unbound cadence row
-- provisional. A different content item may not schedule behind an unbound
-- provisional row; it fails closed until that row either binds to an execution
-- or its short binding lease expires. Only cadence rows with a matching active
-- or provider-attempted execution can anchor later schedule calculations.
-- Failed pre-provider executions therefore cannot create permanent ghost slots.

begin;

alter table public.founder_content_cadence_reservations
  add column if not exists execution_binding_expires_at timestamptz;

-- Historical rows predate this membrane. They remain cadence evidence only when
-- a matching approval_executions row proves that FCR actually reserved/executed
-- the content. Otherwise they must not become fresh scheduling authority.
update public.founder_content_cadence_reservations
   set execution_binding_expires_at = created_at
 where execution_binding_expires_at is null;

alter table public.founder_content_cadence_reservations
  alter column execution_binding_expires_at set not null;

-- The old reserved_schedule_at uniqueness constraint encoded every historical
-- row as permanently authoritative. Active uniqueness is now serialized by the
-- lane advisory lock plus execution binding, so remove only that legacy unique
-- constraint while preserving the provider/channel/content_id identity key.
do $block$
declare
  constraint_name text;
begin
  select c.conname
    into constraint_name
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.founder_content_cadence_reservations'::pg_catalog.regclass
     and c.contype = 'u'
     and pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (provider, channel, reserved_schedule_at)'
   limit 1;

  if constraint_name is not null then
    execute pg_catalog.format(
      'alter table public.founder_content_cadence_reservations drop constraint %I',
      constraint_name
    );
  end if;
end;
$block$;

-- Keep the table observable to the service role, but force writes through the
-- serialized SECURITY DEFINER RPC rather than permitting direct orphan inserts.
revoke insert, update, delete on table public.founder_content_cadence_reservations from service_role;
grant select on table public.founder_content_cadence_reservations to service_role;

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
  binding_now timestamptz := pg_catalog.clock_timestamp();
  binding_expires_at timestamptz := binding_now + interval '2 minutes';
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

  -- One authority lock governs both provisional-binding checks and the final
  -- lane calculation, so two cadence callers cannot interleave those decisions.
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

    -- Same-content retries may reuse their original slot while the execution
    -- binding is still in flight, or whenever a matching execution already
    -- exists. This preserves idempotency without allowing the row to push a
    -- different content item forward before FCR has durable execution truth.
    if existing.execution_binding_expires_at > binding_now
       or exists (
         select 1
           from public.approval_executions e
          where e.action_type = 'schedule_founder_content'
            and e.request->>'contentId' = existing.content_id::text
       ) then
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

  -- A different request must never schedule *behind* a cadence row whose FCR
  -- execution reservation has not yet materialized. Waiting is safer than
  -- donating a permanent +1h shift to an action that may fail before execution.
  if exists (
    select 1
      from public.founder_content_cadence_reservations r
     where r.provider = normalized_provider
       and r.channel = normalized_channel
       and r.content_id <> p_content_id
       and r.execution_binding_expires_at > binding_now
       and not exists (
         select 1
           from public.approval_executions e
          where e.action_type = 'schedule_founder_content'
            and e.request->>'contentId' = r.content_id::text
       )
  ) then
    raise exception 'FOUNDER_CONTENT_CADENCE_EXECUTION_BINDING_PENDING';
  end if;

  -- Only execution-backed cadence rows can become durable lane authority.
  -- Pending/succeeded executions count, as do failed/unknown paths that crossed
  -- the provider-write boundary. A failed pre-provider execution explicitly
  -- does not anchor later founder content.
  select max(r.reserved_schedule_at)
    into latest_reserved_at
    from public.founder_content_cadence_reservations r
   where r.provider = normalized_provider
     and r.channel = normalized_channel
     and exists (
       select 1
         from public.approval_executions e
        where e.action_type = 'schedule_founder_content'
          and e.request->>'contentId' = r.content_id::text
          and (
            e.status in ('pending', 'succeeded')
            or e.result->>'provider_write_attempted' = 'true'
          )
     );

  next_reserved_at := greatest(
    p_requested_schedule_at,
    coalesce(latest_reserved_at + interval '1 hour', p_requested_schedule_at)
  );

  if next_reserved_at >= p_approval_expires_at then
    raise exception 'FOUNDER_CONTENT_CADENCE_APPROVAL_EXPIRED';
  end if;

  if existing.id is not null then
    update public.founder_content_cadence_reservations
       set requested_schedule_at = p_requested_schedule_at,
           reserved_schedule_at = next_reserved_at,
           execution_binding_expires_at = binding_expires_at
     where id = existing.id
     returning * into inserted;
  else
    insert into public.founder_content_cadence_reservations (
      provider,
      channel,
      content_id,
      requested_schedule_at,
      reserved_schedule_at,
      execution_binding_expires_at
    ) values (
      normalized_provider,
      normalized_channel,
      p_content_id,
      p_requested_schedule_at,
      next_reserved_at,
      binding_expires_at
    )
    returning * into inserted;
  end if;

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

comment on column public.founder_content_cadence_reservations.execution_binding_expires_at is
  'Short provisional lease for binding a cadence slot to its matching FCR approval_executions record. Unbound rows cannot become durable cadence authority for other content.';

comment on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) is
  'Serializes founder-content cadence without ghost-slot drift: a new slot is provisional until a matching FCR execution exists; different content fails closed behind an unbound provisional row; only pending/succeeded/provider-attempted executions anchor later cadence; failed pre-provider rows do not.';

commit;
