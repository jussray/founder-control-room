-- Retain existing policy predicates as defense in depth, but remove PUBLIC
-- targeting. Service-role predicates target service_role; all other retained
-- policies target authenticated explicitly.

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
