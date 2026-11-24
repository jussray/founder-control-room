-- FCR canonical founder-intent spine.
-- One operating model: FounderIntent -> Project -> Mission -> Outcome.
-- This migration adds durable coordination objects without replacing existing
-- missions, approvals, receipts, evidence, or project-specific product data.

create table if not exists founder_intents (
  id uuid primary key default gen_random_uuid(),
  outcome_wanted text not null,
  why text,
  constraints jsonb not null default '{}'::jsonb,
  consequence_ceiling text not null default 'reversible' check (consequence_ceiling in ('informational','reversible','consequential','irreversible')),
  success_criteria jsonb not null default '[]'::jsonb,
  priority integer not null default 50 check (priority between 0 and 100),
  authority_policy jsonb not null default '{}'::jsonb,
  truth_lease_expires_at timestamptz,
  status text not null default 'active' check (status in ('draft','active','satisfied','paused','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table founder_intents is 'Durable root founder outcomes. Subsystems may serve an intent but never own or replace it.';

create table if not exists founder_intent_projects (
  founder_intent_id uuid not null references founder_intents(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  role text not null default 'contributor' check (role in ('primary','contributor','dependency','observer')),
  created_at timestamptz not null default now(),
  primary key (founder_intent_id, project_id)
);

alter table missions add column if not exists founder_intent_id uuid references founder_intents(id) on delete set null;
create index if not exists missions_founder_intent_idx on missions(founder_intent_id);

create table if not exists outcomes (
  id uuid primary key default gen_random_uuid(),
  founder_intent_id uuid not null references founder_intents(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  intended_outcome text not null,
  actual_outcome text,
  evidence jsonb not null default '[]'::jsonb,
  verification_method text,
  classification text not null default 'unknown' check (classification in ('achieved','partial','failed','unknown')),
  observed_at timestamptz,
  follow_up text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outcomes_intent_idx on outcomes(founder_intent_id);
create index if not exists outcomes_project_idx on outcomes(project_id);
create index if not exists outcomes_mission_idx on outcomes(mission_id);

comment on table outcomes is 'Verified or unresolved founder outcomes. CI/deploy/provider acceptance alone must not be promoted to achieved without outcome evidence.';

-- Preserve the existing server-only founder boundary. These tables are not
-- directly exposed to anon/authenticated clients; application authority stays
-- behind the FCR service role and approval runtime.
alter table founder_intents enable row level security;
alter table founder_intent_projects enable row level security;
alter table outcomes enable row level security;

revoke all on table founder_intents from anon, authenticated;
revoke all on table founder_intent_projects from anon, authenticated;
revoke all on table outcomes from anon, authenticated;
