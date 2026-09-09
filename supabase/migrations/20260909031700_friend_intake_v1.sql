-- Friend Intake v1: minimal founder-scoped persistence for the deterministic first slice.
--
-- Privacy boundary:
-- - raw founder input is never stored here;
-- - process_without_saving creates no intake_sessions row;
-- - save_redacted_summary stores one bounded category-level summary only;
-- - sensitive saved summaries require an explicit founder review receipt;
-- - project_events receives behavior-only operational metadata, never intake labels, mirror/move content, or raw text.
-- - intake_sessions is server-owned/service-role-only; direct browser roles do not receive table access.

create table if not exists public.intake_sessions (
  intake_id uuid primary key,
  founder_id uuid not null references auth.users(id) on delete cascade,
  privacy_choice text not null check (privacy_choice = 'save_redacted_summary'),
  redacted_summary text not null check (char_length(redacted_summary) between 1 and 300),
  sensitive_categories text[] not null default '{}'::text[],
  sensitive_save_reviewed boolean not null default false,
  intent_tag_ids text[] not null default '{}'::text[],
  move_kind text not null check (move_kind in ('tiny_move', 'protective_move', 'clarifying_question')),
  move_policy text not null check (move_policy in ('tiny', 'protective', 'clarifying')),
  move_time_estimate_minutes integer,
  move_gate_warning_code text,
  model_execution_state text not null default 'blocked' check (model_execution_state = 'blocked'),
  provenance_id uuid not null,
  timeline_event_id uuid not null references public.project_events(id) on delete restrict,
  usefulness_response text check (usefulness_response in ('yes', 'not_really', 'wrong_time')),
  usefulness_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint intake_sessions_sensitive_categories_allowed check (
    sensitive_categories <@ array['legal', 'health', 'teen', 'family_conflict', 'credentials']::text[]
  ),
  constraint intake_sessions_sensitive_save_reviewed check (
    cardinality(sensitive_categories) = 0 or sensitive_save_reviewed
  ),
  constraint intake_sessions_intent_tags_allowed check (
    intent_tag_ids <@ array['money', 'people', 'build', 'health', 'kids', 'legal', 'rest', 'general']::text[]
    and cardinality(intent_tag_ids) between 1 and 3
  ),
  constraint intake_sessions_tiny_move_duration check (
    move_kind <> 'tiny_move'
    or move_time_estimate_minutes between 5 and 15
  ),
  constraint intake_sessions_usefulness_consistency check (
    (usefulness_response is null and usefulness_recorded_at is null)
    or
    (usefulness_response is not null and usefulness_recorded_at is not null)
  )
);

alter table public.intake_sessions enable row level security;

-- FCR's current persistence boundary is server-owned. Keep RLS enabled as a
-- fail-closed database membrane, but do not create direct authenticated-user
-- policies for this table. The trusted route uses the service-role client only.
revoke all privileges on table public.intake_sessions from public, anon, authenticated;
grant all privileges on table public.intake_sessions to service_role;

create or replace function public.touch_friend_intake_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_friend_intake_updated_at() from public, anon, authenticated;
grant execute on function public.touch_friend_intake_updated_at() to service_role;

drop trigger if exists intake_sessions_set_updated_at on public.intake_sessions;
create trigger intake_sessions_set_updated_at
before update on public.intake_sessions
for each row execute function public.touch_friend_intake_updated_at();

