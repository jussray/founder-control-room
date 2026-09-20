-- Atomically create a workspace project and its mandatory onboarding receipt.
-- The trusted FCR backend is the only caller. If the receipt cannot be written,
-- project creation rolls back in the same PostgreSQL transaction.

create or replace function public.create_workspace_project_with_onboarding_event(
  p_workspace_id uuid,
  p_slug text,
  p_name text,
  p_repo_provider text,
  p_repo_identifier text,
  p_stack text,
  p_event_metadata jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
begin
  if p_workspace_id is null then
    raise exception 'workspace id is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_slug), '') is null or nullif(btrim(p_name), '') is null then
    raise exception 'project slug and name are required' using errcode = '22023';
  end if;
  if p_event_metadata is null or jsonb_typeof(p_event_metadata) <> 'object' then
    raise exception 'onboarding event metadata must be an object' using errcode = '22023';
  end if;
  if p_event_metadata ?| array['founder', 'email', 'founderEmail'] then
    raise exception 'onboarding event metadata must not contain founder email identity' using errcode = '22023';
  end if;

  insert into public.projects (
    workspace_id,
    slug,
    name,
    repo_provider,
    repo_identifier,
    stack,
    status,
    risk_level
  ) values (
    p_workspace_id,
    p_slug,
    p_name,
    p_repo_provider,
    p_repo_identifier,
    p_stack,
    'active',
    'medium'
  )
  returning * into v_project;

  insert into public.project_events (
    project_id,
    source_event_id,
    event_type,
    severity,
    screen,
    metadata
  ) values (
    v_project.id,
    gen_random_uuid()::text,
    'founder_onboarding_bootstrapped',
    'info',
    'chief-workspace-onboarding',
    p_event_metadata
  );

  return jsonb_build_object(
    'id', v_project.id,
    'workspace_id', v_project.workspace_id,
    'slug', v_project.slug,
    'name', v_project.name,
    'repo_provider', v_project.repo_provider,
    'repo_identifier', v_project.repo_identifier,
    'stack', v_project.stack,
    'status', v_project.status,
    'risk_level', v_project.risk_level
  );
end;
$$;

revoke all on function public.create_workspace_project_with_onboarding_event(
  uuid, text, text, text, text, text, jsonb
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.create_workspace_project_with_onboarding_event(uuid, text, text, text, text, text, jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.create_workspace_project_with_onboarding_event(uuid, text, text, text, text, text, jsonb) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_workspace_project_with_onboarding_event(uuid, text, text, text, text, text, jsonb) to service_role';
  end if;
end
$$;

comment on function public.create_workspace_project_with_onboarding_event(
  uuid, text, text, text, text, text, jsonb
) is 'Trusted FCR transaction: create one workspace project and its mandatory privacy-safe onboarding evidence together or roll both back.';
