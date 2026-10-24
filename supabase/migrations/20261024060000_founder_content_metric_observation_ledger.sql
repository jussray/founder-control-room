-- Durable founder-content metric observations.
--
-- Observation only. This migration creates no publication, provider-write,
-- scheduling, spend, merge, deploy, or model authority.
--
-- New current-history successor: do not backfill the earlier unmerged
-- September draft migration versions.

begin;

do $block$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'founder_content_posts_post_founder_unique'
       and conrelid = 'public.founder_content_posts'::pg_catalog.regclass
  ) then
    alter table public.founder_content_posts
      add constraint founder_content_posts_post_founder_unique
      unique (post_id, founder_user_id);
  end if;
end;
$block$;

create or replace function public.founder_content_metric_canonical_jsonb(p_value jsonb)
returns text
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $function$
declare
  v_type text;
  v_result text;
begin
  v_type := pg_catalog.jsonb_typeof(p_value);
  if v_type = 'object' then
    select '{' || coalesce(
      pg_catalog.string_agg(
        pg_catalog.to_json(key)::text || ':' || public.founder_content_metric_canonical_jsonb(value),
        ',' order by key collate "C"
      ),
      ''
    ) || '}'
      into v_result
      from pg_catalog.jsonb_each(p_value);
    return v_result;
  elsif v_type = 'array' then
    select '[' || coalesce(
      pg_catalog.string_agg(
        public.founder_content_metric_canonical_jsonb(value),
        ',' order by ordinality
      ),
      ''
    ) || ']'
      into v_result
      from pg_catalog.jsonb_array_elements(p_value) with ordinality;
    return v_result;
  end if;
  return p_value::text;
end;
$function$;

