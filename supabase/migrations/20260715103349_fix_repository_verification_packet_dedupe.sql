-- Production-applied migration fossil restored from supabase_migrations.schema_migrations.

drop index if exists public.repository_verification_delivery_dedupe;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.repository_verification_runs'::regclass
      and conname = 'repository_verification_runs_delivery_key'
  ) then
    alter table public.repository_verification_runs
      add constraint repository_verification_runs_delivery_key
      unique(project_id, source, delivery_id);
  end if;
end
$$;
