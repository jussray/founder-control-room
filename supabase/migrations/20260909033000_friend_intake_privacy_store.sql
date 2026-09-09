-- Friend Intake v1 privacy-bounded persistence.
--
-- Source-only until a separately authorized production database apply.
-- Raw founder input, transcripts, related memories, embeddings, provider
-- payloads, and credentials are intentionally absent from these tables.

begin;

create table if not exists public.friend_intake_summaries (
  intake_id uuid primary key,
  run_id uuid not null unique,
  founder_user_id text not null,
  redacted_summary text not null
    check (length(btrim(redacted_summary)) between 1 and 1200),
  intent_tags text[] not null
    check (cardinality(intent_tags) between 1 and 3),
  runtime_provider text not null
    check (runtime_provider in ('deterministic', 'openai', 'anthropic', 'perplexity')),
  model text not null
    check (length(btrim(model)) between 1 and 200),
  provenance_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists friend_intake_summaries_founder_created_idx
  on public.friend_intake_summaries (founder_user_id, created_at desc);

alter table public.friend_intake_summaries enable row level security;
drop policy if exists friend_intake_summaries_service_role_only
  on public.friend_intake_summaries;
create policy friend_intake_summaries_service_role_only
  on public.friend_intake_summaries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.friend_intake_summaries from public, anon, authenticated;
grant select, insert, delete on table public.friend_intake_summaries to service_role;
revoke update on table public.friend_intake_summaries from service_role;

comment on table public.friend_intake_summaries is
  'Service-role-only Friend Intake redacted summaries. No raw transcript, related memory, embedding, credential, or provider payload is permitted.';

create table if not exists public.friend_intake_feedback (
  run_id uuid primary key,
  founder_user_id text not null,
  response text not null
    check (response in ('yes', 'not_really', 'wrong_time')),
  recorded_at timestamptz not null default now()
);

create index if not exists friend_intake_feedback_founder_recorded_idx
  on public.friend_intake_feedback (founder_user_id, recorded_at desc);

alter table public.friend_intake_feedback enable row level security;
drop policy if exists friend_intake_feedback_service_role_only
  on public.friend_intake_feedback;
create policy friend_intake_feedback_service_role_only
  on public.friend_intake_feedback
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.friend_intake_feedback from public, anon, authenticated;
grant select, insert, delete on table public.friend_intake_feedback to service_role;
revoke update on table public.friend_intake_feedback from service_role;

comment on table public.friend_intake_feedback is
  'Service-role-only one-response-per-run usefulness telemetry for Friend Intake. Stores no founder input or model output.';

-- A successful Friend run is one persistence transaction. When the founder
-- opts into redacted-summary storage, the summary row and the sanitized
-- project_events completion receipt either both commit or both roll back.
create or replace function public.record_friend_intake_completion(
  p_source_event_id text,
  p_project_id uuid,
  p_founder_user_id text,
  p_metadata jsonb,
  p_intake_id uuid,
  p_redacted_summary text,
  p_intent_tags text[],
  p_runtime_provider text,
  p_model text,
  p_provenance_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event_id uuid;
  v_has_summary boolean := p_redacted_summary is not null;
begin
  if p_source_event_id is null or btrim(p_source_event_id) = '' then
    raise exception 'FRIEND_COMPLETION_INVALID_SOURCE_EVENT_ID' using errcode = '22023';
  end if;

  if p_project_id is null or p_founder_user_id is null or btrim(p_founder_user_id) = '' then
    raise exception 'FRIEND_COMPLETION_INVALID_IDENTITY' using errcode = '22023';
  end if;

  if coalesce(p_metadata, '{}'::jsonb) ?| array[
    'transcript',
    'raw_input',
    'summary',
    'mirror',
    'move',
    'provider_payload',
    'related_memories',
    'credentials'
  ] then
    raise exception 'FRIEND_COMPLETION_CONTENT_NOT_ALLOWED' using errcode = '22023';
  end if;

  if v_has_summary then
    if p_intake_id is null
      or p_intent_tags is null
      or p_runtime_provider is null
      or p_model is null
      or p_provenance_id is null then
      raise exception 'FRIEND_COMPLETION_SUMMARY_FIELDS_INCOMPLETE' using errcode = '22023';
    end if;

    insert into public.friend_intake_summaries (
      intake_id,
      run_id,
      founder_user_id,
      redacted_summary,
      intent_tags,
      runtime_provider,
      model,
      provenance_id
    ) values (
      p_intake_id,
      p_source_event_id::uuid,
      p_founder_user_id,
      p_redacted_summary,
      p_intent_tags,
      p_runtime_provider,
      p_model,
      p_provenance_id
    );
  elsif p_intake_id is not null
    or p_intent_tags is not null
    or p_runtime_provider is not null
    or p_model is not null
    or p_provenance_id is not null then
    raise exception 'FRIEND_COMPLETION_SUMMARY_FIELDS_WITHOUT_SUMMARY' using errcode = '22023';
  end if;

  insert into public.project_events (
    project_id,
    source_event_id,
    event_type,
    severity,
    screen,
    metadata
  ) values (
    p_project_id,
    p_source_event_id,
    'friend_intake_completed',
    'info',
    'friend-intake',
    jsonb_build_object(
      'route', 'POST /mirror/friend-intake',
      'actor', 'founder',
      'founder_user_id', p_founder_user_id
    ) || coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.record_friend_intake_completion(
  text, uuid, text, jsonb, uuid, text, text[], text, text, uuid
) from public, anon, authenticated;
grant execute on function public.record_friend_intake_completion(
  text, uuid, text, jsonb, uuid, text, text[], text, text, uuid
) to service_role;

comment on function public.record_friend_intake_completion(
  text, uuid, text, jsonb, uuid, text, text[], text, text, uuid
) is
  'Atomically records a sanitized Friend completion receipt and, only when opted in, its bounded redacted summary. Raw founder input and provider payloads are rejected from completion metadata.';

commit;
