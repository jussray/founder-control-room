-- Atomic sender-sequence reservation for federated relay v3.
-- Gaps are allowed when a reserved send is abandoned; reuse and rollback are not.

create table if not exists public.federated_relay_source_sequences (
  member text not null,
  key_id text not null
    references public.federated_relay_public_keys(key_id) on delete restrict,
  last_sequence bigint not null check (last_sequence >= 0),
  updated_at timestamptz not null default now(),
  primary key (member, key_id)
);

alter table public.federated_relay_source_sequences enable row level security;
revoke all on table public.federated_relay_source_sequences from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.federated_relay_source_sequences from service_role;
grant select on table public.federated_relay_source_sequences to service_role;

create or replace function public.federated_relay_reserve_sequence_v3(
  p_member text,
  p_key_id text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  key_record public.federated_relay_public_keys%rowtype;
  reserved_sequence bigint;
begin
  select * into key_record
    from public.federated_relay_public_keys
   where key_id = p_key_id
   for share;

  if not found then
    raise exception 'relay_signing_key_unknown';
  end if;
  if key_record.member <> p_member then
    raise exception 'relay_source_key_member_mismatch';
  end if;
  if key_record.state = 'revoked' or key_record.revoked_at is not null then
    raise exception 'relay_signing_key_revoked';
  end if;
  if now() < key_record.valid_from
     or (key_record.valid_until is not null and now() > key_record.valid_until) then
    raise exception 'relay_signing_key_not_current';
  end if;

  insert into public.federated_relay_source_sequences (
    member, key_id, last_sequence, updated_at
  ) values (
    p_member, p_key_id, 0, now()
  )
  on conflict (member, key_id) do update
    set last_sequence = public.federated_relay_source_sequences.last_sequence + 1,
        updated_at = now()
  returning last_sequence into reserved_sequence;

  return reserved_sequence;
end;
$$;

revoke all on function public.federated_relay_reserve_sequence_v3(text, text)
  from public, anon, authenticated;
grant execute on function public.federated_relay_reserve_sequence_v3(text, text)
  to service_role;

comment on table public.federated_relay_source_sequences is
  'Atomic per-signing-identity sequence allocator for federated relay v3; not authority state.';
comment on function public.federated_relay_reserve_sequence_v3 is
  'Reserves the next monotonic sender sequence before signing a relay v3 envelope.';
