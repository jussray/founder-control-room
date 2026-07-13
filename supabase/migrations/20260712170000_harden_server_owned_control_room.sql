-- Founder Control Room server-owned database boundary.
--
-- The application backend uses the service-role key for operational reads and
-- writes. The publishable Supabase client is auth-only. Preserve that design by
-- removing accidental direct PostgREST table access from browser roles.
--
-- This migration changes no rows.

create or replace function public.is_founder()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and coalesce((select auth.role()) = 'authenticated', false)
    and exists (
      select 1
      from public.founder_users fu
      where lower(fu.email) = lower((select auth.jwt()) ->> 'email')
    );
$$;

-- Founder authorization is evaluated by the trusted backend. It is not a
-- public RPC and is not required by browser clients.
revoke all on function public.is_founder() from public, anon, authenticated;
grant execute on function public.is_founder() to service_role;

comment on function public.is_founder() is
  'Internal founder predicate. Anonymous-authenticated sessions are rejected; direct browser execution is disabled.';

-- Keep existing policies as documentation and defense in depth, but remove
-- PUBLIC policy targeting. A future direct-client API must add a reviewed table
-- grant and matching denial tests rather than inheriting broad access.
do $policy_roles$
declare
  policy_row record;
begin
  for policy_row in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      p.polname as policy_name,
      coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
      coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as policy_expression
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  loop
    if policy_row.policy_expression ilike '%service_role%' then
      execute format(
        'alter policy %I on %I.%I to service_role',
        policy_row.policy_name,
        policy_row.schema_name,
        policy_row.table_name
      );
    else
      execute format(
        'alter policy %I on %I.%I to authenticated',
        policy_row.policy_name,
        policy_row.schema_name,
        policy_row.table_name
      );
    end if;
  end loop;
end
$policy_roles$;

-- All public-schema Control Room tables are server-owned. Revoke accidental
-- client privileges and retain explicit service-role access.
do $table_grants$
declare
  table_row record;
begin
  for table_row in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'revoke all privileges on table %I.%I from public, anon, authenticated',
      table_row.schemaname,
      table_row.tablename
    );
    execute format(
      'grant all privileges on table %I.%I to service_role',
      table_row.schemaname,
      table_row.tablename
    );
  end loop;
end
$table_grants$;
