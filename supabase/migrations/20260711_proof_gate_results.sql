-- Proof Gate Results
-- Persists every gate evaluation so no action can claim "all good"
-- without verifiable, timestamped evidence on record.
--
-- An action in `approvals` may only proceed if a row with
-- status = 'pass' AND matching (mission_id, gate_id) exists here.

create table if not exists proof_gate_results (
  id             uuid primary key default gen_random_uuid(),
  mission_id     uuid not null references missions(id) on delete cascade,
  gate_id        text not null,          -- e.g. 'merge', 'deploy', 'rollback'
  status         text not null check (status in ('pass', 'fail', 'skipped')),
  all_failures   text[] not null default array[]::text[],
  evidence       jsonb not null default '{}'::jsonb,
  approved_by    text,                   -- founder reference string, null = not an approval gate
  created_at     timestamptz not null default now()
);

comment on table proof_gate_results is
  'Every proof gate evaluation — pass or fail — for a mission. '
  'Actions are blocked until a passing row exists for the required gate_id.';

create index if not exists proof_gate_results_mission_gate
  on proof_gate_results (mission_id, gate_id, status, created_at desc);

-- RLS: founder-only (mirrors the approvals table policy)
alter table proof_gate_results enable row level security;

create policy "founder read proof_gate_results"
  on proof_gate_results for select
  using (auth.jwt() ->> 'email' = current_setting('app.founder_email', true));

create policy "founder insert proof_gate_results"
  on proof_gate_results for insert
  with check (auth.jwt() ->> 'email' = current_setting('app.founder_email', true));
