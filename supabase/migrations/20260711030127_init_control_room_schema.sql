-- Founder Control Room — initial schema
-- This is a DEDICATED Supabase project (founder-control-room, ref
-- oojzfmmywbvficgybaxd). It is NOT Se'kret Bip's database. Nothing here
-- stores teen/parent app data — only founder-operations data.
--
-- Design rule: every table uses `project_id` (text slug, e.g. "sekret-bip"),
-- never a project-specific id like `bip_id`. Bip is Project #1, not the
-- center of the schema. The question to ask before adding any column:
-- "Would this still make sense with 25 products connected?"

create extension if not exists "pgcrypto";

-- ============================================================
-- Project Registry
-- ============================================================

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                 -- e.g. "sekret-bip" — stable projectId used everywhere
  name text not null,                        -- e.g. "Se'kret Bip"
  repo_provider text not null default 'github', -- matches RepositoryProvider.name
  repo_identifier text,                      -- e.g. "jussray/Sekret-Bip"
  cloudflare_account text,
  supabase_project text,                     -- the PROJECT'S OWN Supabase ref, not this one
  stack text,                                -- e.g. "expo/react-native + cloudflare worker + supabase"
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table projects is 'Every product/repo the Control Room manages. Bip is one row, not a special case.';

-- Generic connection slots per project — git host, cloud, AI providers,
-- commerce, app stores, etc. Secrets are NOT stored here; this only records
-- that a connection exists and its non-secret config. Actual credentials
-- live in the Control Room's secret manager / env, referenced by `secret_ref`.
create table if not exists project_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  connection_type text not null check (connection_type in (
    'git', 'cloudflare', 'supabase', 'openai', 'anthropic',
    'shopify', 'expo', 'apple', 'google_play', 'stripe', 'other'
  )),
  label text,                                -- free-form, e.g. "production" vs "staging"
  config jsonb not null default '{}'::jsonb, -- non-secret config (account ids, project refs, region)
  secret_ref text,                           -- pointer to where the actual credential lives
  status text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, connection_type, label)
);

comment on table project_connections is 'Plug-in slots so any project can attach Git/Cloudflare/Supabase/AI/commerce providers without schema changes.';

-- ============================================================
-- Observability: sanitized events ingested FROM each project
-- ============================================================

create table if not exists project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_event_id text,                      -- dedupe key from the origin system
  event_type text not null,                  -- e.g. "openai_reply_failure", "deploy_succeeded"
  severity text not null default 'info' check (severity in ('info', 'warning', 'error', 'critical')),
  screen text,
  provider text,
  model text,
  decision text,
  latency_ms integer,
  metadata jsonb not null default '{}'::jsonb, -- allowlisted operational fields ONLY, never raw content
  created_at timestamptz not null default now()
);

create unique index if not exists project_events_dedupe
  on project_events (project_id, source_event_id)
  where source_event_id is not null;

comment on table project_events is 'Curated, sanitized operational events only — no raw journal content, messages, transcripts, names, or emails.';

-- ============================================================
-- Missions (Issues-equivalent) and Change Proposals (PR-equivalent)
-- ============================================================

