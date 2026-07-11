-- =============================================================================
-- Milestone B: migrate change_proposals + releases to provider-centric schema,
-- create proposed_actions + approval_executions, add missions.branch_name
-- =============================================================================
-- NOTE: change_proposals and releases already exist in 0001_init.sql with a
-- different (mission-centric) schema. This migration drops the old definitions
-- and recreates them with the provider-centric schema that Milestone B requires.
-- approval_executions and proposed_actions are new tables.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 0. Safety: verify we are running against the right database
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from information_schema.tables where table_name = 'projects') then
    raise exception 'projects table not found — wrong database?';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. change_proposals — drop old schema, recreate provider-centric
-- ---------------------------------------------------------------------------
-- Old schema (0001_init.sql): mission_id, base_commit, candidate_commit,
--   ci_status, founder_decision. Not used by any live controllers.
-- New schema: provider_pr_number, head_sha, head_branch, etc.

drop table if exists change_proposals cascade;

create table change_proposals (
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

create index idx_change_proposals_project
  on change_proposals (project_id, status, last_seen_at desc);

create index idx_change_proposals_open
  on change_proposals (project_id)
  where status = 'open';

alter table change_proposals enable row level security;

create policy "control_room_service_role_only" on change_proposals
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 2. releases — drop old schema, recreate provider-centric
-- ---------------------------------------------------------------------------
-- Old schema (0001_init.sql): change_proposal_id, version, status with
--   ('pending','deployed','rolled_back','failed'), deployed_at, rolled_back_at.
-- New schema: provider_deployment_id, environment, state, deploy_url.

drop table if exists releases cascade;

create table releases (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references projects(id) on delete cascade,
  provider                text not null default 'github',
  provider_deployment_id  text,
  commit_sha              text,
  environment             text not null default 'production',
  -- 'state' mirrors GitHub deployment states exactly.
  -- 'pending' = merge observed, no deployment event yet (observation-only gap).
  state                   text not null default 'pending'
    check (state in ('pending', 'queued', 'in_progress', 'success', 'failure', 'error', 'inactive')),
  deploy_url              text,
  provider_updated_at     timestamptz,
  observed_at             timestamptz not null default now(),
  created_at              timestamptz not null default now(),

  -- One active record per deployment id. NULL provider_deployment_id rows
  -- (merge-triggered stubs) are not deduplicated — they are overwritten
  -- when a real deployment event arrives with the same commit_sha.
  constraint releases_dedup
    unique (project_id, provider, provider_deployment_id)
);

create index idx_releases_project
  on releases (project_id, environment, observed_at desc);

create index idx_releases_active
  on releases (project_id)
  where state in ('pending', 'queued', 'in_progress');

alter table releases enable row level security;

create policy "control_room_service_role_only" on releases
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 3. proposed_actions — system-generated, immutable after insert
-- ---------------------------------------------------------------------------
-- MissionController writes rows here. The approvals route reads them.
-- The caller NEVER supplies action details; they supply only an idempotency
-- key that must match a row here.

create table proposed_actions (
  id               uuid primary key default gen_random_uuid(),
  mission_id       uuid not null references missions(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  action_type      text not null
    check (action_type in ('create_branch', 'merge')),
  idempotency_key  text not null unique,
  -- Immutable payload snapshot. Columns are denormalized for fast exact-match
  -- without jsonb containment queries.
  head_branch      text,          -- merge only: head branch to merge
  base_branch      text,          -- branch creation + merge: base/target branch
  head_sha         text,          -- merge only: required head SHA at approval time
  branch_name      text,          -- create_branch only: name of branch to create
  -- Full payload stored for audit. Never mutated after insert.
  payload          jsonb not null default '{}',
  -- Evidence snapshot at proposal time (kind -> status map)
  evidence_snapshot jsonb not null default '{}',
  -- Expected mission status at execution time. Approvals route enforces this.
  expected_mission_status text not null,
  -- Lifecycle
  status           text not null default 'pending'
    check (status in ('pending', 'claimed', 'executed', 'superseded', 'expired')),
  claimed_at       timestamptz,
  created_at       timestamptz not null default now()
);

create index idx_proposed_actions_mission
  on proposed_actions (mission_id, status, created_at desc);

create index idx_proposed_actions_key
  on proposed_actions (idempotency_key)
  where status = 'pending';

alter table proposed_actions enable row level security;

create policy "control_room_service_role_only" on proposed_actions
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 4. approval_executions — audit log for every approved action
-- ---------------------------------------------------------------------------

create table approval_executions (
  id                  uuid primary key default gen_random_uuid(),
  proposed_action_id  uuid not null references proposed_actions(id) on delete restrict,
  mission_id          uuid references missions(id) on delete set null,
  project_id          uuid not null references projects(id) on delete cascade,
  action_type         text not null,
  idempotency_key     text not null unique,
  executed_by         text not null,  -- founder email
  result              jsonb not null default '{}',
  success             boolean not null default true,
  executed_at         timestamptz not null default now()
);

create index idx_approval_executions_mission
  on approval_executions (mission_id, executed_at desc);

alter table approval_executions enable row level security;

create policy "control_room_service_role_only" on approval_executions
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 5. missions — add columns needed by Milestone B controllers
-- ---------------------------------------------------------------------------
alter table missions
  add column if not exists branch_name text,
  add column if not exists required_checks text[] not null default array[]::text[],
  add column if not exists manifest_version_id uuid,
  add column if not exists policy_snapshot jsonb;

-- Extend missions.status to include Milestone B states.
-- The old constraint used a fixed check list; we replace it.
alter table missions
  drop constraint if exists missions_status_check;

alter table missions
  add constraint missions_status_check check (status in (
    'proposed', 'sandboxed', 'in_review', 'approved', 'integrated', 'deployed',
    'rejected', 'rolled_back',
    -- Milestone B states:
    'scoping', 'planned', 'implementing', 'preview_ready',
    'awaiting_approval', 'deploying', 'verifying', 'completed', 'failed'
  ));
