-- Standing missions remain canonical `missions`. This table adds only private,
-- service-role scheduler metadata and migration provenance for recurring work.
create table if not exists public.mission_schedules (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null unique references public.missions(id) on delete cascade,
  source_task_ref text unique,
  timing_mode text not null check (timing_mode in ('exact_schedule', 'flexible_schedule', 'condition_watch')),
  cadence jsonb not null check (jsonb_typeof(cadence) = 'object'),
  timezone text not null check (char_length(timezone) between 1 and 120),
  execution_profile text not null default 'chatgpt-sol' check (char_length(execution_profile) between 1 and 120),
  private_prompt text not null check (char_length(private_prompt) between 1 and 100000),
  capability_manifest jsonb not null default '[]'::jsonb check (jsonb_typeof(capability_manifest) = 'array'),
  definition_fingerprint text not null check (definition_fingerprint ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default false,
  next_run_at timestamptz not null,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_run_at timestamptz,
  last_status text check (last_status is null or last_status in ('completed', 'no_change', 'material_change', 'blocked', 'failed')),
  last_result text,
  last_result_hash text check (last_result_hash is null or last_result_hash ~ '^[0-9a-f]{64}$'),
  last_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(last_evidence) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lease_token is null) = (lease_expires_at is null))
);

create index if not exists mission_schedules_due_idx
  on public.mission_schedules (next_run_at, id)
  where enabled;

alter table public.mission_schedules enable row level security;
revoke all on table public.mission_schedules from public, anon, authenticated;
grant select, insert, update, delete on table public.mission_schedules to service_role;

create or replace function public.claim_due_mission_schedule(
  p_now timestamptz default now(),
  p_lease_seconds integer default 600
)
returns table (
  schedule_id uuid,
  mission_id uuid,
  project_id uuid,
  project_slug text,
  project_repository text,
  mission_title text,
  mission_description text,
  mission_status text,
  source_task_ref text,
  timing_mode text,
  cadence jsonb,
  timezone text,
  execution_profile text,
  private_prompt text,
  capability_manifest jsonb,
  definition_fingerprint text,
  due_at timestamptz,
  lease_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  if p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'p_lease_seconds must be between 60 and 3600';
  end if;

  select s.id
    into claimed_id
  from public.mission_schedules s
  join public.missions m on m.id = s.mission_id
  where s.enabled = true
    and s.next_run_at <= p_now
    and (s.lease_expires_at is null or s.lease_expires_at <= p_now)
    and m.status not in ('completed', 'cancelled')
  order by s.next_run_at asc, s.id asc
  for update of s skip locked
  limit 1;

  if claimed_id is null then
    return;
  end if;

  update public.mission_schedules s
  set lease_token = gen_random_uuid(),
      lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
      updated_at = p_now
  where s.id = claimed_id;

  return query
  select
    s.id,
    m.id,
    p.id,
    p.slug,
    p.repo_identifier,
    m.title,
    m.description,
    m.status,
    s.source_task_ref,
    s.timing_mode,
    s.cadence,
    s.timezone,
    s.execution_profile,
    s.private_prompt,
    s.capability_manifest,
    s.definition_fingerprint,
    s.next_run_at,
    s.lease_token
  from public.mission_schedules s
  join public.missions m on m.id = s.mission_id
  join public.projects p on p.id = m.project_id
  where s.id = claimed_id;
end;
$$;

create or replace function public.complete_mission_schedule(
  p_schedule_id uuid,
  p_lease_token uuid,
  p_status text,
  p_next_run_at timestamptz,
  p_result text,
  p_result_hash text,
  p_evidence jsonb default '[]'::jsonb,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if p_status not in ('completed', 'no_change', 'material_change', 'blocked', 'failed') then
    raise exception 'unsupported standing mission status';
  end if;
  if p_next_run_at <= p_now then
    raise exception 'p_next_run_at must be in the future';
  end if;
  if p_result_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'p_result_hash must be sha256';
  end if;
  if jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) <> 'array' then
    raise exception 'p_evidence must be an array';
  end if;

  update public.mission_schedules
  set last_run_at = p_now,
      last_status = p_status,
      last_result = p_result,
      last_result_hash = p_result_hash,
      last_evidence = coalesce(p_evidence, '[]'::jsonb),
      next_run_at = p_next_run_at,
      lease_token = null,
      lease_expires_at = null,
      updated_at = p_now
  where id = p_schedule_id
    and lease_token = p_lease_token;

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke execute on function public.claim_due_mission_schedule(timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.complete_mission_schedule(uuid, uuid, text, timestamptz, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_due_mission_schedule(timestamptz, integer) to service_role;
grant execute on function public.complete_mission_schedule(uuid, uuid, text, timestamptz, text, text, jsonb, timestamptz) to service_role;
