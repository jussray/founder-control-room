-- =============================================================================
-- Milestone B: change_proposals, releases, approval_executions
-- missions.branch_name column
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. change_proposals  (normalized PR state)
-- ---------------------------------------------------------------------------
create table if not exists change_proposals (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  provider              text not null default 'github',
  provider_pr_number    int  not null,
  title                 text not null default '',
  head_sha              text,
  head_branch           text,
  base_branch           text not null default 'main',
  status                text not null default 'open'
    check (status in ('open', 'closed', 'merged')),
  merged                boolean not null default false,
  merge_commit_sha      text,
  html_url              text,
  author_login          text,
  provider_updated_at   timestamptz,
  last_seen_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),

  constraint change_proposals_dedup
    unique (project_id, provider, provider_pr_number)
);

create index if not exists idx_change_proposals_project
  on change_proposals (project_id, status, last_seen_at desc);

create index if not exists idx_change_proposals_open
  on change_proposals (project_id)
  where status = 'open';

alter table change_proposals enable row level security;

create policy "control_room_service_role_only" on change_proposals
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 2. releases  (normalized deployment state)
-- ---------------------------------------------------------------------------
create table if not exists releases (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references projects(id) on delete cascade,
  provider                text not null default 'github',
  provider_deployment_id  text,
  commit_sha              text,
  environment             text not null default 'production',
  state                   text not null default 'pending'
    check (state in ('pending', 'queued', 'in_progress', 'success', 'failure', 'error', 'inactive')),
  deploy_url              text,
  provider_updated_at     timestamptz,
  observed_at             timestamptz not null default now(),
  created_at              timestamptz not null default now(),

  constraint releases_dedup
    unique (project_id, provider, provider_deployment_id)
);

create index if not exists idx_releases_project
  on releases (project_id, environment, observed_at desc);

create index if not exists idx_releases_active
  on releases (project_id)
  where state in ('pending', 'queued', 'in_progress');

alter table releases enable row level security;

create policy "control_room_service_role_only" on releases
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 3. approval_executions  (audit log for every approved action)
-- ---------------------------------------------------------------------------
create table if not exists approval_executions (
  id               uuid primary key default gen_random_uuid(),
  mission_id       uuid references missions(id) on delete set null,
  project_id       uuid not null references projects(id) on delete cascade,
  action_type      text not null,
  idempotency_key  text not null unique,
  executed_by      text not null,
  result           jsonb not null default '{}',
  success          boolean not null default true,
  executed_at      timestamptz not null default now()
);

create index if not exists idx_approval_executions_mission
  on approval_executions (mission_id, executed_at desc);

alter table approval_executions enable row level security;

create policy "control_room_service_role_only" on approval_executions
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 4. missions — add branch_name column
-- ---------------------------------------------------------------------------
alter table missions
  add column if not exists branch_name text;
