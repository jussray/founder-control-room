-- Founder-content metric evidence persistence.
-- Observation-only: this schema cannot authorize publication, strategy mutation, or freshness.
-- All mutation is forced through the service-role-only RPC.

create table if not exists public.founder_content_metric_observations (
  id uuid primary key default gen_random_uuid(),
  founder_user_id text not null check (length(founder_user_id) between 1 and 200),
  first_import_fingerprint text not null check (first_import_fingerprint ~ '^[0-9a-f]{64}$'),
  identity_fingerprint text not null check (identity_fingerprint ~ '^[0-9a-f]{64}$'),
  storage_fingerprint text not null check (storage_fingerprint ~ '^[0-9a-f]{64}$'),
  source_row_fingerprint text not null check (source_row_fingerprint ~ '^[0-9a-f]{64}$'),
  observation_id text not null check (length(observation_id) between 1 and 2000),
  content_fingerprint text not null check (length(content_fingerprint) between 1 and 2000),
  provider text not null check (length(provider) between 1 and 2000),
  account_id text not null check (length(account_id) between 1 and 2000),
  page_id text not null check (length(page_id) between 1 and 2000),
  audience_segment text not null check (length(audience_segment) between 1 and 2000),
  metric_name text not null check (
    metric_name in (
      'impressions',
      'reactions',
      'comments',
      'profile_views',
      'attributed_visits',
      'qualified_conversations',
      'attributed_contacts',
      'attributed_deals'
    )
  ),
  metric_value bigint,
  unit text not null check (unit = 'count'),
  window_start timestamptz not null,
  window_end timestamptz not null,
  observed_at timestamptz not null,
  evidence_state text not null check (evidence_state in ('OBSERVED', 'UNKNOWN_NO_EVIDENCE')),
  source text not null check (length(source) between 1 and 2000),
  source_ref text not null check (length(source_ref) between 1 and 2000),
  imported_at timestamptz not null default now(),
  constraint founder_content_metric_window_order check (window_start <= window_end),
  constraint founder_content_metric_observed_after_window check (observed_at >= window_end),
  constraint founder_content_metric_value_state check (
    (evidence_state = 'OBSERVED' and metric_value is not null and metric_value >= 0)
    or
    (evidence_state = 'UNKNOWN_NO_EVIDENCE' and metric_value is null)
  ),
  constraint founder_content_metric_identity_unique unique (founder_user_id, identity_fingerprint)
);

create index if not exists founder_content_metric_observed_at_idx
  on public.founder_content_metric_observations (founder_user_id, observed_at desc);

alter table public.founder_content_metric_observations enable row level security;

revoke all on table public.founder_content_metric_observations from public, anon, authenticated, service_role;
grant select on table public.founder_content_metric_observations to service_role;