create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'proposed' check (status in (
    'proposed', 'sandboxed', 'in_review', 'approved', 'integrated', 'deployed', 'rejected', 'rolled_back'
  )),
  base_ref text,
  branch_ref text,
  builder_agent text,                        -- e.g. "codex", "claude-code", "cursor"
  reviewer_agent text,
  risk_level text default 'medium' check (risk_level in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists change_proposals (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  base_commit text not null,
  candidate_commit text not null,
  files_changed integer default 0,
  diff_summary jsonb,                        -- structured Diff (see src/providers/RepositoryProvider.ts)
  ci_status text default 'not_run' check (ci_status in ('not_run', 'running', 'passed', 'failed')),
  founder_decision text default 'pending' check (founder_decision in (
    'pending', 'approved', 'revision_requested', 'another_council_round', 'rejected'
  )),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ============================================================
-- Approval Engine (L99 authority model — no approval carries forward)
-- ============================================================

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references missions(id) on delete cascade,
  change_proposal_id uuid references change_proposals(id) on delete cascade,
  action text not null check (action in (
    'create_sandbox_workspace', 'create_branch', 'integrate', 'deploy', 'rollback'
  )),
  decision text not null check (decision in ('approved', 'denied')),
  decided_by text not null default 'founder',
  decided_at timestamptz not null default now(),
  notes text
);

comment on table approvals is 'Every gated action gets its own row. No approval implicitly authorizes the next step.';

-- ============================================================
-- Runner / CI evidence (Agent Council + Bench)
-- ============================================================

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references missions(id) on delete cascade,
  change_proposal_id uuid references change_proposals(id) on delete cascade,
  runner_profile text,                       -- e.g. "bip-default", "jbh-storefront"
  checks jsonb not null default '{}'::jsonb, -- { typecheck: "passed", unitTests: "failed", ... }
  status text not null default 'pending' check (status in ('pending', 'running', 'passed', 'failed')),
  artifact_ids text[] default array[]::text[],
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists council_conversations (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references missions(id) on delete cascade,
  round integer not null default 1,
  participants text[] default array[]::text[], -- e.g. ["codex", "claude", "redteam"]
  transcript jsonb,
  outcome text,
  created_at timestamptz not null default now()
);

create table if not exists agent_costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  mission_id uuid references missions(id) on delete cascade,
  agent_name text not null,
  provider text,                             -- "openai", "anthropic", "perplexity", etc.
  model text,
  input_tokens integer default 0,
  output_tokens integer default 0,
  cost_usd numeric(10,4) default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Release Center
-- ============================================================

create table if not exists releases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  change_proposal_id uuid references change_proposals(id),
  version text,
  commit_sha text,
  status text not null default 'pending' check (status in ('pending', 'deployed', 'rolled_back', 'failed')),
  deployed_at timestamptz,
  rolled_back_at timestamptz,
  notes text
);

-- ============================================================
-- PromptOS (already a real product — 157 prompts today)
-- ============================================================

create table if not exists promptos_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tagline text,
  slash_command text,                        -- e.g. "/l99", "/ship", "/5why"
  category text,                             -- e.g. "coding", "modes", "focus", "ux", "research"
  platforms text[] default array[]::text[],  -- e.g. ["chatgpt", "claude", "perplexity"]
  icon text,
  body_template text not null,               -- prompt body with [PLACEHOLDER] variables
  variables text[] default array[]::text[],  -- extracted [PLACEHOLDER] names
  is_starred boolean not null default false,
  is_custom boolean not null default false,
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists promptos_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references promptos_templates(id) on delete cascade,
  version integer not null,
  body_template text not null,
  change_note text,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

-- ============================================================
-- Mission / incident summaries (Issues-equivalent, condensed)
-- ============================================================

create table if not exists issue_summaries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  mission_id uuid references missions(id) on delete cascade,
  title text not null,
  classification text check (classification in (
    'regression', 'security', 'failed_build', 'model_drift', 'privacy', 'deployment_failure', 'other'
  )),
  severity text default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text default 'open' check (status in ('open', 'investigating', 'resolved', 'wont_fix')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ============================================================
-- Updated-at triggers
-- ============================================================

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_set_updated_at before update on projects
  for each row execute function set_updated_at();
create trigger project_connections_set_updated_at before update on project_connections
  for each row execute function set_updated_at();
create trigger missions_set_updated_at before update on missions
  for each row execute function set_updated_at();
create trigger promptos_templates_set_updated_at before update on promptos_templates
  for each row execute function set_updated_at();

-- ============================================================
-- Seed: Bip is Project #1, not a special case
-- ============================================================

insert into projects (slug, name, repo_provider, repo_identifier, stack, status, risk_level)
values ('sekret-bip', 'Se''kret Bip', 'github', 'jussray/Sekret-Bip', 'expo/react-native + cloudflare worker + supabase', 'active', 'high')
on conflict (slug) do nothing;
