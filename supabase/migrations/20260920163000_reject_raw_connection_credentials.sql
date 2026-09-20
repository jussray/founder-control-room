-- project_connections.config is non-secret metadata. Credentials belong behind
-- secret_ref / the connection vault and must never be persisted inside JSON,
-- including nested objects or arrays.

create or replace function public.connection_config_contains_raw_credential(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text;
  v_child jsonb;
  v_text text;
begin
  if p_value is null then
    return false;
  end if;

  case jsonb_typeof(p_value)
    when 'object' then
      for v_key, v_child in select key, value from jsonb_each(p_value)
      loop
        if lower(v_key) ~ '(^|[_-])(token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|service[_-]?role|credential|authorization)([_-]|$)' then
          return true;
        end if;
        if public.connection_config_contains_raw_credential(v_child) then
          return true;
        end if;
      end loop;
      return false;

    when 'array' then
      for v_child in select value from jsonb_array_elements(p_value)
      loop
        if public.connection_config_contains_raw_credential(v_child) then
          return true;
        end if;
      end loop;
      return false;

    when 'string' then
      v_text := trim(both '"' from p_value::text);
      return v_text ~* '(github_pat_[A-Za-z0-9_]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|Bearer[[:space:]]+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]{16,})';

    else
      return false;
  end case;
end;
$$;

create or replace function public.guard_project_connection_config()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.connection_config_contains_raw_credential(new.config) then
    raise exception 'project_connection_config_contains_raw_credential'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Refuse to silently carry old leaked credential-shaped data forward. This
-- reports only that remediation is required and never emits the offending JSON.
do $$
begin
  if exists (
    select 1
    from public.project_connections
    where public.connection_config_contains_raw_credential(config)
  ) then
    raise exception 'existing_project_connection_config_requires_secret_remediation'
      using errcode = '23514';
  end if;
end
$$;

drop trigger if exists project_connections_non_secret_config_guard on public.project_connections;
create trigger project_connections_non_secret_config_guard
before insert or update of config on public.project_connections
for each row
execute function public.guard_project_connection_config();

revoke all on function public.connection_config_contains_raw_credential(jsonb) from public;
revoke all on function public.guard_project_connection_config() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.connection_config_contains_raw_credential(jsonb) from anon';
    execute 'revoke all on function public.guard_project_connection_config() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.connection_config_contains_raw_credential(jsonb) from authenticated';
    execute 'revoke all on function public.guard_project_connection_config() from authenticated';
  end if;
end
$$;

comment on function public.guard_project_connection_config() is
  'Enforces project_connections.config as non-secret metadata; credential material must remain behind secret_ref/vault authority.';
