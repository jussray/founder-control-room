-- Keep the database evidence boundary aligned with the TypeScript v1 provenance contract.
-- Direct service-role / SECURITY DEFINER ingestion must not be able to persist
-- nested provider payloads, unbounded metadata, or unsafe provenance keys.

begin;

create or replace function public.founder_content_metric_provenance_is_safe(
  p_provenance jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select
    p_provenance is not null
    and pg_catalog.jsonb_typeof(p_provenance) = 'object'
    and pg_catalog.octet_length(p_provenance::text) <= 32768
    and (
      select pg_catalog.count(*) <= 40
      from pg_catalog.jsonb_object_keys(p_provenance) as provenance_key(key)
    )
    and not exists (
      select 1
      from pg_catalog.jsonb_each(p_provenance) as provenance_entry(key, value)
      where pg_catalog.length(provenance_entry.key) not between 1 and 240
        or provenance_entry.key !~ '^[a-zA-Z0-9_.:-]+$'
        or pg_catalog.jsonb_typeof(provenance_entry.value) not in ('string', 'number', 'boolean', 'null')
        or (
          pg_catalog.jsonb_typeof(provenance_entry.value) = 'string'
          and pg_catalog.length(provenance_entry.value #>> '{}') > 240
        )
    );
$$;

comment on function public.founder_content_metric_provenance_is_safe(jsonb) is
  'Pure bounded validator for founder-content metric provenance: object only, <=40 safe scalar keys, <=240 chars per key/string value, <=32KiB serialized.';

alter table public.founder_content_metric_observations
  drop constraint if exists founder_content_metric_provenance_safe_check;

alter table public.founder_content_metric_observations
  add constraint founder_content_metric_provenance_safe_check
  check (public.founder_content_metric_provenance_is_safe(provenance))
  not valid;

alter table public.founder_content_metric_observations
  validate constraint founder_content_metric_provenance_safe_check;

commit;
