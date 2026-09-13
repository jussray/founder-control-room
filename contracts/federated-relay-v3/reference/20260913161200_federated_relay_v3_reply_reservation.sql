-- Durable reply identity reservation for federated relay v3.
-- One accepted parent may produce at most one reply identity for a given
-- source member/key. This lets transport retries reproduce the exact reply,
-- including its signed issued/expires timestamps.

create table if not exists public.federated_relay_reply_reservations (
  parent_message_id uuid primary key
    references public.federated_relay_messages(message_id) on delete restrict,
  source_member text not null,
  source_key_id text not null
    references public.federated_relay_public_keys(key_id) on delete restrict,
  source_sequence bigint not null check (source_sequence >= 0),
  reply_message_id uuid not null unique,
  reply_nonce uuid not null,
  created_at timestamptz not null default now(),
  unique (source_member, source_key_id, source_sequence),
  unique (source_key_id, reply_nonce)
);

alter table public.federated_relay_reply_reservations enable row level security;
revoke all on table public.federated_relay_reply_reservations from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.federated_relay_reply_reservations from service_role;
grant select on table public.federated_relay_reply_reservations to service_role;

create or replace function public.federated_relay_reserve_reply_v3(
  p_parent_message_id uuid,
  p_source_member text,
  p_source_key_id text
)
returns table (
  source_sequence bigint,
  reply_message_id uuid,
  reply_nonce uuid,
  reserved_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  parent_record public.federated_relay_messages%rowtype;
  key_record public.federated_relay_public_keys%rowtype;
  existing_reservation public.federated_relay_reply_reservations%rowtype;
  reserved_sequence bigint;
  reserved_message_id uuid;
  reserved_nonce uuid;
  reservation_time timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended('relay:reply:' || p_parent_message_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('relay:source:' || p_source_member || ':' || p_source_key_id, 0));

  select * into parent_record
    from public.federated_relay_messages
   where message_id = p_parent_message_id
   for update;

  if not found then
    raise exception 'relay_reply_parent_missing';
  end if;
  if parent_record.status <> 'accepted' then
    raise exception 'relay_reply_parent_inactive';
  end if;
  if parent_record.target_member <> p_source_member then
    raise exception 'relay_reply_identity_not_inverted';
  end if;

  select * into key_record
    from public.federated_relay_public_keys
   where key_id = p_source_key_id
   for share;

  if not found then
    raise exception 'relay_signing_key_unknown';
  end if;
  if key_record.member <> p_source_member then
    raise exception 'relay_source_key_member_mismatch';
  end if;
  if key_record.state = 'revoked' or key_record.revoked_at is not null then
    raise exception 'relay_signing_key_revoked';
  end if;
  if now() < key_record.valid_from
     or (key_record.valid_until is not null and now() > key_record.valid_until) then
    raise exception 'relay_signing_key_not_current';
  end if;

  select * into existing_reservation
    from public.federated_relay_reply_reservations
   where parent_message_id = p_parent_message_id;

  if found then
    if existing_reservation.source_member <> p_source_member
       or existing_reservation.source_key_id <> p_source_key_id then
      raise exception 'relay_reply_reservation_identity_mismatch';
    end if;
    return query select
      existing_reservation.source_sequence,
      existing_reservation.reply_message_id,
      existing_reservation.reply_nonce,
      existing_reservation.created_at;
    return;
  end if;

  insert into public.federated_relay_source_sequences (
    member, key_id, last_sequence, updated_at
  ) values (
    p_source_member, p_source_key_id, 0, reservation_time
  )
  on conflict (member, key_id) do update
    set last_sequence = public.federated_relay_source_sequences.last_sequence + 1,
        updated_at = reservation_time
  returning last_sequence into reserved_sequence;

  reserved_message_id := gen_random_uuid();
  reserved_nonce := gen_random_uuid();

  insert into public.federated_relay_reply_reservations (
    parent_message_id,
    source_member,
    source_key_id,
    source_sequence,
    reply_message_id,
    reply_nonce,
    created_at
  ) values (
    p_parent_message_id,
    p_source_member,
    p_source_key_id,
    reserved_sequence,
    reserved_message_id,
    reserved_nonce,
    reservation_time
  );

  return query select reserved_sequence, reserved_message_id, reserved_nonce, reservation_time;
end;
$$;

revoke all on function public.federated_relay_reserve_reply_v3(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.federated_relay_reserve_reply_v3(uuid, text, text)
  to service_role;

comment on table public.federated_relay_reply_reservations is
  'Idempotent reply identity/time reservation for federated relay v3 transport retries; not authority state.';
