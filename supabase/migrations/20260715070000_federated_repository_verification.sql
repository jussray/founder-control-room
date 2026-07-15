-- Federated repository verification.
-- Each product repo remains authoritative for its own code, checks, runtime,
-- and rollback. The Founder Control Room stores only sanitized evidence and
-- drift findings; it never stores raw product/user content.

alter table public.project_manifests
  add column if not exists default_branch text,
  add column if not exists validation_errors jsonb not null default '[]'::jsonb,
  add column if not exists observed_at timestamptz not null default now();

create unique index if not exists project_manifests_identity_uq
  on public.project_manifests(project_id, commit_sha, content_hash);
create index if not exists project_manifests_project_observed_idx
  on public.project_manifests(project_id, observed_at desc);

create table if not exists public.repository_verification_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source text not null check (source in ('active_scan', 'repo_ping', 'runner')),
  delivery_id text,
  repository_provider text not null,
  repository_identifier text not null,
  branch text not null,
  commit_sha text not null,
  manifest_hash text not null,
  overall_status text not null check (overall_status in ('passed', 'warning', 'failed')),
  checks jsonb not null default '[]'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,
  runner jsonb not null default '{}'::jsonb,
  signature_verified boolean not null default false,
  scanned_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique(project_id, source, delivery_id)
);

create index if not exists repository_verification_project_received_idx
  on public.repository_verification_runs(project_id, received_at desc);
create index if not exists repository_verification_commit_idx
  on public.repository_verification_runs(project_id, commit_sha);

create table if not exists public.repository_capability_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  capability_id text not null,
  claimed_status text not null check (claimed_status in ('active', 'planned', 'retired')),
  observed_status text not null check (observed_status in ('verified', 'drifted', 'unverified', 'retired')),
  evidence_paths text[] not null default array[]::text[],
  missing_evidence_paths text[] not null default array[]::text[],
  required_signal_ids text[] not null default array[]::text[],
  failed_signal_ids text[] not null default array[]::text[],
  reason text,
  commit_sha text not null,
  last_verified_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique(project_id, capability_id)
);

create index if not exists repository_capability_project_status_idx
  on public.repository_capability_evidence(project_id, observed_status);

create table if not exists public.repository_findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  verification_run_id uuid references public.repository_verification_runs(id) on delete set null,
  mission_id uuid references public.missions(id) on delete set null,
  fingerprint text not null,
  category text not null check (category in ('manifest', 'check', 'capability', 'runtime', 'provider')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  title text not null,
  detail text,
  suggested_action text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(project_id, fingerprint)
);

create index if not exists repository_findings_project_status_idx
  on public.repository_findings(project_id, status, severity);

alter table public.repository_verification_runs enable row level security;
alter table public.repository_capability_evidence enable row level security;
alter table public.repository_findings enable row level security;

-- Backend/service-role only. The founder UI reaches these through the
-- founder-authenticated API, not by receiving direct table grants.
revoke all on table public.repository_verification_runs from anon, authenticated;
revoke all on table public.repository_capability_evidence from anon, authenticated;
revoke all on table public.repository_findings from anon, authenticated;

comment on table public.repository_verification_runs is
  'Sanitized exact-commit verification packets from active scans or repo-local runners.';
comment on table public.repository_capability_evidence is
  'Maps each repository capability claim to exact code paths and verification signals.';
comment on table public.repository_findings is
  'Deduplicated drift pings surfaced to Founder Control Room; may become approval-gated missions.';
