-- =============================================================================
-- Proof gate results table
-- Stores every gate run for audit and replay.
-- =============================================================================

create table if not exists proof_gate_results (
  id          uuid primary key default gen_random_uuid(),
  mission_id  uuid references missions(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  gate_id     text not null,
  status      text not null check (status in ('pass', 'fail', 'skipped')),
  evidence    jsonb not null default '{}',
  approved_by text,
  ran_at      timestamptz not null default now()
);

create index if not exists idx_proof_gate_results_mission
  on proof_gate_results (mission_id, ran_at desc);

create index if not exists idx_proof_gate_results_latest
  on proof_gate_results (mission_id, gate_id, ran_at desc);

alter table proof_gate_results enable row level security;

create policy "founders_can_read" on proof_gate_results
  for select using (auth.role() = 'authenticated');

create policy "service_role_insert" on proof_gate_results
  for insert with check (auth.role() = 'service_role');
