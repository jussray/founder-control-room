-- Postcondition for the real forward migration after simulated Supabase defaults.
-- Fail on any unexpected explicit service_role table privilege, not only DELETE.
do $$
declare
  target regclass;
  table_name text;
  expected_privileges text[];
  permission text;
  unexpected text;
  role_name text;
begin
  foreach table_name in array array['quickscan_prospects', 'quickscan_stripe_events'] loop
    target := to_regclass(format('public.%I', table_name));
    if target is null then
      raise exception 'Missing QuickScan table after hardening: %', table_name;
    end if;
    if not exists (select 1 from pg_class where oid = target and relrowsecurity) then
      raise exception 'QuickScan RLS disabled on %', table_name;
    end if;
    if table_name = 'quickscan_prospects' then
      expected_privileges := array['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
    else
      expected_privileges := array['SELECT', 'INSERT', 'UPDATE'];
    end if;

    foreach permission in array expected_privileges loop
      if not has_table_privilege('service_role', target, permission) then
        raise exception 'service_role lacks expected % on %', permission, table_name;
      end if;
    end loop;

    select string_agg(privilege_type, ', ' order by privilege_type)
      into unexpected
      from pg_class c, lateral aclexplode(c.relacl) acl
      where c.oid = target
        and acl.grantee = 'service_role'::regrole
        and not (acl.privilege_type = any(expected_privileges));
    if unexpected is not null then
      raise exception 'service_role has unexpected privileges on %: %', table_name, unexpected;
    end if;

    foreach role_name in array array['anon', 'authenticated'] loop
      foreach permission in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege(role_name, target, permission) then
          raise exception '% has unexpected % on %', role_name, permission, table_name;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;
