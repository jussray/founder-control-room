-- Forward-only durable founder permission broker reconstructed on current main.
-- This is a new source migration identity after the reconciled migration ledger.
-- It is intentionally unapplied by this branch and must not impersonate a
-- historical/provider-applied migration version.
-- Requests carry no execution authority. Only an explicit founder decision can
-- create authoritative decision state for later FounderPermissionReceipt issuance.

create table if not exists public.founder_permission_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  request_contract text not null,
  requested_by_surface text not null,
  request_hash text not null,
  proposal jsonb not null,
  note text,
  status text not null default 'pending',
  decision jsonb,
  decision_hash text,
  decision_surface text,
  founder_user_id uuid,
  founder_email text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  consumed_at timestamptz,
  constraint founder_permission_request_id_nonempty check (length(btrim(request_id)) >= 6),
  constraint founder_permission_request_contract_v1 check (request_contract = 'juss-v10/founder-permission-request@v1'),
  constraint founder_permission_request_surface check (requested_by_surface in ('fcr','chatgpt','claude','perplexity')),
  constraint founder_permission_request_hash_sha256 check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint founder_permission_status check (status in ('pending','approved','rejected','change_requested')),
  constraint founder_permission_decision_hash_sha256 check (decision_hash is null or decision_hash ~ '^[0-9a-f]{64}$'),
  constraint founder_permission_decision_surface check (decision_surface is null or decision_surface in ('fcr','chatgpt','claude','perplexity')),
  constraint founder_permission_decision_consistency check (
    (status = 'pending' and decision is null and decision_hash is null and decision_surface is null and decided_at is null)
    or
    (status <> 'pending' and decision is not null and decision_hash is not null and decision_surface is not null and decided_at is not null)
  )
);

create index if not exists founder_permission_requests_pending_idx
  on public.founder_permission_requests (status, requested_at desc);

alter table public.founder_permission_requests enable row level security;
revoke all on table public.founder_permission_requests from anon, authenticated;

comment on table public.founder_permission_requests is
  'Service-role-only ledger for exact-scope founder permission requests and decisions. Rows do not satisfy independent review and do not themselves authorize execution.';
