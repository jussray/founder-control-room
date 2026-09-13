/*
  Federated relay identity hardening.

  - v3 public-key identity/material is immutable after registration.
  - lifecycle updates may only narrow trust (active -> retired/revoked,
    retired -> revoked; validity may shorten but never extend).
  - one v3.1 message UUID may exist in exactly one local ledger: inbound or
    outbound. A transaction-scoped advisory lock closes the cross-table race.
*/

do $$
begin
  if exists (
    select 1
    from public.federated_relay_v31_messages m
    join public.federated_relay_v31_outbox o using (message_id)
  ) then
    raise exception 'relay_v31_cross_ledger_message_id_collision';
  end if;
end;
$$;

create or replace function public.federated_relay_v3_key_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.key_id <> old.key_id
     or new.member <> old.member
     or new.algorithm <> old.algorithm
     or new.public_key_jwk <> old.public_key_jwk
     or new.valid_from <> old.valid_from then
    raise exception 'relay_key_identity_immutable';
  end if;

  if old.state = 'revoked' then
    raise exception 'relay_key_revocation_final';
  end if;
  if old.state = 'retired' and new.state = 'active' then
    raise exception 'relay_key_state_regression';
  end if;
  if new.valid_until is not null
     and old.valid_until is not null
     and new.valid_until > old.valid_until then
    raise exception 'relay_key_validity_extension_rejected';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'relay_key_revocation_timestamp_immutable';
  end if;
  if new.state = 'revoked' and new.revoked_at is null then
    new.revoked_at := clock_timestamp();
  end if;
  if new.state <> 'revoked' and new.revoked_at is not null then
    raise exception 'relay_key_revocation_state_mismatch';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists federated_relay_v3_key_immutability
  on public.federated_relay_public_keys;
create trigger federated_relay_v3_key_immutability
before update on public.federated_relay_public_keys
for each row execute function public.federated_relay_v3_key_immutability();

create or replace function public.federated_relay_v31_message_id_membrane()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.message_id::text, 0));

  if tg_table_name = 'federated_relay_v31_messages' then
    if exists (
      select 1 from public.federated_relay_v31_outbox
      where message_id = new.message_id
    ) then
      raise exception 'relay_message_id_collision';
    end if;
  elsif tg_table_name = 'federated_relay_v31_outbox' then
    if exists (
      select 1 from public.federated_relay_v31_messages
      where message_id = new.message_id
    ) then
      raise exception 'relay_message_id_collision';
    end if;
  else
    raise exception 'relay_message_id_membrane_table_invalid';
  end if;

  return new;
end;
$$;

drop trigger if exists federated_relay_v31_message_id_membrane_inbound
  on public.federated_relay_v31_messages;
create trigger federated_relay_v31_message_id_membrane_inbound
before insert or update of message_id on public.federated_relay_v31_messages
for each row execute function public.federated_relay_v31_message_id_membrane();

drop trigger if exists federated_relay_v31_message_id_membrane_outbound
  on public.federated_relay_v31_outbox;
create trigger federated_relay_v31_message_id_membrane_outbound
before insert or update of message_id on public.federated_relay_v31_outbox
for each row execute function public.federated_relay_v31_message_id_membrane();
