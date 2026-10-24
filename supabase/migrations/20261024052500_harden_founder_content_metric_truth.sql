-- Successor hardening for founder-content metric truth.\n-- Additive only: preserve prior migration history while repairing acceptance/audit semantics.\nbegin;\n\ncreate or replace function public.founder_content_metric_canonical_jsonb(p_value jsonb)\nreturns text\nlanguage plpgsql\nimmutable\nparallel safe\nset search_path = pg_catalog\nas $$\ndeclare\n  v_type text;\n  v_result text;\nbegin\n  v_type := pg_catalog.jsonb_typeof(p_value);\n  if v_type = 'object' then\n    select '{' || coalesce(pg_catalog.string_agg(pg_catalog.to_json(key)::text || ':' || public.founder_content_metric_canonical_jsonb(value), ',' order by key collate \"C\"), '') || '}'\n      into v_result\n      from pg_catalog.jsonb_each(p_value);\n    return v_result;\n  elsif v_type = 'array' then\n    select '[' || coalesce(pg_catalog.string_agg(public.founder_content_metric_canonical_jsonb(value), ',' order by ordinality), '') || ']'\n      into v_result\n      from pg_catalog.jsonb_array_elements(p_value) with ordinality;\n    return v_result;\n  end if;\n  return p_value::text;\nend;\n$$;\n\ncreate table if not exists public.founder_content_metric_import_receipts (\n  receipt_id uuid primary key default gen_random_uuid(),\n  founder_user_id text not null check (founder_user_id = btrim(founder_user_id) and founder_user_id <> ''),\n  post_id uuid,\n  actor text not null check (actor = btrim(actor) and actor <> '' and length(actor) <= 240),\n  inserted_observations integer not null check (inserted_observations >= 0),\n  envelope_sha256 text not null check (envelope_sha256 ~ '^[0-9a-f]{64}$'),\n  observed_at timestamptz not null,\n  created_at timestamptz not null default now()\n);\nalter table public.founder_content_metric_import_receipts enable row level security;\nrevoke all on table public.founder_content_metric_import_receipts from public, anon, authenticated, service_role;\ngrant select on table public.founder_content_metric_import_receipts to service_role;\n\ncreate or replace function public.ingest_founder_content_metric_observations(
  p_founder_user_id text,
  p_post_id uuid,
  p_envelope jsonb,
  p_ingested_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.founder_content_posts%rowtype;\n  v_founder_user_id text;
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
  if nullif(btrim(p_founder_user_id), '') is null then
    raise exception 'founder user id is required';
  end if;
  if p_envelope is null or jsonb_typeof(p_envelope) is distinct from 'object' then
    raise exception 'metrics envelope must be an object';
  end if;
  if p_envelope->>'contract' is distinct from 'fcr/founder-content-metrics@v1' then
    raise exception 'metrics envelope contract is invalid';
  end if;
  if jsonb_typeof(p_envelope->'observations') is distinct from 'array' then
    raise exception 'metrics observations must be an array';
  end if;
  if jsonb_array_length(p_envelope->'observations') = 0 then\n    raise exception 'metrics observations must contain at least one observation';\n  end if;\n  if jsonb_array_length(p_envelope->'observations') > 5000 then
    raise exception 'metrics observation limit exceeded';
  end if;

  if p_post_id is not null then
    select * into v_post
    from public.founder_content_posts
    where post_id = p_post_id and founder_user_id = v_founder_user_id
    for update;
    if not found then raise exception 'founder-content post not found for metrics subject'; end if;
  end if;

  for v_observation in select value from jsonb_array_elements(p_envelope->'observations')
  loop
    if jsonb_typeof(v_observation) is distinct from 'object' then
      raise exception 'metric observation must be an object';
    end if;

    v_provider := lower(btrim(coalesce(v_observation->>'provider', '')));
    v_platform := lower(btrim(coalesce(v_observation->>'platform', '')));
    v_source := coalesce(v_observation->>'source', '');
    v_source_metric_id := nullif(btrim(coalesce(v_observation->>'sourceMetricId', '')), '');
    v_account_id := btrim(coalesce(v_observation->>'accountId', ''));
    v_page_id := btrim(coalesce(v_observation->>'pageId', ''));
    v_external_post_id := nullif(btrim(coalesce(v_observation->>'externalPostId', '')), '');
    v_audience_segment := nullif(btrim(coalesce(v_observation->>'audienceSegment', '')), '');
    v_metric_name := lower(btrim(coalesce(v_observation->>'metricName', '')));
    v_metric_unit := coalesce(v_observation->>'metricUnit', '');
    v_import_kind := coalesce(v_observation->>'importKind', '');
    v_provenance := coalesce(v_observation->'provenance', '{}'::jsonb);

    if p_post_id is not null then
      if v_provider <> v_post.provider or v_platform <> v_post.platform or v_account_id <> v_post.account_id then
        raise exception 'metric subject identity does not match lifecycle post';
      end if;
      if v_external_post_id is not null and v_post.external_post_id is not null and v_external_post_id <> v_post.external_post_id then
        raise exception 'metric external post identity does not match lifecycle post';
      end if;
      v_provider := v_post.provider;
      v_platform := v_post.platform;
      v_account_id := v_post.account_id;
      v_external_post_id := coalesce(v_post.external_post_id, v_external_post_id);
    end if;

    if v_provider !~ '^[a-z0-9][a-z0-9._:-]{0,159}$' then raise exception 'metric provider is invalid'; end if;
    if v_platform !~ '^[a-z0-9][a-z0-9._-]{0,79}$' then raise exception 'metric platform is invalid'; end if;
    if v_source not in ('native_platform','native_platform_export','official_api_partner','aggregator','historical_csv') then raise exception 'metric source is invalid'; end if;
    if v_source_metric_id is not null and length(v_source_metric_id) > 240 then raise exception 'metric source identity is invalid'; end if;
    if length(v_account_id) not between 1 and 240 then raise exception 'metric account identity is invalid'; end if;
    if length(v_page_id) not between 1 and 240 then raise exception 'metric page identity is invalid'; end if;
    if v_external_post_id is not null and length(v_external_post_id) > 240 then raise exception 'metric external post identity is invalid'; end if;
    if v_audience_segment is not null and length(v_audience_segment) > 240 then raise exception 'metric audience segment is invalid'; end if;
    if length(v_metric_name) not between 1 and 240 then raise exception 'metric name is invalid'; end if;
    if v_metric_unit not in ('count','ratio','percent','milliseconds','seconds','currency','currency_minor','score','unknown') then raise exception 'metric unit is invalid'; end if;
    if v_import_kind not in ('provider_live','historical_csv') then raise exception 'metric import kind is invalid'; end if;
    if not (v_observation ? 'metricValue') or jsonb_typeof(v_observation->'metricValue') not in ('number', 'null') then raise exception 'metric value must be a number or null'; end if;
    if jsonb_typeof(v_provenance) is distinct from 'object' then raise exception 'metric provenance must be an object'; end if;
    if v_import_kind = 'historical_csv' and v_source not in ('historical_csv','native_platform_export') then raise exception 'historical metric source is invalid'; end if;

    if nullif(v_observation->>'observedAt', '') is null then raise exception 'metric observedAt is required'; end if;
    if (v_observation->>'observedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$' then raise exception 'metric observedAt must be offset-aware with millisecond precision or less'; end if;
    if nullif(v_observation->>'periodStart', '') is not null and (v_observation->>'periodStart') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$' then raise exception 'metric periodStart must be offset-aware with millisecond precision or less'; end if;
    if nullif(v_observation->>'periodEnd', '') is not null and (v_observation->>'periodEnd') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?(Z|[+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$' then raise exception 'metric periodEnd must be offset-aware with millisecond precision or less'; end if;

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

    if jsonb_typeof(v_observation->'metricValue') = 'null' then
      v_metric_value := null;
    else
      begin
        v_metric_value := (v_observation->>'metricValue')::numeric;
      exception when others then
        raise exception 'metric value must be a finite number or null';
      end;
    end if;

    -- Incoming hash fields are never authority. Recompute storage fingerprints
    -- from normalized values before uniqueness or conflict handling. The post
    -- identity is part of the database idempotency subject, so two lifecycle
    -- posts can never silently suppress each other's otherwise identical row.
    v_source_row_hash := encode(extensions.digest(public.founder_content_metric_canonical_jsonb(jsonb_build_object(
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
      'metricValue', case when v_metric_value is null then null else trim_scale(v_metric_value) end,
      'observedAt', to_char(v_observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'periodStart', case when v_period_start is null then null else to_char(v_period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
      'periodEnd', case when v_period_end is null then null else to_char(v_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
      'importKind', v_import_kind,
      'provenance', v_provenance
    )), 'sha256'), 'hex');

    v_idempotency_key := encode(extensions.digest(jsonb_build_object(
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
      'observedAt', to_char(v_observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'periodStart', case when v_period_start is null then null else to_char(v_period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
      'periodEnd', case when v_period_end is null then null else to_char(v_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
      'importKind', v_import_kind
    )), 'sha256'), 'hex');

    insert into public.founder_content_metric_observations (
      post_id, founder_user_id, provider, platform, source, source_metric_id,
      account_id, page_id, external_post_id, audience_segment, metric_name,
      metric_unit, metric_value, observed_at, period_start, period_end,
      import_kind, provenance, source_row_hash, idempotency_key, created_at
    ) values (
      p_post_id,
      v_founder_user_id,
      v_provider,
      v_platform,
      v_source,
      v_source_metric_id,
      v_account_id,
      v_page_id,
      v_external_post_id,
      v_audience_segment,
      v_metric_name,
      v_metric_unit,
      v_metric_value,
      v_observed_at,
      v_period_start,
      v_period_end,
      v_import_kind,
      v_provenance,
      v_source_row_hash,
      v_idempotency_key,
      p_ingested_at
    )
    on conflict (founder_user_id, idempotency_key) do nothing;

    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      v_count := v_count + 1;
    else
      select source_row_hash into v_existing_source_row_hash
      from public.founder_content_metric_observations
      where founder_user_id = v_founder_user_id
        and idempotency_key = v_idempotency_key;
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
$$;

\nrevoke all on function public.ingest_founder_content_metric_observations(text, uuid, jsonb, timestamptz) from public, anon, authenticated;\ngrant execute on function public.ingest_founder_content_metric_observations(text, uuid, jsonb, timestamptz) to service_role;\n\ncreate or replace function public.import_founder_content_metric_observations(
  p_founder_user_id text,
  p_post_id uuid,
  p_envelope jsonb,
  p_actor text default 'historical-import',
  p_observed_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  v_count := public.ingest_founder_content_metric_observations(
    v_founder_user_id,
    p_post_id,
    p_envelope,
    p_observed_at
  );
  insert into public.founder_content_metric_import_receipts (founder_user_id, post_id, actor, inserted_observations, envelope_sha256, observed_at)\n  values (v_founder_user_id, p_post_id, v_actor, v_count, encode(extensions.digest(public.founder_content_metric_canonical_jsonb(p_envelope), 'sha256'), 'hex'), p_observed_at);\n\n  if p_post_id is not null then
    insert into public.founder_content_post_events (
      post_id, founder_user_id, event_type, actor, payload, observed_at
    ) values (
      p_post_id, v_founder_user_id, 'metrics_imported', v_actor,
      jsonb_build_object(
        'contract', 'fcr/founder-content-metrics@v1',
        'inserted_observations', v_count,
        'authority', 'observational_only'
      ),
      p_observed_at
    );
  end if;
  return v_count;
end;
$$;

\nrevoke all on function public.import_founder_content_metric_observations(text, uuid, jsonb, text, timestamptz) from public, anon, authenticated;\ngrant execute on function public.import_founder_content_metric_observations(text, uuid, jsonb, text, timestamptz) to service_role;\n\ncommit;\n