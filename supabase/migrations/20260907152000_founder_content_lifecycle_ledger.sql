-- Durable provider-neutral founder-content editorial lifecycle.
--
-- This ledger owns public draft payload + lifecycle state only. It does NOT own
-- founder publication authority, cadence authority, provider credentials, or
-- provider-write reservations. Those remain in founder_content_approvals,
-- founder_content_cadence_reservations, connection vault/provider adapters, and
-- approval_executions respectively.
--
-- Source-only until an explicitly authorized database apply. Committing this
-- migration does not mutate production Supabase state.

begin;

create table if not exists public.founder_content_posts (
  post_id uuid primary key default gen_random_uuid(),
  founder_user_id text not null,
  provider text not null
    check (provider ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'),
  platform text not null
    check (platform ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  account_id text not null
    check (length(btrim(account_id)) between 1 and 240),
  title text not null default '',
  public_payload jsonb not null default '{}'::jsonb,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  media_count integer not null default 0 check (media_count between 0 and 100),
  status text not null default 'pending_approval'
    check (status in (
      'pending_approval',
      'approved',
      'scheduled',
      'publishing',
      'posted',
      'rejected',
      'failed',
      'outcome_unknown'
    )),
  provider_write_state text not null default 'not_attempted'
    check (provider_write_state in (
      'not_attempted',
      'attempted',
      'verified_published',
      'verified_failed',
      'unknown'
    )),
  approval_id text references public.founder_content_approvals(approval_id) on delete set null,
  execution_id uuid references public.approval_executions(id) on delete set null,
  scheduled_at timestamptz,
  posted_at timestamptz,
  external_post_id text,
  permalink text check (permalink is null or permalink ~ '^https://'),
  retry_count integer not null default 0 check (retry_count between 0 and 1000),
  last_error text,
  last_metrics_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint founder_content_posts_public_payload_object_check
    check (jsonb_typeof(public_payload) = 'object'),
  constraint founder_content_posts_publication_pair_check
    check (
      (status = 'posted' and provider_write_state = 'verified_published'
        and posted_at is not null and external_post_id is not null and permalink is not null)
      or status <> 'posted'
    ),
  constraint founder_content_posts_unknown_write_check
    check (status <> 'outcome_unknown' or provider_write_state = 'unknown'),
  constraint founder_content_posts_state_write_compatibility_check
    check (
      (status in ('pending_approval', 'approved', 'scheduled') and provider_write_state = 'not_attempted')
      or (status = 'publishing' and provider_write_state = 'attempted')
      or (status = 'posted' and provider_write_state = 'verified_published')
      or (status = 'failed' and provider_write_state in ('not_attempted', 'verified_failed'))
      or (status = 'outcome_unknown' and provider_write_state = 'unknown')
      or (status = 'rejected' and provider_write_state in ('not_attempted', 'verified_failed'))
    )
);

create index if not exists founder_content_posts_founder_status_idx
  on public.founder_content_posts (founder_user_id, status, updated_at desc);

create index if not exists founder_content_posts_founder_platform_idx
  on public.founder_content_posts (founder_user_id, platform, updated_at desc);

create index if not exists founder_content_posts_approval_idx
  on public.founder_content_posts (approval_id)
  where approval_id is not null;

create index if not exists founder_content_posts_execution_idx
  on public.founder_content_posts (execution_id)
  where execution_id is not null;

alter table public.founder_content_posts enable row level security;
drop policy if exists founder_content_posts_service_role_only on public.founder_content_posts;
create policy founder_content_posts_service_role_only on public.founder_content_posts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.founder_content_posts from public, anon, authenticated;
grant select, insert, update, delete on table public.founder_content_posts to service_role;

comment on table public.founder_content_posts is
  'Service-role-only provider-neutral founder-content editorial state. Public draft payload and lifecycle truth only; approval, cadence, credential, and provider-write authority live in separate canonical FCR stores.';

create table if not exists public.founder_content_post_events (
  event_id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.founder_content_posts(post_id) on delete cascade,
  founder_user_id text not null,
  event_type text not null
    check (event_type ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'),
  actor text not null default 'fcr',
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  constraint founder_content_post_events_payload_object_check
    check (jsonb_typeof(payload) = 'object')
);

create index if not exists founder_content_post_events_post_idx
  on public.founder_content_post_events (post_id, observed_at desc);

create index if not exists founder_content_post_events_founder_type_idx
  on public.founder_content_post_events (founder_user_id, event_type, observed_at desc);

alter table public.founder_content_post_events enable row level security;
drop policy if exists founder_content_post_events_service_role_only on public.founder_content_post_events;
create policy founder_content_post_events_service_role_only on public.founder_content_post_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.founder_content_post_events from public, anon, authenticated;
grant select, insert on table public.founder_content_post_events to service_role;
revoke update, delete on table public.founder_content_post_events from service_role;

comment on table public.founder_content_post_events is
  'Append-only founder-content lifecycle evidence. Review comments, state transitions, provider readback, operational logs, and metric snapshots are recorded as events and never used as publication authority by themselves.';

-- Append observational evidence without changing lifecycle state. This is used
-- for review comments, logs, provider-read observations, and metric snapshots.
create or replace function public.record_founder_content_post_event(
  p_post_id uuid,
  p_founder_user_id text,
  p_event_type text,
  p_actor text,
  p_payload jsonb,
  p_observed_at timestamptz default now()
)
returns public.founder_content_post_events
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  inserted public.founder_content_post_events%rowtype;
begin
  if p_post_id is null or coalesce(btrim(p_founder_user_id), '') = '' then
    raise exception 'FOUNDER_CONTENT_EVENT_IDENTITY_REQUIRED';
  end if;
  if coalesce(btrim(p_event_type), '') !~ '^[a-z0-9][a-z0-9._:-]{0,119}$' then
    raise exception 'FOUNDER_CONTENT_EVENT_TYPE_INVALID';
  end if;
  if coalesce(btrim(p_actor), '') = '' then
    raise exception 'FOUNDER_CONTENT_EVENT_ACTOR_REQUIRED';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'FOUNDER_CONTENT_EVENT_PAYLOAD_INVALID';
  end if;
  if p_observed_at is null then
    raise exception 'FOUNDER_CONTENT_EVENT_TIME_REQUIRED';
  end if;

  perform 1
    from public.founder_content_posts p
   where p.post_id = p_post_id
     and p.founder_user_id = btrim(p_founder_user_id);
  if not found then
    raise exception 'FOUNDER_CONTENT_POST_NOT_FOUND';
  end if;

  insert into public.founder_content_post_events (
    post_id, founder_user_id, event_type, actor, payload, observed_at
  ) values (
    p_post_id,
    btrim(p_founder_user_id),
    btrim(p_event_type),
    btrim(p_actor),
    p_payload,
    p_observed_at
  ) returning * into inserted;

  return inserted;
end;
$function$;

revoke all on function public.record_founder_content_post_event(
  uuid, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_founder_content_post_event(
  uuid, text, text, text, jsonb, timestamptz
) to service_role;

-- Atomic compare-and-set lifecycle transition. The caller must prove the exact
-- prior state. The state update and append-only event are one transaction, so a
-- receipt failure cannot leave an unrecorded lifecycle mutation behind.
create or replace function public.mutate_founder_content_post_lifecycle(
  p_post_id uuid,
  p_founder_user_id text,
  p_expected_status text,
  p_expected_provider_write_state text,
  p_next_status text,
  p_next_provider_write_state text,
  p_patch jsonb,
  p_event_type text,
  p_actor text,
  p_event_payload jsonb,
  p_observed_at timestamptz default now()
)
returns public.founder_content_posts
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  current_row public.founder_content_posts%rowtype;
  updated_row public.founder_content_posts%rowtype;
  invalid_patch_key text;
begin
  if p_post_id is null or coalesce(btrim(p_founder_user_id), '') = '' then
    raise exception 'FOUNDER_CONTENT_MUTATION_IDENTITY_REQUIRED';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'FOUNDER_CONTENT_MUTATION_PATCH_INVALID';
  end if;
  if p_event_payload is null or jsonb_typeof(p_event_payload) <> 'object' then
    raise exception 'FOUNDER_CONTENT_MUTATION_EVENT_INVALID';
  end if;
  if coalesce(btrim(p_event_type), '') !~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
     or coalesce(btrim(p_actor), '') = ''
     or p_observed_at is null then
    raise exception 'FOUNDER_CONTENT_MUTATION_EVENT_METADATA_INVALID';
  end if;

  select key
    into invalid_patch_key
    from jsonb_object_keys(p_patch) as keys(key)
   where key not in (
     'approval_id',
     'execution_id',
     'scheduled_at',
     'posted_at',
     'external_post_id',
     'permalink',
     'retry_count',
     'last_error',
     'last_metrics_sync_at'
   )
   limit 1;
  if invalid_patch_key is not null then
    raise exception 'FOUNDER_CONTENT_MUTATION_PATCH_KEY_INVALID:%', invalid_patch_key;
  end if;

  select p.*
    into current_row
    from public.founder_content_posts p
   where p.post_id = p_post_id
     and p.founder_user_id = btrim(p_founder_user_id)
     and p.status = btrim(p_expected_status)
     and p.provider_write_state = btrim(p_expected_provider_write_state)
   for update;
  if not found then
    raise exception 'FOUNDER_CONTENT_MUTATION_STALE_STATE';
  end if;

  if not (
    (current_row.status = 'pending_approval' and p_next_status in ('pending_approval', 'approved', 'scheduled', 'rejected'))
    or (current_row.status = 'approved' and p_next_status in ('approved', 'scheduled', 'publishing', 'rejected'))
    or (current_row.status = 'scheduled' and p_next_status in ('approved', 'scheduled', 'publishing', 'rejected'))
    or (current_row.status = 'publishing' and p_next_status in ('posted', 'failed', 'outcome_unknown'))
    or (current_row.status = 'failed' and p_next_status in ('pending_approval', 'approved', 'scheduled', 'rejected'))
    or (current_row.status = 'outcome_unknown' and p_next_status in ('posted', 'failed', 'outcome_unknown'))
    or (current_row.status = 'posted' and p_next_status = 'posted')
    or (current_row.status = 'rejected' and p_next_status = 'rejected')
  ) then
    raise exception 'FOUNDER_CONTENT_MUTATION_TRANSITION_INVALID:%->%', current_row.status, p_next_status;
  end if;

  update public.founder_content_posts p
     set status = btrim(p_next_status),
         provider_write_state = btrim(p_next_provider_write_state),
         approval_id = case when p_patch ? 'approval_id'
           then nullif(p_patch->>'approval_id', '') else p.approval_id end,
         execution_id = case when p_patch ? 'execution_id'
           then nullif(p_patch->>'execution_id', '')::uuid else p.execution_id end,
         scheduled_at = case when p_patch ? 'scheduled_at'
           then nullif(p_patch->>'scheduled_at', '')::timestamptz else p.scheduled_at end,
         posted_at = case when p_patch ? 'posted_at'
           then nullif(p_patch->>'posted_at', '')::timestamptz else p.posted_at end,
         external_post_id = case when p_patch ? 'external_post_id'
           then nullif(p_patch->>'external_post_id', '') else p.external_post_id end,
         permalink = case when p_patch ? 'permalink'
           then nullif(p_patch->>'permalink', '') else p.permalink end,
         retry_count = case when p_patch ? 'retry_count'
           then (p_patch->>'retry_count')::integer else p.retry_count end,
         last_error = case when p_patch ? 'last_error'
           then nullif(p_patch->>'last_error', '') else p.last_error end,
         last_metrics_sync_at = case when p_patch ? 'last_metrics_sync_at'
           then nullif(p_patch->>'last_metrics_sync_at', '')::timestamptz else p.last_metrics_sync_at end,
         updated_at = p_observed_at
   where p.post_id = current_row.post_id
   returning * into updated_row;

  insert into public.founder_content_post_events (
    post_id, founder_user_id, event_type, actor, payload, observed_at
  ) values (
    updated_row.post_id,
    updated_row.founder_user_id,
    btrim(p_event_type),
    btrim(p_actor),
    p_event_payload || jsonb_build_object(
      'prior_status', current_row.status,
      'next_status', updated_row.status,
      'prior_provider_write_state', current_row.provider_write_state,
      'next_provider_write_state', updated_row.provider_write_state
    ),
    p_observed_at
  );

  return updated_row;
end;
$function$;

revoke all on function public.mutate_founder_content_post_lifecycle(
  uuid, text, text, text, text, text, jsonb, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.mutate_founder_content_post_lifecycle(
  uuid, text, text, text, text, text, jsonb, text, text, jsonb, timestamptz
) to service_role;

-- All-or-nothing editorial schedule intent. This deliberately does not call a
-- provider or claim executable cadence authority. The existing cadence/execution
-- pipeline remains the only path that can turn this intent into provider action.
create or replace function public.bulk_set_founder_content_schedule_intent(
  p_founder_user_id text,
  p_post_ids uuid[],
  p_start_at timestamptz,
  p_interval_minutes integer,
  p_actor text,
  p_observed_at timestamptz default now()
)
returns setof public.founder_content_posts
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  requested_count integer;
  matched_count integer;
  item record;
begin
  requested_count := coalesce(array_length(p_post_ids, 1), 0);
  if coalesce(btrim(p_founder_user_id), '') = ''
     or requested_count < 1
     or p_start_at is null
     or p_interval_minutes < 1
     or p_interval_minutes > 1440
     or coalesce(btrim(p_actor), '') = ''
     or p_observed_at is null then
    raise exception 'FOUNDER_CONTENT_BULK_SCHEDULE_INPUT_INVALID';
  end if;
  if (select count(distinct id) from unnest(p_post_ids) as ids(id)) <> requested_count then
    raise exception 'FOUNDER_CONTENT_BULK_SCHEDULE_DUPLICATE_POST';
  end if;

  -- Lock the full set in deterministic order before validating. Any invalid row
  -- aborts the transaction, so the batch cannot partially schedule.
  perform 1
    from public.founder_content_posts p
   where p.founder_user_id = btrim(p_founder_user_id)
     and p.post_id = any(p_post_ids)
   order by p.post_id
   for update;

  select count(*)
    into matched_count
    from public.founder_content_posts p
   where p.founder_user_id = btrim(p_founder_user_id)
     and p.post_id = any(p_post_ids)
     and p.status in ('approved', 'scheduled')
     and p.provider_write_state = 'not_attempted';

  if matched_count <> requested_count then
    raise exception 'FOUNDER_CONTENT_BULK_SCHEDULE_STATE_INVALID';
  end if;

  for item in
    select ids.post_id, ids.ordinality
      from unnest(p_post_ids) with ordinality as ids(post_id, ordinality)
  loop
    update public.founder_content_posts p
       set status = 'scheduled',
           scheduled_at = p_start_at + ((item.ordinality - 1) * p_interval_minutes) * interval '1 minute',
           updated_at = p_observed_at
     where p.post_id = item.post_id
       and p.founder_user_id = btrim(p_founder_user_id);

    insert into public.founder_content_post_events (
      post_id, founder_user_id, event_type, actor, payload, observed_at
    )
    select
      p.post_id,
      p.founder_user_id,
      'schedule_intent_set',
      btrim(p_actor),
      jsonb_build_object(
        'scheduled_at', p.scheduled_at,
        'authority', 'editorial_intent_only',
        'provider_write_attempted', false
      ),
      p_observed_at
      from public.founder_content_posts p
     where p.post_id = item.post_id
       and p.founder_user_id = btrim(p_founder_user_id);
  end loop;

  return query
    select p.*
      from unnest(p_post_ids) with ordinality as ids(post_id, ordinality)
      join public.founder_content_posts p on p.post_id = ids.post_id
     order by ids.ordinality;
end;
$function$;

revoke all on function public.bulk_set_founder_content_schedule_intent(
  text, uuid[], timestamptz, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.bulk_set_founder_content_schedule_intent(
  text, uuid[], timestamptz, integer, text, timestamptz
) to service_role;

comment on function public.bulk_set_founder_content_schedule_intent(
  text, uuid[], timestamptz, integer, text, timestamptz
) is
  'Atomically records founder-approved editorial schedule intent for multiple posts. It grants no provider schedule or publication authority; cadence reservation and approval_executions remain separate required gates.';

commit;
