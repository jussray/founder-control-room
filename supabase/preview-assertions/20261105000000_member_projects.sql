-- Verifies the unchanged migration in isolated preview; not live Supabase proof.
do $$
declare
  target regclass := to_regclass('public.fcr_member_projects');
  role_name text;
  permission text;
begin
  if target is null then raise exception 'member projects table missing'; end if;
  if not exists (select 1 from pg_class where oid = target and relrowsecurity) then
    raise exception 'member projects RLS missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = target and confrelid = 'auth.users'::regclass and contype = 'f') then
    raise exception 'member owner FK missing';
  end if;
  foreach role_name in array array['anon', 'authenticated'] loop
    foreach permission in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(role_name, target, permission) then
        raise exception 'client role % unexpectedly has %', role_name, permission;
      end if;
    end loop;
  end loop;
  foreach permission in array array['SELECT', 'INSERT', 'UPDATE'] loop
    if not has_table_privilege('service_role', target, permission) then
      raise exception 'service role missing %', permission;
    end if;
  end loop;
  if has_table_privilege('service_role', target, 'DELETE') then
    raise exception 'unexpected member project delete grant';
  end if;
end;
$$;
