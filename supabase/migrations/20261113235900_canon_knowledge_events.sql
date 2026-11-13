-- FCR canon evidence: append-only server-owned historical observations.
-- Runtime proof and merge/deploy authority remain separate.
create table if not exists public.canon_knowledge_events (
  project text not null check (length(project) between 1 and 120),
  claim_key text not null check (length(claim_key) between 1 and 160),
  sequence integer not null check (sequence > 0),
  contract text not null check (contract = 'fcr/canon-knowledge@v1'),
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  receipt_id text not null check (length(receipt_id) between 1 and 200),
  authority text not null check (authority in ('repository','provider','runtime','human-outcome','approved-record')),
  source_ref text not null check (length(source_ref) between 1 and 500),
  verifier_id text not null check (length(verifier_id) between 1 and 200),
  action text not null check (action in ('established','reverified','superseded')),
  supersedes text check (supersedes is null or supersedes ~ '^[0-9a-f]{64}$'),
  event_hash text not null check (event_hash ~ '^[0-9a-f]{64}$'),
  inserted_at timestamptz not null default now(),
  primary key (project, claim_key, sequence),
  unique (project, claim_key, receipt_id),
  unique (project, claim_key, event_hash)
);
comment on table public.canon_knowledge_events is 'Server-only immutable last-known verified canon; does not authorize current actions.';
alter table public.canon_knowledge_events enable row level security;
revoke all on public.canon_knowledge_events from public, anon, authenticated;
grant select, insert on public.canon_knowledge_events to service_role;
-- Even service-role operations must not rewrite verified historical evidence.
create or replace function public.canon_knowledge_no_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'CANON_APPEND_ONLY';
end;
$$;
revoke all on function public.canon_knowledge_no_mutation() from public, anon, authenticated;
drop trigger if exists canon_knowledge_immutable on public.canon_knowledge_events;
create trigger canon_knowledge_immutable
before update or delete on public.canon_knowledge_events
for each row execute function public.canon_knowledge_no_mutation();
