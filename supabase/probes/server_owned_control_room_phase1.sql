-- Founder Control Room server-owned boundary proof.
--
-- Read-only catalog probe. It returns no founder email, user identifier,
-- credential, private content, or operational payload.

begin;

create temp table control_room_boundary_results (
  check_name text primary key,
  passed boolean not null,
  detail text not null
) on commit drop;

insert into control_room_boundary_results
select
  'all_public_tables_deny_client_privileges',
  not exists (
    select 1
    from pg_tables t
    where t.schemaname = 'public'
      and (
        has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'SELECT')
        or has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'INSERT')
        or has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'UPDATE')
        or has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'DELETE')
        or has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'SELECT')
        or has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'INSERT')
        or has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'UPDATE')
        or has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'DELETE')
      )
  ),
  'No public-schema Control Room table is directly accessible to anon or authenticated clients';

insert into control_room_boundary_results
select
  'service_role_keeps_table_access',
  not exists (
    select 1
    from pg_tables t
    where t.schemaname = 'public'
      and not has_table_privilege(
        'service_role',
        format('%I.%I', t.schemaname, t.tablename),
        'SELECT,INSERT,UPDATE,DELETE'
      )
  ),
  'Trusted backend service role retains operational table access';

insert into control_room_boundary_results
select
  'policies_do_not_target_public',
  not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and 0 = any(p.polroles)
  ),
  'Every retained RLS policy targets authenticated or service_role explicitly';

insert into control_room_boundary_results
select
  'founder_helper_is_internal',
  not has_function_privilege('public', 'public.is_founder()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.is_founder()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.is_founder()', 'EXECUTE')
    and has_function_privilege('service_role', 'public.is_founder()', 'EXECUTE'),
  'is_founder is not a browser RPC and remains executable by the trusted backend';

insert into control_room_boundary_results
select
  'founder_helper_rejects_anonymous_claims',
  position('is_anonymous' in pg_get_functiondef(p.oid)) > 0
    and position("auth.role()" in pg_get_functiondef(p.oid)) > 0,
  'Founder helper contains explicit anonymous-session and authenticated-role predicates'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'is_founder';

select check_name, passed, detail
from control_room_boundary_results
order by check_name;

rollback;
