-- Public customer-Founder provisioning for Founder Control Room.
--
-- This function is callable only by the trusted FCR service-role backend after
-- Supabase Auth has independently verified the user. It can create or bind only
-- workspace_owner membership. It can never create, promote, or convert an
-- identity into platform_owner authority.

create or replace function public.provision_workspace_founder(
  p_user_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_member public.founder_users%rowtype;
  v_workspace_id uuid;
begin
  if p_user_id is null then
    raise exception 'verified user id is required' using errcode = '22023';
  end if;
  if v_email = '' or position('@' in v_email) <= 1 then
    raise exception 'verified email is required' using errcode = '22023';
  end if;

  -- Idempotent return for an already-provisioned customer founder. A platform
  -- owner may never enter through the public customer provisioning path.
  select *
  into v_member
  from public.founder_users
  where user_id = p_user_id
  limit 1;

  if found then
    if lower(v_member.email) <> v_email
       or v_member.account_role <> 'workspace_owner'
       or v_member.workspace_id is null then
      raise exception 'verified identity cannot use customer workspace provisioning'
        using errcode = '42501';
    end if;

    return jsonb_build_object(
      'email', v_email,
      'user_id', v_member.user_id,
      'workspace_id', v_member.workspace_id,
      'account_role', v_member.account_role
    );
  end if;

  -- A pre-provisioned workspace_owner invite may be claimed only by the
  -- verified Auth identity for the same normalized email. Any bound identity or
  -- platform-owner row fails closed instead of being reassigned.
  select *
  into v_member
  from public.founder_users
  where lower(email) = v_email
  limit 1;

  if found then
    if v_member.account_role = 'workspace_owner'
       and v_member.user_id is null
       and v_member.workspace_id is not null then
      update public.founder_users
      set user_id = p_user_id
      where email = v_member.email
        and user_id is null
      returning * into v_member;

      return jsonb_build_object(
        'email', v_email,
        'user_id', v_member.user_id,
        'workspace_id', v_member.workspace_id,
        'account_role', v_member.account_role
      );
    end if;

    raise exception 'email identity is already claimed'
      using errcode = '42501';
  end if;

  insert into public.workspaces (slug, name)
  values (
    'founder-' || substr(md5(p_user_id::text), 1, 20),
    'Founder Workspace'
  )
  returning id into v_workspace_id;

  insert into public.founder_users (
    email,
    user_id,
    workspace_id,
    account_role
  ) values (
    v_email,
    p_user_id,
    v_workspace_id,
    'workspace_owner'
  )
  returning * into v_member;

  return jsonb_build_object(
    'email', v_email,
    'user_id', v_member.user_id,
    'workspace_id', v_member.workspace_id,
    'account_role', v_member.account_role
  );
end;
$$;

revoke all on function public.provision_workspace_founder(uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.provision_workspace_founder(uuid, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.provision_workspace_founder(uuid, text) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.provision_workspace_founder(uuid, text) to service_role';
  end if;
end
$$;

comment on function public.provision_workspace_founder(uuid, text) is
  'Trusted FCR auth handoff: provision or bind one verified Supabase Auth user to one isolated workspace_owner membership; never grants platform_owner authority.';
