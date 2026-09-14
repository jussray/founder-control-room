-- Production-applied migration fossil restored from supabase_migrations.schema_migrations.

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
