-- proof_gate_results
-- Persists every proof gate evaluation run by ProofGateController.
-- One row per gate run; evidence is stored as JSONB for schema flexibility.

create table if not exists public.proof_gate_results (
  id             uuid primary key default gen_random_uuid(),
  mission_id     uuid not null references public.missions(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,

  -- Which gate was evaluated (e.g. 'evidence-complete', 'deploy', 'merge')
  gate_id        text not null,

  -- 'pass' | 'fail' | 'skipped'
  status         text not null check (status in ('pass', 'fail', 'skipped')),

  -- Full ProofEvidence payload
  evidence       jsonb not null default '{}'::jsonb,

  -- Free-text founder approval reference (null = no approval required / not yet given)
  approved_by    text,

  -- When the gate ran (set by the application; stored alongside created_at)
  ran_at         timestamptz not null default now(),

  created_at     timestamptz not null default now()
);

-- Indexes for the two most common query patterns:
--   1. All gate results for a mission (audit trail)
--   2. Latest result for a specific gate on a mission
create index if not exists proof_gate_results_mission_id_idx
  on public.proof_gate_results (mission_id, ran_at desc);

create index if not exists proof_gate_results_gate_id_idx
  on public.proof_gate_results (mission_id, gate_id, ran_at desc);

-- RLS
alter table public.proof_gate_results enable row level security;

-- Founders can read all gate results for projects they own
create policy "founders can read proof gate results"
  on public.proof_gate_results
  for select
  using (
    exists (
      select 1 from public.founder_users fu
      where fu.email = auth.email()
    )
  );

comment on table public.proof_gate_results is
  'Audit log of every proof gate evaluation. One row per gate run.';
comment on column public.proof_gate_results.gate_id is
  'Identifies which gate ran (e.g. evidence-complete, deploy, merge).';
comment on column public.proof_gate_results.evidence is
  'Full ProofEvidence payload serialised as JSONB.';
comment on column public.proof_gate_results.approved_by is
  'Free-text founder approval reference. NULL if no approval was required.';
