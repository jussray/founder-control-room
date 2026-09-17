-- Durable founder truth-console records.
-- Reuses existing evidence, reconciliation_runs, truth_snapshots, and
-- continuity_records as the authoritative proof spine instead of duplicating them.

create table if not exists truth_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  statement text not null check (char_length(statement) between 1 and 4000),
  classification text not null default 'unknown'
    check (classification in ('verified','inferred','unknown','blocked','conflicted','stale')),
  revision bigint not null default 1 check (revision > 0),
  created_by text not null,
  current_truth_snapshot_id uuid references truth_snapshots(id) on delete set null,
  current_subject_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table truth_claims is 'Founder-authored claims whose proof state is derived from existing evidence, truth snapshots, reconciliation receipts, and continuity records.';

create table if not exists truth_claim_evidence (
  claim_id uuid not null references truth_claims(id) on delete cascade,
  evidence_id uuid not null references evidence(id) on delete cascade,
  relation text not null default 'supports'
    check (relation in ('supports','contradicts','context')),
  created_at timestamptz not null default now(),
  primary key (claim_id, evidence_id)
);
comment on table truth_claim_evidence is 'Links normalized evidence to a truth claim without copying or mutating the source evidence receipt.';

create table if not exists truth_attacks (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references truth_claims(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  attack_type text not null default 'version'
    check (attack_type in ('version','premise','evidence','authority','runtime')),
  challenge text not null check (char_length(challenge) between 1 and 4000),
  severity text not null default 'medium'
    check (severity in ('low','medium','high','critical')),
  status text not null default 'open'
    check (status in ('open','resolved')),
  created_by text not null,
  resolution_answer text,
  resolution_evidence_id uuid references evidence(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table truth_attacks is 'Founder-visible challenge ledger. Resolving an attack can invalidate continuity but never grants authority.';

create index if not exists truth_claims_project_updated_idx on truth_claims(project_id, updated_at desc);
create index if not exists truth_claim_evidence_claim_idx on truth_claim_evidence(claim_id, created_at desc);
create index if not exists truth_attacks_claim_created_idx on truth_attacks(claim_id, created_at desc);
create index if not exists truth_attacks_project_status_idx on truth_attacks(project_id, status, created_at desc);

alter table truth_claims enable row level security;
alter table truth_claim_evidence enable row level security;
alter table truth_attacks enable row level security;

revoke all on table truth_claims from anon, authenticated;
revoke all on table truth_claim_evidence from anon, authenticated;
revoke all on table truth_attacks from anon, authenticated;

grant select, insert, update, delete on table truth_claims to service_role;
grant select, insert, update, delete on table truth_claim_evidence to service_role;
grant select, insert, update, delete on table truth_attacks to service_role;