create or replace function public.process_friend_intake(
  p_intake_id uuid,
  p_founder_id uuid,
  p_project_id uuid,
  p_privacy_choice text,
  p_redacted_summary text,
  p_sensitive_categories text[],
  p_sensitive_save_reviewed boolean,
  p_intent_tag_ids text[],
  p_move_kind text,
  p_move_policy text,
  p_move_time_estimate_minutes integer,
  p_move_gate_warning_code text,
  p_model_execution_state text,
  p_provenance_id uuid,
  p_timeline_event_id uuid
) returns void
language plpgsql
set search_path = public
as $$
begin
  if p_privacy_choice not in ('process_without_saving', 'save_redacted_summary') then
    raise exception 'friend_intake_invalid_privacy_choice';
  end if;

  if p_privacy_choice = 'process_without_saving' and p_redacted_summary is not null then
    raise exception 'friend_intake_unsaved_summary_forbidden';
  end if;

  if p_privacy_choice = 'save_redacted_summary' and p_redacted_summary is null then
    raise exception 'friend_intake_saved_summary_required';
  end if;

  if coalesce(cardinality(p_sensitive_categories), 0) > 0
     and not coalesce(p_sensitive_save_reviewed, false) then
    raise exception 'friend_intake_sensitive_save_review_required';
  end if;

  if p_model_execution_state <> 'blocked' then
    raise exception 'friend_intake_external_model_state_forbidden';
  end if;

  insert into public.project_events (
    id,
    project_id,
    source_event_id,
    event_type,
    severity,
    screen,
    decision,
    metadata,
    created_at
  ) values (
    p_timeline_event_id,
    p_project_id,
    'friend-intake-run:' || p_intake_id::text,
    'friend_intake_run',
    'info',
    'friend-intake',
    'processed',
    jsonb_build_object(
      'route', 'POST /friend-intake/run',
      'actor', 'founder',
      'founder_user_id', p_founder_id,
      'provenance_id', p_provenance_id,
      'privacy_choice', p_privacy_choice,
      'model_execution_state', p_model_execution_state,
      'input_persistence', case
        when p_privacy_choice = 'save_redacted_summary' then 'redacted_summary_only'
        else 'none'
      end
    ),
    now()
  );

  if p_privacy_choice = 'save_redacted_summary' then
    insert into public.intake_sessions (
      intake_id,
      founder_id,
      privacy_choice,
      redacted_summary,
      sensitive_categories,
      sensitive_save_reviewed,
      intent_tag_ids,
      move_kind,
      move_policy,
      move_time_estimate_minutes,
      move_gate_warning_code,
      model_execution_state,
      provenance_id,
      timeline_event_id
    ) values (
      p_intake_id,
      p_founder_id,
      p_privacy_choice,
      p_redacted_summary,
      p_sensitive_categories,
      p_sensitive_save_reviewed,
      p_intent_tag_ids,
      p_move_kind,
      p_move_policy,
      p_move_time_estimate_minutes,
      p_move_gate_warning_code,
      p_model_execution_state,
      p_provenance_id,
      p_timeline_event_id
    );
  end if;
end;
$$;

create or replace function public.record_friend_intake_usefulness(
  p_run_id uuid,
  p_founder_id uuid,
  p_project_id uuid,
  p_response text,
  p_event_id uuid
) returns void
language plpgsql
set search_path = public
as $$
begin
  if p_response not in ('yes', 'not_really', 'wrong_time') then
    raise exception 'friend_intake_invalid_usefulness_response';
  end if;

  if not exists (
    select 1
    from public.project_events
    where project_id = p_project_id
      and source_event_id = 'friend-intake-run:' || p_run_id::text
      and metadata->>'founder_user_id' = p_founder_id::text
  ) then
    raise exception 'friend_intake_run_not_owned';
  end if;

  update public.intake_sessions
  set usefulness_response = p_response,
      usefulness_recorded_at = now()
  where intake_id = p_run_id
    and founder_id = p_founder_id;

  insert into public.project_events (
    id,
    project_id,
    source_event_id,
    event_type,
    severity,
    screen,
    decision,
    metadata,
    created_at
  ) values (
    p_event_id,
    p_project_id,
    'friend-intake-usefulness:' || p_run_id::text,
    'friend_intake_usefulness',
    'info',
    'friend-intake',
    p_response,
    jsonb_build_object(
      'route', 'POST /friend-intake/usefulness',
      'actor', 'founder',
      'founder_user_id', p_founder_id,
      'run_id', p_run_id,
      'response', p_response
    ),
    now()
  )
  on conflict (project_id, source_event_id)
  do update set
    decision = excluded.decision,
    metadata = excluded.metadata,
    created_at = now();
end;
$$;

revoke all on function public.process_friend_intake(
  uuid, uuid, uuid, text, text, text[], boolean, text[], text, text, integer, text, text, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.process_friend_intake(
  uuid, uuid, uuid, text, text, text[], boolean, text[], text, text, integer, text, text, uuid, uuid
) to service_role;

revoke all on function public.record_friend_intake_usefulness(
  uuid, uuid, uuid, text, uuid
) from public, anon, authenticated;

grant execute on function public.record_friend_intake_usefulness(
  uuid, uuid, uuid, text, uuid
) to service_role;
