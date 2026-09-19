-- Durable observation-only founder-content metric evidence.
--
-- This table stores normalized metric observations imported through the existing
-- founder-content lifecycle boundary. It never grants publication, scheduling,
-- strategy, provider-write, merge, or deploy authority.
--
-- Source-only until a separately authorized production database migration.

begin;

create table if not exists public.founder_content_metric_observations (
  metric_observation_id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.founder_content_posts(post_id) on delete cascade,
  founder_user_id text not null,
  observation_id text not null check (length(btrim(observation_id)) between 1 and 2000),
  content_fingerprint text not null check (length(btrim(content_fingerprint)) between 1 and 2000),
  provider text not null check (length(btrim(provider)) between 1 and 2000),
  account_id text not null check (length(btrim(account_id)) between 1 and 2000),
  page_id text not null check (length(btrim(page_id)) between 1 and 2000),
  audience_segment text not null check (length(btrim(audience_segment)) between 1 and 2000),
  metric_name text not null check (metric_name in (
    'impressions',
    'reactions',
    'comments',
    'profile_views',
    'attributed_visits',
    'qualified_conversations',
    'attributed_contacts',
    'attributed_deals'
  )),
  metric_value bigint,
  unit text not null check (unit = 'count'),
  evidence_state text not null check (evidence_state in ('OBSERVED', 'UNKNOWN_NO_EVIDENCE')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  observed_at timestamptz not null,
  source text not null check (length(btrim(source)) between 1 and 2000),
  source_ref text not null check (length(btrim(source_ref)) between 1 and 2000),
  row_fingerprint text not null check (row_fingerprint ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz not null default now(),
  constraint founder_content_metric_observations_value_state_check check (
    (metric_value is null and evidence_state = 'UNKNOWN_NO_EVIDENCE')
    or (metric_value is not null and metric_value >= 0 and evidence_state = 'OBSERVED')
  ),
  constraint founder_content_metric_observations_window_check check (window_start <= window_end),
  constraint founder_content_metric_observations_observed_check check (observed_at >= window_end),
  constraint founder_content_metric_observations_business_identity_key unique (
    post_id,
    observation_id,
    content_fingerprint,
    provider,
    account_id,
    page_id,
    audience_segment,
    metric_name,
    window_start,
    window_end
  )
);

create index if not exists founder_content_metric_observations_post_observed_idx
  on public.founder_content_metric_observations (post_id, observed_at desc);

create index if not exists founder_content_metric_observations_founder_metric_idx
  on public.founder_content_metric_observations (founder_user_id, metric_name, observed_at desc);

alter table public.founder_content_metric_observations enable row level security;
drop policy if exists founder_content_metric_observations_service_role_only
  on public.founder_content_metric_observations;
create policy founder_content_metric_observations_service_role_only
  on public.founder_content_metric_observations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.founder_content_metric_observations from public, anon, authenticated;
grant select, insert on table public.founder_content_metric_observations to service_role;
revoke update, delete on table public.founder_content_metric_observations from service_role;

comment on table public.founder_content_metric_observations is
  'Append-only normalized founder-content metric observations. Observation evidence only; never publication, scheduling, strategy, provider-write, merge, deploy, or freshness authority.';

create or replace function public.ingest_founder_content_metric_observations(
  p_founder_user_id text,
  p_post_id uuid,
  p_observations jsonb,
  p_import_fingerprint text,
  p_imported_at timestamptz default now()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  post_row public.founder_content_posts%rowtype;
  item jsonb;
  existing public.founder_content_metric_observations%rowtype;
  inserted_count integer := 0;
  existing_count integer := 0;
  observation_count integer := 0;
  latest_observed_at timestamptz := null;
  v_observation_id text;
  v_content_fingerprint text;
  v_provider text;
  v_account_id text;
  v_page_id text;
  v_audience_segment text;
  v_metric_name text;
  v_metric_value bigint;
  v_unit text;
  v_evidence_state text;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_observed_at timestamptz;
  v_source text;
  v_source_ref text;
  v_row_fingerprint text;
begin
  if p_post_id is null or coalesce(btrim(p_founder_user_id), '') = '' then
    raise exception 'FOUNDER_CONTENT_METRICS_IDENTITY_REQUIRED';
  end if;
  if p_imported_at is null then
    raise exception 'FOUNDER_CONTENT_METRICS_IMPORTED_AT_REQUIRED';
  end if;
  if coalesce(btrim(p_import_fingerprint), '') !~ '^[0-9a-f]{64}$' then
    raise exception 'FOUNDER_CONTENT_METRICS_IMPORT_FINGERPRINT_INVALID';
  end if;
  if p_observations is null or jsonb_typeof(p_observations) <> 'array' or jsonb_array_length(p_observations) < 1 then
    raise exception 'FOUNDER_CONTENT_METRICS_OBSERVATIONS_REQUIRED';
  end if;
  if jsonb_array_length(p_observations) > 10000 then
    raise exception 'FOUNDER_CONTENT_METRICS_OBSERVATION_LIMIT_EXCEEDED';
  end if;

  select p.*
    into post_row
    from public.founder_content_posts p
   where p.post_id = p_post_id
     and p.founder_user_id = btrim(p_founder_user_id)
   for share;
  if not found then
    raise exception 'FOUNDER_CONTENT_POST_NOT_FOUND';
  end if;

  for item in select value from jsonb_array_elements(p_observations)
  loop
    observation_count := observation_count + 1;
    if jsonb_typeof(item) <> 'object' then
      raise exception 'FOUNDER_CONTENT_METRICS_OBSERVATION_INVALID';
    end if;

    v_observation_id := btrim(coalesce(item->>'observationId', ''));
    v_content_fingerprint := btrim(coalesce(item->>'contentFingerprint', ''));
    v_provider := btrim(coalesce(item->>'provider', ''));
    v_account_id := btrim(coalesce(item->>'accountId', ''));
    v_page_id := btrim(coalesce(item->>'pageId', ''));
    v_audience_segment := btrim(coalesce(item->>'audienceSegment', ''));
    v_metric_name := btrim(coalesce(item->>'metricName', ''));
    v_unit := btrim(coalesce(item->>'unit', ''));
    v_evidence_state := btrim(coalesce(item->>'evidenceState', ''));
    v_source := btrim(coalesce(item#>>'{provenance,source}', ''));
    v_source_ref := btrim(coalesce(item#>>'{provenance,sourceRef}', ''));
    v_row_fingerprint := lower(btrim(coalesce(item#>>'{provenance,rowFingerprint}', '')));

    if least(
      length(v_observation_id),
      length(v_content_fingerprint),
      length(v_provider),
      length(v_account_id),
      length(v_page_id),
      length(v_audience_segment),
      length(v_metric_name),
      length(v_unit),
      length(v_evidence_state),
      length(v_source),
      length(v_source_ref),
      length(v_row_fingerprint)
    ) < 1 then
      raise exception 'FOUNDER_CONTENT_METRICS_REQUIRED_FIELD_MISSING';
    end if;
    if greatest(
      length(v_observation_id),
      length(v_content_fingerprint),
      length(v_provider),
      length(v_account_id),
      length(v_page_id),
      length(v_audience_segment),
      length(v_source),
      length(v_source_ref)
    ) > 2000 then
      raise exception 'FOUNDER_CONTENT_METRICS_FIELD_TOO_LONG';
    end if;

    if v_content_fingerprint <> post_row.content_hash
       or v_provider <> post_row.provider
       or v_account_id <> post_row.account_id then
      raise exception 'FOUNDER_CONTENT_METRICS_POST_IDENTITY_MISMATCH';
    end if;
    if v_metric_name not in (
      'impressions', 'reactions', 'comments', 'profile_views',
      'attributed_visits', 'qualified_conversations', 'attributed_contacts', 'attributed_deals'
    ) then
      raise exception 'FOUNDER_CONTENT_METRICS_METRIC_UNSUPPORTED';
    end if;
    if v_unit <> 'count' then
      raise exception 'FOUNDER_CONTENT_METRICS_UNIT_INVALID';
    end if;
    if v_evidence_state not in ('OBSERVED', 'UNKNOWN_NO_EVIDENCE') then
      raise exception 'FOUNDER_CONTENT_METRICS_EVIDENCE_STATE_INVALID';
    end if;
    if v_row_fingerprint !~ '^[0-9a-f]{64}$' then
      raise exception 'FOUNDER_CONTENT_METRICS_ROW_FINGERPRINT_INVALID';
    end if;

    begin
      v_window_start := (item->>'windowStart')::timestamptz;
      v_window_end := (item->>'windowEnd')::timestamptz;
      v_observed_at := (item->>'observedAt')::timestamptz;
    exception when others then
      raise exception 'FOUNDER_CONTENT_METRICS_TIMESTAMP_INVALID';
    end;
    if v_window_start is null or v_window_end is null or v_observed_at is null
       or v_window_start > v_window_end or v_observed_at < v_window_end then
      raise exception 'FOUNDER_CONTENT_METRICS_TIME_ORDER_INVALID';
    end if;

    if item->>'metricValue' is null then
      v_metric_value := null;
      if v_evidence_state <> 'UNKNOWN_NO_EVIDENCE' then
        raise exception 'FOUNDER_CONTENT_METRICS_NULL_VALUE_STATE_INVALID';
      end if;
    else
      if (item->>'metricValue') !~ '^(0|[1-9][0-9]*)$' then
        raise exception 'FOUNDER_CONTENT_METRICS_VALUE_INVALID';
      end if;
      begin
        v_metric_value := (item->>'metricValue')::bigint;
      exception when others then
        raise exception 'FOUNDER_CONTENT_METRICS_VALUE_INVALID';
      end;
      if v_metric_value < 0 or v_evidence_state <> 'OBSERVED' then
        raise exception 'FOUNDER_CONTENT_METRICS_VALUE_STATE_INVALID';
      end if;
    end if;

    select m.*
      into existing
      from public.founder_content_metric_observations m
     where m.post_id = p_post_id
       and m.observation_id = v_observation_id
       and m.content_fingerprint = v_content_fingerprint
       and m.provider = v_provider
       and m.account_id = v_account_id
       and m.page_id = v_page_id
       and m.audience_segment = v_audience_segment
       and m.metric_name = v_metric_name
       and m.window_start = v_window_start
       and m.window_end = v_window_end;

    if found then
      if existing.metric_value is distinct from v_metric_value
         or existing.unit <> v_unit
         or existing.evidence_state <> v_evidence_state
         or existing.observed_at <> v_observed_at
         or existing.source <> v_source
         or existing.source_ref <> v_source_ref
         or existing.row_fingerprint <> v_row_fingerprint then
        raise exception 'FOUNDER_CONTENT_METRICS_CONFLICT';
      end if;
      existing_count := existing_count + 1;
    else
      insert into public.founder_content_metric_observations (
        post_id,
        founder_user_id,
        observation_id,
        content_fingerprint,
        provider,
        account_id,
        page_id,
        audience_segment,
        metric_name,
        metric_value,
        unit,
        evidence_state,
        window_start,
        window_end,
        observed_at,
        source,
        source_ref,
        row_fingerprint,
        imported_at
      ) values (
        p_post_id,
        post_row.founder_user_id,
        v_observation_id,
        v_content_fingerprint,
        v_provider,
        v_account_id,
        v_page_id,
        v_audience_segment,
        v_metric_name,
        v_metric_value,
        v_unit,
        v_evidence_state,
        v_window_start,
        v_window_end,
        v_observed_at,
        v_source,
        v_source_ref,
        v_row_fingerprint,
        p_imported_at
      );
      inserted_count := inserted_count + 1;
    end if;

    if latest_observed_at is null or v_observed_at > latest_observed_at then
      latest_observed_at := v_observed_at;
    end if;
  end loop;

  insert into public.founder_content_post_events (
    post_id,
    founder_user_id,
    event_type,
    actor,
    payload,
    observed_at
  ) values (
    p_post_id,
    post_row.founder_user_id,
    'metrics_csv_imported',
    'fcr:metrics-csv-import',
    jsonb_build_object(
      'contract', 'content-metrics-csv@v1',
      'authority', 'observation_only',
      'import_fingerprint', btrim(p_import_fingerprint),
      'normalized_row_count', observation_count,
      'inserted_row_count', inserted_count,
      'existing_row_count', existing_count,
      'latest_observed_at', latest_observed_at
    ),
    p_imported_at
  );

  return jsonb_build_object(
    'contract', 'fcr/founder-content-metric-observation-store@v1',
    'authority', 'observation_only',
    'importFingerprint', btrim(p_import_fingerprint),
    'normalizedRowCount', observation_count,
    'insertedRowCount', inserted_count,
    'existingRowCount', existing_count,
    'latestObservedAt', latest_observed_at,
    'publicationAuthority', false,
    'freshnessAuthority', false,
    'strategyMutationAuthority', false
  );
end;
$function$;

revoke all on function public.ingest_founder_content_metric_observations(
  text, uuid, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.ingest_founder_content_metric_observations(
  text, uuid, jsonb, text, timestamptz
) to service_role;

commit;
