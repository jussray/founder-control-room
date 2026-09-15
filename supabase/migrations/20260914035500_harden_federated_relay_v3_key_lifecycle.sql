-- Keep the production migration fossil immutable and narrow v3 key updates forward.
-- Key identity/material never changes in place. Rotation creates a new key row;
-- direct service-role updates are limited to monotonic lifecycle transitions.

create or replace function public.guard_federated_relay_public_key_lifecycle_v3()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.member is distinct from old.member
     or new.key_id is distinct from old.key_id
     or new.algorithm is distinct from old.algorithm
     or new.public_key_jwk is distinct from old.public_key_jwk
     or new.valid_from is distinct from old.valid_from
     or new.created_at is distinct from old.created_at then
    raise exception 'relay_key_identity_or_material_immutable' using errcode = '22023';
  end if;

  if old.state = 'revoked' and new.state <> 'revoked' then
    raise exception 'relay_key_revocation_is_terminal' using errcode = '22023';
  end if;

  if old.state = 'retired' and new.state = 'active' then
    raise exception 'relay_key_retirement_cannot_reactivate' using errcode = '22023';
  end if;

  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'relay_key_revocation_time_immutable' using errcode = '22023';
  end if;

  if old.valid_until is not null and new.valid_until is distinct from old.valid_until then
    raise exception 'relay_key_valid_until_immutable_once_set' using errcode = '22023';
  end if;

  if old.valid_until is null
     and new.valid_until is not null
     and new.valid_until <= clock_timestamp() then
    raise exception 'relay_key_valid_until_must_be_future' using errcode = '22023';
  end if;

  if new.state = 'revoked' and old.state <> 'revoked' then
    new.revoked_at := clock_timestamp();
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.guard_federated_relay_public_key_lifecycle_v3()
  from public, anon, authenticated, service_role;

revoke update on table public.federated_relay_public_keys from service_role;
grant update (state, valid_until)
  on table public.federated_relay_public_keys
  to service_role;

drop trigger if exists federated_relay_public_keys_lifecycle_guard_v3
  on public.federated_relay_public_keys;
create trigger federated_relay_public_keys_lifecycle_guard_v3
before update on public.federated_relay_public_keys
for each row execute function public.guard_federated_relay_public_key_lifecycle_v3();
