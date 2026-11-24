-- Attach the remaining canonical FCR containers to the durable spine.
-- These aggregate/reference evidence. They do not replace source receipts.

create table if not exists truth_snapshots (
  id uuid primary key default gen_random_uuid(),
  founder_intent_id uuid references founder_intents(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  source_truth jsonb not null default '{}'::jsonb,
  build_truth jsonb not null default '{}'::jsonb,
  test_truth jsonb not null default '{}'::jsonb,
  ci_truth jsonb not null default '{}'::jsonb,
  deployment_truth jsonb not null default '{}'::jsonb,
  runtime_truth jsonb not null default '{}'::jsonb,
  provider_truth jsonb not null default '{}'::jsonb,
  outcome_truth jsonb not null default '{}'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  classification text not null default 'unknown' check (classification in ('verified','inferred','unknown','blocked','conflicted','stale')),
  observed_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table truth_snapshots is 'Time-bounded aggregation of truth planes. Source evidence remains authoritative and is never overwritten by this snapshot.';

create table if not exists continuity_records (
  id uuid primary key default gen_random_uuid(),
  founder_intent_id uuid references founder_intents(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  subject_fingerprint text not null,
  proof_cookie text,
  truth_snapshot_id uuid references truth_snapshots(id) on delete set null,
  authority_fingerprint text,
  runtime_fingerprint text,
  evidence_fingerprint text,
  valid_until timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz not null default now()
);
comment on table continuity_records is 'Historical continuity markers. A continuity record can invalidate stale state but never renew or expand authority.';

create table if not exists founder_decisions (
  id uuid primary key default gen_random_uuid(),
  founder_intent_id uuid references founder_intents(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  recommendation text,
  founder_choice text,
  rationale text,
  consequence text,
  decided_at timestamptz,
  reconsider_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists resource_budgets (
  id uuid primary key default gen_random_uuid(),
  founder_intent_id uuid references founder_intents(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  resource_type text not null check (resource_type in ('money','founder_hours','contractor_hours','compute','api_limit','attention','other')),
  unit text not null,
  ceiling numeric,
  consumed numeric not null default 0,
  period_start timestamptz,
  period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recovery_plans (
  id uuid primary key default gen_random_uuid(),
  founder_intent_id uuid references founder_intents(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  action_ref text,
  rollback jsonb not null default '{}'::jsonb,
  retry jsonb not null default '{}'::jsonb,
  reconcile jsonb not null default '{}'::jsonb,
  compensate jsonb not null default '{}'::jsonb,
  abandon jsonb not null default '{}'::jsonb,
  status text not null default 'planned' check (status in ('planned','available','executing','recovered','failed','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table recovery_plans is 'Recovery is a sibling of execution. A plan does not prove recovery occurred; completion requires evidence.';

create index if not exists truth_snapshots_project_observed_idx on truth_snapshots(project_id, observed_at desc);
create index if not exists continuity_records_project_created_idx on continuity_records(project_id, created_at desc);
create index if not exists founder_decisions_intent_idx on founder_decisions(founder_intent_id);
create index if not exists resource_budgets_project_idx on resource_budgets(project_id);
create index if not exists recovery_plans_project_idx on recovery_plans(project_id);

alter table truth_snapshots enable row level security;
alter table continuity_records enable row level security;
alter table founder_decisions enable row level security;
alter table resource_budgets enable row level security;
alter table recovery_plans enable row level security;

revoke all on table truth_snapshots from anon, authenticated;
revoke all on table continuity_records from anon, authenticated;
revoke all on table founder_decisions from anon, authenticated;
revoke all on table resource_budgets from anon, authenticated;
revoke all on table recovery_plans from anon, authenticated;
