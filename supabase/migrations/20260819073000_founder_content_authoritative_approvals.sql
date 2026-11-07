-- Authoritative one-shot founder approval ledger for first-party content publication.
-- Caller-supplied approval JSON is never execution authority. The trusted FCR backend
-- issues these rows and execution must claim the exact stored row before provider mutation.

begin;

create table if not exists founder_content_approvals (
  approval_id         text primary key
    check (approval_id ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'),
  founder_user_id     text not null,
  proposal_hash       text not null check (proposal_hash ~ '^[0-9a-f]{64}$'),
  public_payload_hash text not null check (public_payload_hash ~ '^[0-9a-f]{64}$'),
  authorization_hash  text not null unique check (authorization_hash ~ '^[0-9a-f]{64}$'),
  platform            text not null check (platform ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  source_repo         text not null,
  source_commit_sha   text not null check (source_commit_sha ~ '^[0-9a-f]{40}$'),
  approval            jsonb not null,
  approved_at         timestamptz not null,
  expires_at          timestamptz not null,
  revoked_at          timestamptz,
  consumed_at         timestamptz,
  consumed_by         text,
  created_at          timestamptz not null default now(),
  constraint founder_content_approvals_expiry_check check (expires_at > approved_at),
  constraint founder_content_approvals_consumption_pair_check check (
    (consumed_at is null and consumed_by is null)
    or (consumed_at is not null and consumed_by is not null)
  )
);

create index if not exists founder_content_approvals_founder_active_idx
  on founder_content_approvals (founder_user_id, expires_at desc)
  where revoked_at is null and consumed_at is null;

create index if not exists founder_content_approvals_proposal_idx
  on founder_content_approvals (proposal_hash, public_payload_hash, platform);

alter table founder_content_approvals enable row level security;
drop policy if exists "founder_content_approvals_service_role_only" on founder_content_approvals;
create policy "founder_content_approvals_service_role_only" on founder_content_approvals
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table founder_content_approvals from anon, authenticated;
grant select, insert, update on table founder_content_approvals to service_role;

comment on table founder_content_approvals is
  'FCR-issued one-shot founder content approvals. Browser/model/queue approval objects are non-authoritative; provider execution must claim a matching stored row.';

commit;
