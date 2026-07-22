alter table public.repository_capability_evidence
  add column if not exists usage_assertion_ids text[] not null default array[]::text[],
  add column if not exists failed_usage_assertion_ids text[] not null default array[]::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.repository_capability_evidence'::regclass
      and conname = 'repository_capability_failed_usage_subset'
  ) then
    alter table public.repository_capability_evidence
      add constraint repository_capability_failed_usage_subset
      check (failed_usage_assertion_ids <@ usage_assertion_ids);
  end if;
end
$$;

comment on column public.repository_capability_evidence.usage_assertion_ids is
  'Sanitized manifest assertion IDs proving declared code is referenced by repository entrypoints/routes/workers/workflows.';
comment on column public.repository_capability_evidence.failed_usage_assertion_ids is
  'Subset of usage_assertion_ids that did not match at the exact verified commit.';