create or replace function public.founder_content_metric_provenance_is_safe(p_provenance jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $function$
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
          or pg_catalog.jsonb_typeof(provenance_entry.value)
             not in ('string', 'number', 'boolean', 'null')
          or (
            pg_catalog.jsonb_typeof(provenance_entry.value) = 'string'
            and pg_catalog.length(provenance_entry.value #>> '{}') > 240
          )
    );
$function$;

create table if not exists public.founder_content_metric_observations (
  observation_id uuid primary key default gen_random_uuid(),
  post_id uuid,
  founder_user_id text not null
    check (founder_user_id = btrim(founder_user_id) and founder_user_id <> ''),
  provider text not null check (provider ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'),
  platform text not null check (platform ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  source text not null check (source in (
    'native_platform', 'native_platform_export', 'official_api_partner',
    'aggregator', 'historical_csv'
  )),
  source_metric_id text check (
    source_metric_id is null or length(source_metric_id) between 1 and 240
  ),
  account_id text not null check (length(btrim(account_id)) between 1 and 240),
  page_id text not null check (length(btrim(page_id)) between 1 and 240),
  external_post_id text check (
    external_post_id is null or length(external_post_id) between 1 and 240
  ),
  audience_segment text check (
    audience_segment is null or length(audience_segment) between 1 and 240
  ),
  metric_name text not null check (length(btrim(metric_name)) between 1 and 240),
  metric_unit text not null check (metric_unit in (
    'count', 'ratio', 'percent', 'milliseconds', 'seconds',
    'currency', 'currency_minor', 'score', 'unknown'
  )),
  metric_value numeric,
  observed_at timestamptz not null,
  period_start timestamptz,
  period_end timestamptz,
  import_kind text not null check (import_kind in ('provider_live', 'historical_csv')),
  provenance jsonb not null default '{}'::jsonb
    check (public.founder_content_metric_provenance_is_safe(provenance)),
  source_row_hash text not null check (source_row_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (idempotency_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint founder_content_metric_post_founder_fk
    foreign key (post_id, founder_user_id)
    references public.founder_content_posts(post_id, founder_user_id)
    on delete restrict,
  constraint founder_content_metric_period_pair_check check (
    (period_start is null and period_end is null)
    or (
      period_start is not null
      and period_end is not null
      and period_start <= period_end
    )
  ),
  constraint founder_content_metric_historical_source_check check (
    import_kind <> 'historical_csv'
    or source in ('historical_csv', 'native_platform_export')
  ),
  unique (founder_user_id, idempotency_key)
);

create index if not exists founder_content_metric_post_observed_idx
  on public.founder_content_metric_observations (post_id, observed_at desc)
  where post_id is not null;

create index if not exists founder_content_metric_account_name_observed_idx
  on public.founder_content_metric_observations (
    founder_user_id, platform, account_id, metric_name, observed_at desc
  );

create index if not exists founder_content_metric_page_segment_idx
  on public.founder_content_metric_observations (
    founder_user_id, page_id, audience_segment, observed_at desc
  );

alter table public.founder_content_metric_observations enable row level security;
drop policy if exists founder_content_metric_observations_service_role_only
  on public.founder_content_metric_observations;
create policy founder_content_metric_observations_service_role_only
  on public.founder_content_metric_observations
  for select
  using (auth.role() = 'service_role');

revoke all on table public.founder_content_metric_observations
  from public, anon, authenticated, service_role;
grant select on table public.founder_content_metric_observations to service_role;

create table if not exists public.founder_content_metric_import_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  founder_user_id text not null
    check (founder_user_id = btrim(founder_user_id) and founder_user_id <> ''),
  post_id uuid,
  actor text not null
    check (actor = btrim(actor) and actor <> '' and length(actor) <= 240),
  normalized_observations integer not null check (normalized_observations > 0),
  inserted_observations integer not null check (inserted_observations >= 0),
  application_import_fingerprint text not null
    check (application_import_fingerprint ~ '^[0-9a-f]{64}$'),
  database_envelope_sha256 text not null
    check (database_envelope_sha256 ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.founder_content_metric_import_receipts enable row level security;
revoke all on table public.founder_content_metric_import_receipts
  from public, anon, authenticated, service_role;
grant select on table public.founder_content_metric_import_receipts to service_role;

create or replace function public.ingest_founder_content_metric_observations(
  p_founder_user_id text,
  p_post_id uuid,
  p_envelope jsonb,
  p_ingested_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_founder_user_id text;
  v_post public.founder_content_posts%rowtype;
  v_observation jsonb;
  v_provider text;
  v_platform text;
  v_source text;
  v_source_metric_id text;
  v_account_id text;
  v_page_id text;
  v_external_post_id text;
  v_audience_segment text;
  v_metric_name text;
  v_metric_unit text;
  v_metric_value numeric;
  v_observed_at timestamptz;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_import_kind text;
  v_provenance jsonb;
  v_idempotency_key text;
  v_source_row_hash text;
  v_existing_source_row_hash text;
  v_inserted integer;
  v_count integer := 0;
begin
  v_founder_user_id := pg_catalog.btrim(p_founder_user_id);
  if v_founder_user_id = '' then
    raise exception 'founder user id is required';
  end if;
  if p_ingested_at is null then
    raise exception 'metric ingestion time is required';
  end if;
  if p_envelope is null or pg_catalog.jsonb_typeof(p_envelope) is distinct from 'object' then
    raise exception 'metrics envelope must be an object';
  end if;
  if p_envelope->>'contract' is distinct from 'fcr/founder-content-metrics@v1' then
    raise exception 'metrics envelope contract is invalid';
  end if;
  if pg_catalog.jsonb_typeof(p_envelope->'observations') is distinct from 'array' then
    raise exception 'metrics observations must be an array';
  end if;
  if pg_catalog.jsonb_array_length(p_envelope->'observations') = 0 then
    raise exception 'metrics observations must contain at least one observation';
  end if;
  if pg_catalog.jsonb_array_length(p_envelope->'observations') > 5000 then
    raise exception 'metrics observation limit exceeded';
  end if;

  if p_post_id is not null then
    select p.*
      into v_post
      from public.founder_content_posts p
     where p.post_id = p_post_id
       and p.founder_user_id = v_founder_user_id
     for update;
    if not found then
      raise exception 'founder-content post not found for metrics subject';
    end if;
  end if;

  for v_observation in
    select value from pg_catalog.jsonb_array_elements(p_envelope->'observations')
  loop
    if pg_catalog.jsonb_typeof(v_observation) is distinct from 'object' then
      raise exception 'metric observation must be an object';
    end if;

    v_provider := pg_catalog.lower(pg_catalog.btrim(coalesce(v_observation->>'provider', '')));
    v_platform := pg_catalog.lower(pg_catalog.btrim(coalesce(v_observation->>'platform', '')));
    v_source := coalesce(v_observation->>'source', '');
    v_source_metric_id := nullif(pg_catalog.btrim(coalesce(v_observation->>'sourceMetricId', '')), '');
    v_account_id := pg_catalog.btrim(coalesce(v_observation->>'accountId', ''));
    v_page_id := pg_catalog.btrim(coalesce(v_observation->>'pageId', ''));
    v_external_post_id := nullif(pg_catalog.btrim(coalesce(v_observation->>'externalPostId', '')), '');
    v_audience_segment := nullif(pg_catalog.btrim(coalesce(v_observation->>'audienceSegment', '')), '');
    v_metric_name := pg_catalog.lower(pg_catalog.btrim(coalesce(v_observation->>'metricName', '')));
    v_metric_unit := coalesce(v_observation->>'metricUnit', '');
    v_import_kind := coalesce(v_observation->>'importKind', '');
    v_provenance := coalesce(v_observation->'provenance', '{}'::jsonb);

    if p_post_id is not null then
      if v_platform <> v_post.platform or v_account_id <> v_post.account_id then
        raise exception 'metric subject identity does not match lifecycle post';
      end if;
      if v_external_post_id is not null
         and v_post.external_post_id is not null
         and v_external_post_id <> v_post.external_post_id then
        raise exception 'metric external post identity does not match lifecycle post';
      end if;
      v_platform := v_post.platform;
      v_account_id := v_post.account_id;
      v_external_post_id := coalesce(v_post.external_post_id, v_external_post_id);
    end if;

    if v_provider !~ '^[a-z0-9][a-z0-9._:-]{0,159}$' then raise exception 'metric provider is invalid'; end if;
    if v_platform !~ '^[a-z0-9][a-z0-9._-]{0,79}$' then raise exception 'metric platform is invalid'; end if;
    if v_source not in ('native_platform','native_platform_export','official_api_partner','aggregator','historical_csv') then raise exception 'metric source is invalid'; end if;
    if v_source_metric_id is not null and pg_catalog.length(v_source_metric_id) > 240 then raise exception 'metric source identity is invalid'; end if;
    if pg_catalog.length(v_account_id) not between 1 and 240 then raise exception 'metric account identity is invalid'; end if;
    if pg_catalog.length(v_page_id) not between 1 and 240 then raise exception 'metric page identity is invalid'; end if;
    if v_external_post_id is not null and pg_catalog.length(v_external_post_id) > 240 then raise exception 'metric external post identity is invalid'; end if;
    if v_audience_segment is not null and pg_catalog.length(v_audience_segment) > 240 then raise exception 'metric audience segment is invalid'; end if;
    if pg_catalog.length(v_metric_name) not between 1 and 240 then raise exception 'metric name is invalid'; end if;
    if v_metric_unit not in ('count','ratio','percent','milliseconds','seconds','currency','currency_minor','score','unknown') then raise exception 'metric unit is invalid'; end if;
    if v_import_kind not in ('provider_live','historical_csv') then raise exception 'metric import kind is invalid'; end if;
    if not (v_observation ? 'metricValue')
       or pg_catalog.jsonb_typeof(v_observation->'metricValue') not in ('number', 'null') then
      raise exception 'metric value must be a number or null';
    end if;
    if not public.founder_content_metric_provenance_is_safe(v_provenance) then
      raise exception 'metric provenance is invalid';
    end if;
    if v_import_kind = 'historical_csv'
       and v_source not in ('historical_csv','native_platform_export') then
      raise exception 'historical metric source is invalid';
    end if;

    if coalesce(v_observation->>'observedAt', '') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$' then
      raise exception 'metric observedAt must be offset-aware with millisecond precision or less';
    end if;
    if nullif(v_observation->>'periodStart', '') is not null
       and (v_observation->>'periodStart') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$' then
      raise exception 'metric periodStart must be offset-aware with millisecond precision or less';
    end if;
    if nullif(v_observation->>'periodEnd', '') is not null
       and (v_observation->>'periodEnd') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$' then
      raise exception 'metric periodEnd must be offset-aware with millisecond precision or less';
    end if;

    begin
      v_observed_at := (v_observation->>'observedAt')::timestamptz;
      v_period_start := nullif(v_observation->>'periodStart', '')::timestamptz;
      v_period_end := nullif(v_observation->>'periodEnd', '')::timestamptz;
    exception when others then
      raise exception 'metric timestamp is not a real calendar timestamp';
    end;

    if (v_period_start is null) <> (v_period_end is null) then
      raise exception 'metric periodStart and periodEnd must be supplied together';
    end if;
    if v_period_start is not null and v_period_start > v_period_end then
      raise exception 'metric periodStart must not be after periodEnd';
    end if;

    if pg_catalog.jsonb_typeof(v_observation->'metricValue') = 'null' then
      v_metric_value := null;
    else
      v_metric_value := (v_observation->>'metricValue')::numeric;
    end if;

    v_source_row_hash := encode(extensions.digest(
      public.founder_content_metric_canonical_jsonb(pg_catalog.jsonb_build_object(
        'provider', v_provider,
        'platform', v_platform,
        'source', v_source,
        'sourceMetricId', v_source_metric_id,
        'accountId', v_account_id,
        'pageId', v_page_id,
        'externalPostId', v_external_post_id,
        'audienceSegment', v_audience_segment,
        'metricName', v_metric_name,
        'metricUnit', v_metric_unit,
        'metricValue', v_metric_value,
        'observedAt', pg_catalog.to_char(v_observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'periodStart', case when v_period_start is null then null else pg_catalog.to_char(v_period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
        'periodEnd', case when v_period_end is null then null else pg_catalog.to_char(v_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
        'importKind', v_import_kind,
        'provenance', v_provenance
      )),
      'sha256'
    ), 'hex');

    v_idempotency_key := encode(extensions.digest(
      public.founder_content_metric_canonical_jsonb(pg_catalog.jsonb_build_object(
        'postId', p_post_id,
        'provider', v_provider,
        'platform', v_platform,
        'source', v_source,
        'sourceMetricId', v_source_metric_id,
        'accountId', v_account_id,
        'pageId', v_page_id,
        'externalPostId', v_external_post_id,
        'audienceSegment', v_audience_segment,
        'metricName', v_metric_name,
        'metricUnit', v_metric_unit,
        'observedAt', pg_catalog.to_char(v_observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'periodStart', case when v_period_start is null then null else pg_catalog.to_char(v_period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
        'periodEnd', case when v_period_end is null then null else pg_catalog.to_char(v_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
        'importKind', v_import_kind
      )),
      'sha256'
    ), 'hex');

    insert into public.founder_content_metric_observations (
      post_id, founder_user_id, provider, platform, source, source_metric_id,
      account_id, page_id, external_post_id, audience_segment, metric_name,
      metric_unit, metric_value, observed_at, period_start, period_end,
      import_kind, provenance, source_row_hash, idempotency_key, created_at
    ) values (
      p_post_id, v_founder_user_id, v_provider, v_platform, v_source,
      v_source_metric_id, v_account_id, v_page_id, v_external_post_id,
      v_audience_segment, v_metric_name, v_metric_unit, v_metric_value,
      v_observed_at, v_period_start, v_period_end, v_import_kind, v_provenance,
      v_source_row_hash, v_idempotency_key, p_ingested_at
    )
    on conflict (founder_user_id, idempotency_key) do nothing;

    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      v_count := v_count + 1;
    else
      select m.source_row_hash
        into v_existing_source_row_hash
        from public.founder_content_metric_observations m
       where m.founder_user_id = v_founder_user_id
         and m.idempotency_key = v_idempotency_key;
      if not found then
        raise exception 'metric idempotency conflict could not be reconciled';
      end if;
      if v_existing_source_row_hash <> v_source_row_hash then
        raise exception 'conflicting duplicate metric identity %', v_idempotency_key;
      end if;
    end if;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.ingest_founder_content_metric_observations(
  text, uuid, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.ingest_founder_content_metric_observations(
  text, uuid, jsonb, timestamptz
) to service_role;

create or replace function public.ingest_founder_content_metrics_from_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if new.event_type = 'metrics_synced' then
    perform public.ingest_founder_content_metric_observations(
      new.founder_user_id,
      new.post_id,
      new.payload->'data',
      new.observed_at
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.ingest_founder_content_metrics_from_lifecycle_event()
  from public, anon, authenticated, service_role;

drop trigger if exists founder_content_metrics_from_lifecycle_event
  on public.founder_content_post_events;
create trigger founder_content_metrics_from_lifecycle_event
after insert on public.founder_content_post_events
for each row
when (new.event_type = 'metrics_synced')
execute function public.ingest_founder_content_metrics_from_lifecycle_event();

create or replace function public.import_founder_content_metric_observations(
  p_founder_user_id text,
  p_post_id uuid,
  p_envelope jsonb,
  p_actor text,
  p_application_import_fingerprint text,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_founder_user_id text;
  v_actor text;
  v_count integer;
  v_receipt_id uuid;
  v_database_envelope_sha256 text;
begin
  v_founder_user_id := pg_catalog.btrim(p_founder_user_id);
  v_actor := coalesce(nullif(pg_catalog.btrim(p_actor), ''), 'historical-import');
  if v_founder_user_id = '' then raise exception 'founder user id is required'; end if;
  if p_observed_at is null then raise exception 'metric import time is required'; end if;
  if p_application_import_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'application import fingerprint is invalid';
  end if;

  v_count := public.ingest_founder_content_metric_observations(
    v_founder_user_id,
    p_post_id,
    p_envelope,
    p_observed_at
  );

  v_database_envelope_sha256 := encode(extensions.digest(
    public.founder_content_metric_canonical_jsonb(p_envelope),
    'sha256'
  ), 'hex');

  insert into public.founder_content_metric_import_receipts (
    founder_user_id,
    post_id,
    actor,
    normalized_observations,
    inserted_observations,
    application_import_fingerprint,
    database_envelope_sha256,
    observed_at
  ) values (
    v_founder_user_id,
    p_post_id,
    v_actor,
    pg_catalog.jsonb_array_length(p_envelope->'observations'),
    v_count,
    p_application_import_fingerprint,
    v_database_envelope_sha256,
    p_observed_at
  )
  returning receipt_id into v_receipt_id;

  if p_post_id is not null then
    insert into public.founder_content_post_events (
      post_id, founder_user_id, event_type, actor, payload, observed_at
    ) values (
      p_post_id,
      v_founder_user_id,
      'metrics_imported',
      v_actor,
      pg_catalog.jsonb_build_object(
        'contract', 'fcr/founder-content-metrics@v1',
        'inserted_observations', v_count,
        'authority', 'observational_only'
      ),
      p_observed_at
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'receipt_id', v_receipt_id,
    'inserted_observations', v_count,
    'database_envelope_sha256', v_database_envelope_sha256
  );
end;
$function$;

revoke all on function public.import_founder_content_metric_observations(
  text, uuid, jsonb, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.import_founder_content_metric_observations(
  text, uuid, jsonb, text, text, timestamptz
) to service_role;

comment on table public.founder_content_metric_observations is
  'Append-only founder-content analytics observations. Evidence only; no publication, scheduling, provider-write, merge, deploy, spend, or model authority.';

comment on table public.founder_content_metric_import_receipts is
  'Append-only receipts for authenticated founder metric imports, including postless historical imports.';

commit;
