-- =============================================================================
-- Milestone A: Reconciliation infrastructure
-- provider_events, controller_outbox, provider_observations,
-- reconciliation_runs, controller_leases, evidence
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. provider_events  (durable event inbox)
-- ---------------------------------------------------------------------------
create table if not exists provider_events (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null,
  project_id        uuid not null references projects(id) on delete cascade,
  provider_event_id text not null,
  event_type        text not null,
  resource_type     text not null,
  resource_id       text not null,
  payload           jsonb not null default '{}',
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processing','processed','failed')),
  attempt_count     int not null default 0,
  last_error        text,

  -- dedup key: provider webhook delivery id is globally unique per provider
  constraint provider_events_dedup unique (provider, provider_event_id)
);

create index if not exists idx_provider_events_project
  on provider_events (project_id, processing_status, received_at desc);

create index if not exists idx_provider_events_pending
  on provider_events (processing_status, received_at)
  where processing_status = 'pending';

alter table provider_events enable row level security;

create policy "control_room_service_role_only" on provider_events
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 2. controller_outbox  (transactional work queue)
-- ---------------------------------------------------------------------------
create table if not exists controller_outbox (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  controller     text not null,
  resource_id    text,
  reason         text not null,
  source_event_id uuid references provider_events(id) on delete set null,
  available_at   timestamptz not null default now(),
  claimed_at     timestamptz,
  completed_at   timestamptz,
  attempt_count  int not null default 0,
  last_error     text,

  -- coalesce: one pending entry per (project, controller, resource)
  constraint controller_outbox_coalesce
    unique (project_id, controller, resource_id)
    deferrable initially deferred
);

create index if not exists idx_outbox_available
  on controller_outbox (available_at)
  where completed_at is null and claimed_at is null;

alter table controller_outbox enable row level security;

create policy "control_room_service_role_only" on controller_outbox
  using (auth.role() = 'service_role');

-- Atomic claim function (FOR UPDATE SKIP LOCKED)
create or replace function claim_outbox_work(p_limit int default 10)
returns setof controller_outbox
language sql
security definer
set search_path = public
as $$
  update controller_outbox
  set claimed_at = now()
  where id in (
    select id from controller_outbox
    where completed_at is null
      and claimed_at is null
      and available_at <= now()
    order by available_at asc
    limit p_limit
    for update skip locked
  )
  returning *;
$$;

-- Fail and increment attempt count
create or replace function fail_outbox_work(p_id uuid, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update controller_outbox
  set
    claimed_at = null,
    attempt_count = attempt_count + 1,
    last_error = p_error,
    available_at = now() + (interval '1 second' * power(2, least(attempt_count, 6)))
  where id = p_id;
$$;

-- Increment attempt count on provider_events
create or replace function increment_attempt_count(row_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update provider_events
  set attempt_count = attempt_count + 1
  where id = row_id;
$$;

-- These are security definer functions meant only for the trusted backend
-- (which connects with the service_role key). Supabase's default privileges
-- grant EXECUTE on new functions to anon/authenticated explicitly (not via
-- PUBLIC), so anon/authenticated must be revoked by name or they can call
-- these directly via PostgREST RPC and bypass RLS entirely.
revoke execute on function claim_outbox_work(int) from public, anon, authenticated;
revoke execute on function fail_outbox_work(uuid, text) from public, anon, authenticated;
revoke execute on function increment_attempt_count(uuid) from public, anon, authenticated;

grant execute on function claim_outbox_work(int) to service_role;
grant execute on function fail_outbox_work(uuid, text) to service_role;
grant execute on function increment_attempt_count(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. provider_observations  (latest normalized observed state per resource)
-- ---------------------------------------------------------------------------
create table if not exists provider_observations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  provider        text not null,
  resource_type   text not null,
  resource_id     text not null,
  observed_state  jsonb not null default '{}',
  observed_at     timestamptz not null default now(),
  source_event_id uuid references provider_events(id) on delete set null,

  constraint provider_observations_resource
    unique (project_id, provider, resource_type, resource_id)
);

create index if not exists idx_observations_project
  on provider_observations (project_id, provider, observed_at desc);

alter table provider_observations enable row level security;

create policy "control_room_service_role_only" on provider_observations
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 4. reconciliation_runs  (audit log of each reconciler execution)
-- ---------------------------------------------------------------------------
create table if not exists reconciliation_runs (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid references projects(id) on delete set null,
  controller            text not null,
  resource_id           text,
  reason                text not null,
  status                text not null
    check (status in ('converged','drifted','blocked','retry','error')),
  observed_changes      jsonb not null default '[]',
  proposed_actions      jsonb not null default '[]',
  evidence_ids          jsonb not null default '[]',
  requires_approval     boolean not null default false,
  message               text,
  started_at            timestamptz not null default now(),
  completed_at          timestamptz
);

create index if not exists idx_reconciliation_project
  on reconciliation_runs (project_id, started_at desc);

alter table reconciliation_runs enable row level security;

create policy "control_room_service_role_only" on reconciliation_runs
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 5. controller_leases  (per-resource concurrency locks)
-- ---------------------------------------------------------------------------
create table if not exists controller_leases (
  lease_key   text primary key,
  claimed_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

-- Auto-expire stale leases (safety net for crashed workers)
create index if not exists idx_leases_expires
  on controller_leases (expires_at);

alter table controller_leases enable row level security;

create policy "control_room_service_role_only" on controller_leases
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 6. evidence  (normalized proof records, mission-scoped)
-- ---------------------------------------------------------------------------
create table if not exists evidence (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  mission_id      uuid references missions(id) on delete set null,
  subject         text not null,
  kind            text not null,
  status          text not null
    check (status in ('pass','fail','warn','pending')),
  provider        text not null,
  commit_sha      text,
  environment     text,
  details_ref     text,
  reusable_until  timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_evidence_mission
  on evidence (mission_id, kind, created_at desc);

create index if not exists idx_evidence_project
  on evidence (project_id, created_at desc);

alter table evidence enable row level security;

create policy "control_room_service_role_only" on evidence
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 7. missions – add reconciliation columns if not present
-- ---------------------------------------------------------------------------
alter table missions
  add column if not exists required_checks jsonb not null default '[]',
  add column if not exists manifest_version_id uuid,
  add column if not exists policy_snapshot jsonb not null default '{}',
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 8. project_manifests  (imported desired-state versions)
-- ---------------------------------------------------------------------------
create table if not exists project_manifests (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  repository_provider text not null default 'github',
  repository_identifier text,
  path                text not null default 'manifest.yml',
  commit_sha          text not null,
  content_hash        text not null,
  schema_version      text not null default '1.0',
  parsed_manifest     jsonb not null default '{}',
  validation_status   text not null default 'pending'
    check (validation_status in ('pending','valid','invalid')),
  imported_at         timestamptz not null default now(),
  superseded_at       timestamptz
);

alter table project_manifests enable row level security;

create policy "control_room_service_role_only" on project_manifests
  using (auth.role() = 'service_role');
