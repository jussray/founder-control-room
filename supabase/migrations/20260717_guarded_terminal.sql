-- =============================================================================
-- Guarded founder terminal
-- Mission-scoped, exact-head, bounded process evidence.
-- =============================================================================

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

-- Defense in depth: the process runner also enforces this in memory.
create unique index if not exists terminal_runs_one_active_per_project
  on terminal_runs (project_id)
  where status = 'running';

alter table terminal_runs enable row level security;

create policy "control_room_service_role_only" on terminal_runs
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table terminal_runs is
  'Founder-authenticated, project-scoped command evidence. No arbitrary shell commands or unbounded output.';

-- The private hair control repository is a separate project/trust boundary from
-- the public storefront. Supplier identities and private operations remain there.
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
