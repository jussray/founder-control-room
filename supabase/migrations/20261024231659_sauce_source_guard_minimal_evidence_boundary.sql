begin;

-- Source/catalog observations only. Never represents founder approval,
-- publication permission, database-mutation permission, or live runtime proof.
create table public.guard_source_verification_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  guard_name text not null
    check (guard_name in ('sauce_guard', 'source_guard')),
  check_scope text not null
    check (check_scope in ('repository_source', 'supabase_access_catalog')),
  source_repository text not null default 'jussray/founder-control-room'
    check (source_repository = 'jussray/founder-control-room'),
  source_commit_sha text not null
    check (source_commit_sha ~ '^[0-9a-f]{40}$'),
  observed_result text not null
    check (observed_result in ('passed', 'failed', 'unknown')),
  evidence_url text
    check (
      evidence_url is null or (
        length(evidence_url) <= 255 and (
          evidence_url ~ '^https://github[.]com/jussray/founder-control-room/commit/[0-9a-f]{40}$'
          or evidence_url ~ '^https://github[.]com/jussray/founder-control-room/actions/runs/[0-9]+$'
        )
      )
    ),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint guard_source_verification_no_unreferenced_pass
    check (observed_result <> 'passed' or evidence_url is not null)
);

create index guard_source_verification_receipts_subject_idx
  on public.guard_source_verification_receipts
  (source_commit_sha, guard_name, observed_at desc);

alter table public.guard_source_verification_receipts enable row level security;

-- Supabase projects may auto-grant new public tables to client roles.
-- Explicitly remove all, including inherited PUBLIC rights.
revoke all on table public.guard_source_verification_receipts
  from public, anon, authenticated, service_role;

-- Append-only for the service API role: no UPDATE, DELETE, TRUNCATE or
-- other mutation privileges. No client policy is created.
grant select, insert on table public.guard_source_verification_receipts
  to service_role;

comment on table public.guard_source_verification_receipts is
  'Append-only, service-role-only observations of bounded Sauce Guard and Source Guard source/catalog checks. No raw content, secrets, founder identity, approvals, publication authority, deploy authority, or runtime-outcome attestation.';

comment on column public.guard_source_verification_receipts.observed_result is
  'Self-reported scoped check result, not independent confirmation of founder approval or real-world publication.';

commit;