create or replace function public.ingest_founder_content_metrics_v1(
  p_founder_user_id text,
  p_receipt jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observation jsonb;
  v_import_fingerprint text;
  v_identity_fingerprint text;
  v_storage_fingerprint text;
  v_existing_storage_fingerprint text;
  v_source_row_fingerprint text;
  v_metric_value bigint;
  v_inserted integer := 0;
  v_idempotent integer := 0;
begin
  if p_founder_user_id is null
     or length(trim(p_founder_user_id)) < 1
     or length(trim(p_founder_user_id)) > 200 then
    raise exception 'founder content metric founder identity is invalid';
  end if;

  if jsonb_typeof(p_receipt) <> 'object'
     or p_receipt->>'contract' <> 'content-metrics-csv@v1'
     or p_receipt->>'authority' <> 'observation_only'
     or p_receipt->'freshnessAuthority' <> 'false'::jsonb
     or p_receipt->'publicationAuthority' <> 'false'::jsonb
     or p_receipt->'strategyMutationAuthority' <> 'false'::jsonb then
    raise exception 'founder content metric receipt authority contract is invalid';
  end if;

  v_import_fingerprint := lower(coalesce(p_receipt->>'importFingerprint', ''));
  if v_import_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'founder content metric import fingerprint is invalid';
  end if;

  if jsonb_typeof(p_receipt->'observations') <> 'array'
     or jsonb_array_length(p_receipt->'observations') > 10000 then
    raise exception 'founder content metric observations must be a bounded array';
  end if;

  for v_observation in
    select value from jsonb_array_elements(p_receipt->'observations')
  loop
    if jsonb_typeof(v_observation) <> 'object'
       or jsonb_typeof(v_observation->'provenance') <> 'object' then
      raise exception 'founder content metric observation shape is invalid';
    end if;

    if coalesce(v_observation->>'metricName', '') not in (
      'impressions',
      'reactions',
      'comments',
      'profile_views',
      'attributed_visits',
      'qualified_conversations',
      'attributed_contacts',
      'attributed_deals'
    ) or v_observation->>'unit' <> 'count' then
      raise exception 'founder content metric name or unit is invalid';
    end if;

    if coalesce(v_observation->>'evidenceState', '') = 'OBSERVED' then
      if jsonb_typeof(v_observation->'metricValue') <> 'number' then
        raise exception 'observed founder content metric requires numeric value';
      end if;
      v_metric_value := (v_observation->>'metricValue')::bigint;
      if v_metric_value < 0 then
        raise exception 'founder content metric value must be non-negative';
      end if;
    elsif coalesce(v_observation->>'evidenceState', '') = 'UNKNOWN_NO_EVIDENCE' then
      if v_observation->'metricValue' is distinct from 'null'::jsonb then
        raise exception 'unknown founder content metric must keep null value';
      end if;
      v_metric_value := null;
    else
      raise exception 'founder content metric evidence state is invalid';
    end if;

    if (v_observation->>'windowStart')::timestamptz > (v_observation->>'windowEnd')::timestamptz
       or (v_observation->>'observedAt')::timestamptz < (v_observation->>'windowEnd')::timestamptz then
      raise exception 'founder content metric temporal ordering is invalid';
    end if;

    if length(coalesce(v_observation->>'observationId', '')) not between 1 and 2000
       or length(coalesce(v_observation->>'contentFingerprint', '')) not between 1 and 2000
       or length(coalesce(v_observation->>'provider', '')) not between 1 and 2000
       or length(coalesce(v_observation->>'accountId', '')) not between 1 and 2000
       or length(coalesce(v_observation->>'pageId', '')) not between 1 and 2000
       or length(coalesce(v_observation->>'audienceSegment', '')) not between 1 and 2000
       or length(coalesce(v_observation->'provenance'->>'source', '')) not between 1 and 2000
       or length(coalesce(v_observation->'provenance'->>'sourceRef', '')) not between 1 and 2000 then
      raise exception 'founder content metric bounded identity/provenance is invalid';
    end if;

    v_source_row_fingerprint := lower(coalesce(v_observation->'provenance'->>'rowFingerprint', ''));
    if v_source_row_fingerprint !~ '^[0-9a-f]{64}$' then
      raise exception 'founder content metric source row fingerprint is invalid';
    end if;

    v_identity_fingerprint := encode(extensions.digest(
      jsonb_build_array(
        trim(p_founder_user_id),
        v_observation->>'observationId',
        v_observation->>'contentFingerprint',
        v_observation->>'provider',
        v_observation->>'accountId',
        v_observation->>'pageId',
        v_observation->>'audienceSegment',
        v_observation->>'metricName',
        v_observation->>'windowStart',
        v_observation->>'windowEnd'
      )::text,
      'sha256'
    ), 'hex');

    v_storage_fingerprint := encode(extensions.digest(
      jsonb_build_array(
        v_identity_fingerprint,
        v_observation->'metricValue',
        v_observation->>'unit',
        v_observation->>'observedAt',
        v_observation->>'evidenceState',
        v_observation->'provenance'->>'source',
        v_observation->'provenance'->>'sourceRef'
      )::text,
      'sha256'
    ), 'hex');

    v_existing_storage_fingerprint := null;

    insert into public.founder_content_metric_observations (
      founder_user_id,
      first_import_fingerprint,
      identity_fingerprint,
      storage_fingerprint,
      source_row_fingerprint,
      observation_id,
      content_fingerprint,
      provider,
      account_id,
      page_id,
      audience_segment,
      metric_name,
      metric_value,
      unit,
      window_start,
      window_end,
      observed_at,
      evidence_state,
      source,
      source_ref
    ) values (
      trim(p_founder_user_id),
      v_import_fingerprint,
      v_identity_fingerprint,
      v_storage_fingerprint,
      v_source_row_fingerprint,
      v_observation->>'observationId',
      v_observation->>'contentFingerprint',
      v_observation->>'provider',
      v_observation->>'accountId',
      v_observation->>'pageId',
      v_observation->>'audienceSegment',
      v_observation->>'metricName',
      v_metric_value,
      v_observation->>'unit',
      (v_observation->>'windowStart')::timestamptz,
      (v_observation->>'windowEnd')::timestamptz,
      (v_observation->>'observedAt')::timestamptz,
      v_observation->>'evidenceState',
      v_observation->'provenance'->>'source',
      v_observation->'provenance'->>'sourceRef'
    )
    on conflict (founder_user_id, identity_fingerprint) do nothing
    returning storage_fingerprint into v_existing_storage_fingerprint;

    if v_existing_storage_fingerprint is not null then
      v_inserted := v_inserted + 1;
    else
      select storage_fingerprint
      into v_existing_storage_fingerprint
      from public.founder_content_metric_observations
      where founder_user_id = trim(p_founder_user_id)
        and identity_fingerprint = v_identity_fingerprint;

      if v_existing_storage_fingerprint is distinct from v_storage_fingerprint then
        raise exception 'founder content metric conflicting duplicate identity';
      end if;
      v_idempotent := v_idempotent + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'contract', 'fcr/founder-content-metric-import@v1',
    'importFingerprint', v_import_fingerprint,
    'insertedCount', v_inserted,
    'idempotentCount', v_idempotent,
    'authority', 'observation_only',
    'freshnessAuthority', false,
    'publicationAuthority', false,
    'strategyMutationAuthority', false
  );
end;
$$;

revoke all on function public.ingest_founder_content_metrics_v1(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.ingest_founder_content_metrics_v1(text, jsonb)
  to service_role;

comment on table public.founder_content_metric_observations is
  'Append-only founder-content metric evidence. Observation-only; never publication or strategy authority.';
