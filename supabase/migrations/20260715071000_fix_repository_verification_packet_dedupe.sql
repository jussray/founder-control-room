-- The initial live migration used a partial unique index. PostgREST upsert
-- cannot target a partial index by column list, so replace it with a normal
-- unique constraint. PostgreSQL still permits multiple NULL delivery IDs.

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
