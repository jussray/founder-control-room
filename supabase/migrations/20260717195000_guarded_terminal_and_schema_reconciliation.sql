-- =============================================================================
-- Guarded founder terminal + live schema reconciliation
--
-- The original Milestone B file used a non-timestamped migration name and was
-- never applied to the live Control Room database. The legacy tables are empty
-- today, but this migration alters them in place so it remains data-preserving.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Normalize change_proposals for observed GitHub pull-request state.
--    Legacy proposal/council columns remain available but are no longer required
--    for provider-observed rows.
-- -----------------------------------------------------------------------------
alter table change_proposals
  alter column mission_id drop not null,
  alter column base_commit drop not null,
  alter column candidate_commit drop not null;

alter table change_proposals
  add column if not exists provider text not null default 'github',
  add column if not exists provider_pr_number integer,
  add column if not exists title text not null default '',
  add column if not exists head_sha text,
  add column if not exists head_branch text,
  add column if not exists base_branch text not null default 'main',
  add column if not exists status text not null default 'open',
  add column if not exists merged boolean not null default false,
  add column if not exists merge_commit_sha text,
  add column if not exists html_url text,
  add column if not exists author_login text,
  add column if not exists provider_updated_at timestamptz,
  add column if not exists last_seen_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'change_proposals'::regclass
      and conname = 'change_proposals_provider_status_check'
  ) then
    alter table change_proposals
      add constraint change_proposals_provider_status_check
      check (status in ('open', 'closed', 'merged'));
  end if;
end $$;

create unique index if not exists change_proposals_provider_pr_dedup
  on change_proposals (project_id, provider, provider_pr_number);

create index if not exists idx_change_proposals_provider_state
  on change_proposals (project_id, status, last_seen_at desc);

-- -----------------------------------------------------------------------------
-- 2. Normalize releases for observed provider deployment state.
--    The legacy status/version columns remain for backward compatibility.
-- -----------------------------------------------------------------------------
alter table releases
  add column if not exists provider text not null default 'github',
  add column if not exists provider_deployment_id text,
  add column if not exists environment text not null default 'production',
  add column if not exists state text not null default 'pending',
  add column if not exists deploy_url text,
  add column if not exists provider_updated_at timestamptz,
  add column if not exists observed_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'releases'::regclass
      and conname = 'releases_provider_state_check'
  ) then
    alter table releases
      add constraint releases_provider_state_check
      check (state in ('pending', 'queued', 'in_progress', 'success', 'failure', 'error', 'inactive'));
  end if;
end $$;

create unique index if not exists releases_provider_deployment_dedup
  on releases (project_id, provider, provider_deployment_id);

create index if not exists idx_releases_provider_state
  on releases (project_id, environment, observed_at desc);

-- -----------------------------------------------------------------------------
-- 3. Reserve approved actions before external mutation.
--    A pending reservation prevents a retry from executing the same merge twice
--    if GitHub succeeds but the follow-up audit update is interrupted.
-- -----------------------------------------------------------------------------
create table if not exists approval_executions (
  id               uuid primary key default gen_random_uuid(),
  mission_id       uuid references missions(id) on delete set null,
  project_id       uuid not null references projects(id) on delete cascade,
  action_type      text not null,
  idempotency_key  text not null unique,
  executed_by      text not null,
  status           text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed')),
  request          jsonb not null default '{}'::jsonb,
  result           jsonb not null default '{}'::jsonb,
  success          boolean,
  started_at       timestamptz not null default now(),
  executed_at      timestamptz
);

alter table approval_executions
  add column if not exists status text not null default 'pending',
  add column if not exists request jsonb not null default '{}'::jsonb,
  add column if not exists started_at timestamptz not null default now();

alter table approval_executions
  alter column success drop not null,
  alter column success drop default,
  alter column executed_at drop not null,
  alter column executed_at drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'approval_executions'::regclass
      and conname = 'approval_executions_status_check'
  ) then
    alter table approval_executions
      add constraint approval_executions_status_check
      check (status in ('pending', 'succeeded', 'failed'));
  end if;
end $$;

create unique index if not exists approval_executions_idempotency
  on approval_executions (idempotency_key);

create index if not exists idx_approval_executions_mission
  on approval_executions (mission_id, started_at desc);

alter table approval_executions enable row level security;
drop policy if exists "control_room_service_role_only" on approval_executions;
create policy "control_room_service_role_only" on approval_executions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table approval_executions from anon, authenticated;
grant select, insert, update, delete on table approval_executions to service_role;

-- -----------------------------------------------------------------------------
-- 4. Guarded terminal audit and evidence source.
-- -----------------------------------------------------------------------------
create table if not exists terminal_runs (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  mission_id            uuid not null references missions(id) on delete cascade,
  command_id            text not null,
  executable            text not null,
  args                  jsonb not null default '[]'::jsonb,
  working_directory     text not null,
  expected_commit_sha   text not null check (expected_commit_sha ~ '^[0-9a-fA-F]{40}$'),
  observed_commit_sha   text check (observed_commit_sha is null or observed_commit_sha ~ '^[0-9a-fA-F]{40}$'),
  status                text not null default 'running'
    check (status in ('running', 'passed', 'failed', 'timed_out', 'cancelled')),
  exit_code             integer,
  signal                text,
  timeout_ms            integer not null check (timeout_ms between 1000 and 3600000),
  max_output_bytes      integer not null check (max_output_bytes between 1024 and 1048576),
  output_truncated      boolean not null default false,
  stdout_excerpt        text not null default '',
  stderr_excerpt        text not null default '',
  error_code            text,
  executed_by           text not null,
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists idx_terminal_runs_project
  on terminal_runs (project_id, started_at desc);

create index if not exists idx_terminal_runs_mission
  on terminal_runs (mission_id, started_at desc);

create unique index if not exists terminal_runs_one_active_per_project
  on terminal_runs (project_id)
  where status = 'running';

alter table terminal_runs enable row level security;
drop policy if exists "control_room_service_role_only" on terminal_runs;
create policy "control_room_service_role_only" on terminal_runs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table terminal_runs from anon, authenticated;
grant select, insert, update, delete on table terminal_runs to service_role;

comment on table terminal_runs is
  'Founder-authenticated, project-scoped command evidence. No arbitrary shell commands or unbounded output.';

-- -----------------------------------------------------------------------------
-- 5. Register the private hair control repository as its own trust boundary.
-- -----------------------------------------------------------------------------
insert into projects (
  slug,
  name,
  repo_provider,
  repo_identifier,
  stack,
  status,
  risk_level,
  verification_enabled,
  verification_cadence_minutes
)
values (
  'juss-beautiful-hair-private',
  'Juss Beautiful Hair — Private Control',
  'github',
  'jussray/jbh-private',
  'private React/Vite admin + vendor operations',
  'active',
  'high',
  true,
  60
)
on conflict (slug) do update set
  name = excluded.name,
  repo_provider = excluded.repo_provider,
  repo_identifier = excluded.repo_identifier,
  stack = excluded.stack,
  status = excluded.status,
  risk_level = excluded.risk_level,
  verification_enabled = excluded.verification_enabled,
  verification_cadence_minutes = excluded.verification_cadence_minutes,
  updated_at = now();

commit;
