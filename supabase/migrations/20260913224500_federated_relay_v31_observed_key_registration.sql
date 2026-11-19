-- Register a cross-repo public relay key only after FCR independently observes it
-- from an authenticated exact runtime. Public keys are evidence trust material,
-- never execution authority. The caller remains service_role-only.

create or replace function public.federated_relay_v31_register_observed_key(
  p_member text,
  p_key_id text,
  p_public_key_jwk jsonb,
  p_state text,
  p_valid_from timestamptz,
  p_valid_until timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.federated_relay_v31_public_keys%rowtype;
  v_next_valid_until timestamptz;
begin
  if p_member not in ('chief-ai-machine','solcontinuity','promptos') then
    raise exception 'relay_observed_key_member_invalid';
  end if;
  if p_key_id !~ '^[A-Za-z0-9._:-]{3,200}$' then
    raise exception 'relay_key_id_invalid';
  end if;
  if p_state not in ('active','retiring') then
    raise exception 'relay_observed_key_state_invalid';
  end if;
  if p_valid_until is not null and p_valid_until <= p_valid_from then
    raise exception 'relay_observed_key_window_invalid';
  end if;
  if p_public_key_jwk->>'kty' <> 'OKP'
     or p_public_key_jwk->>'crv' <> 'Ed25519'
     or coalesce(p_public_key_jwk->>'x','') = ''
     or p_public_key_jwk ? 'd' then
    raise exception 'relay_observed_public_key_invalid';
  end if;

  select * into v_existing
  from public.federated_relay_v31_public_keys
  where member = p_member and key_id = p_key_id
  for update;

  if not found then
    insert into public.federated_relay_v31_public_keys(
      member,key_id,algorithm,public_key_jwk,state,valid_from,valid_until
    ) values (
      p_member,p_key_id,'Ed25519',p_public_key_jwk,p_state,p_valid_from,p_valid_until
    );
    return;
  end if;

  if v_existing.algorithm <> 'Ed25519'
     or v_existing.public_key_jwk <> p_public_key_jwk
     or v_existing.valid_from <> p_valid_from then
    raise exception 'relay_observed_key_identity_mismatch';
  end if;
  if v_existing.state = 'revoked' then
    raise exception 'relay_key_revocation_final';
  end if;
  if v_existing.state = 'retiring' and p_state = 'active' then
    raise exception 'relay_key_state_regression';
  end if;

  v_next_valid_until := case
    when v_existing.valid_until is null then p_valid_until
    when p_valid_until is null then v_existing.valid_until
    else least(v_existing.valid_until, p_valid_until)
  end;

  update public.federated_relay_v31_public_keys
  set state = case when v_existing.state = 'retiring' or p_state = 'retiring' then 'retiring' else 'active' end,
      valid_until = v_next_valid_until,
      updated_at = clock_timestamp()
  where member = p_member and key_id = p_key_id;
end;
$$;

revoke all on function public.federated_relay_v31_register_observed_key(text,text,jsonb,text,timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.federated_relay_v31_register_observed_key(text,text,jsonb,text,timestamptz,timestamptz)
  to service_role;
