-- Harden v3.1 relay key lifecycle semantics without rewriting the original migration.
-- Ephemeral CI keys must be finite public-only Ed25519 verification keys, and once
-- any key has a finite validity ceiling it can never be widened back to no expiry.

create or replace function public.federated_relay_v31_key_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member <> old.member
     or new.key_id <> old.key_id
     or new.algorithm <> old.algorithm
     or new.public_key_jwk <> old.public_key_jwk
     or new.valid_from <> old.valid_from then
    raise exception 'relay_key_identity_immutable';
  end if;

  if old.state = 'revoked' then
    raise exception 'relay_key_revocation_final';
  end if;
  if old.state = 'retiring' and new.state = 'active' then
    raise exception 'relay_key_state_regression';
  end if;

  if old.valid_until is not null and new.valid_until is null then
    raise exception 'relay_key_validity_extension_rejected';
  end if;
  if old.valid_until is not null
     and new.valid_until is not null
     and new.valid_until > old.valid_until then
    raise exception 'relay_key_validity_extension_rejected';
  end if;

  if new.state = 'revoked' and new.revoked_at is null then
    new.revoked_at := clock_timestamp();
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.federated_relay_v31_register_ephemeral_key(
  p_member text,
  p_key_id text,
  p_public_key_jwk jsonb,
  p_valid_from timestamptz,
  p_valid_until timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_member not in ('founder-control-room','chief-ai-machine','solcontinuity','promptos') then
    raise exception 'relay_member_invalid';
  end if;
  if p_key_id !~ '^[A-Za-z0-9._:-]{3,200}$' then
    raise exception 'relay_key_id_invalid';
  end if;
  if p_key_id not like p_member || ':relay-v3.1:ci:%' then
    raise exception 'relay_ephemeral_key_namespace_invalid';
  end if;
  if p_valid_from is null
     or p_valid_until is null
     or p_valid_from < clock_timestamp() - interval '2 minutes'
     or p_valid_until > clock_timestamp() + interval '20 minutes'
     or p_valid_until <= p_valid_from then
    raise exception 'relay_ephemeral_key_window_invalid';
  end if;
  if p_public_key_jwk->>'kty' <> 'OKP'
     or p_public_key_jwk->>'crv' <> 'Ed25519'
     or coalesce(p_public_key_jwk->>'x','') = ''
     or p_public_key_jwk ? 'd' then
    raise exception 'relay_ephemeral_public_key_invalid';
  end if;

  insert into public.federated_relay_v31_public_keys(
    member,key_id,algorithm,public_key_jwk,state,valid_from,valid_until
  ) values (
    p_member,p_key_id,'Ed25519',p_public_key_jwk,'active',p_valid_from,p_valid_until
  );
end;
$$;

revoke all on function public.federated_relay_v31_register_ephemeral_key(text,text,jsonb,timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.federated_relay_v31_register_ephemeral_key(text,text,jsonb,timestamptz,timestamptz)
  to service_role;
