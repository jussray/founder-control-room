-- Persist caller-reported and gate-detected failures without rewriting
-- the original proof_gate_results migration.

alter table public.proof_gate_results
  add column if not exists all_failures text[] not null default array[]::text[];

alter table public.proof_gate_results
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_proof_gate_results_created
  on public.proof_gate_results (mission_id, gate_id, created_at desc);

comment on column public.proof_gate_results.all_failures is
  'Complete list of caller-reported and gate-detected failures. Empty array means the gate passed cleanly.';

comment on column public.proof_gate_results.created_at is
  'Insertion timestamp retained alongside ran_at for compatibility.';

comment on column public.proof_gate_results.ran_at is
  'Original gate execution timestamp retained for backwards compatibility.';
