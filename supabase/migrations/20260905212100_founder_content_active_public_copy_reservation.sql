-- Keep immutable one-shot approval history while allowing a fresh approval row
-- for unchanged canonical copy after every earlier copy/pattern lease is inactive.
--
-- Exact public-copy and editorial-pattern identity are independent authority
-- keys. Both must be free in the same transaction before a new approval row is
-- inserted. This prevents versioned approval row ids from reopening concurrent
-- duplicate-copy issuance when canonical claim metadata changes the editorial
-- pattern fingerprint.
--
-- This migration is source-only until an explicitly authorized apply. Merely
-- committing it performs no provider or production database mutation.

begin;

create table if not exists public.founder_content_active_public_copy_reservations (
  founder_user_id         text not null,
  platform                text not null check (platform ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  public_copy_fingerprint text not null check (public_copy_fingerprint ~ '^[0-9a-f]{64}$'),
  approval_id             text not null references public.founder_content_approvals(approval_id) on delete restrict,
  reserved_at             timestamptz not null,
  expires_at              timestamptz not null,
  primary key (founder_user_id, platform, public_copy_fingerprint),
  constraint founder_content_active_public_copy_reservations_expiry_check
    check (expires_at > reserved_at)
);

create index if not exists founder_content_active_public_copy_reservations_approval_idx
  on public.founder_content_active_public_copy_reservations (approval_id);

alter table public.founder_content_active_public_copy_reservations enable row level security;
drop policy if exists "founder_content_active_public_copy_reservations_service_role_only"
  on public.founder_content_active_public_copy_reservations;
create policy "founder_content_active_public_copy_reservations_service_role_only"
  on public.founder_content_active_public_copy_reservations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.founder_content_active_public_copy_reservations from public;
revoke all on table public.founder_content_active_public_copy_reservations from anon, authenticated;
grant select, insert, update on table public.founder_content_active_public_copy_reservations to service_role;

create or replace function public.issue_founder_content_approval_with_active_reservations(
  p_approval_id text,
  p_founder_user_id text,
  p_proposal_hash text,
  p_public_payload_hash text,
  p_authorization_hash text,
  p_platform text,
  p_source_repo text,
  p_source_commit_sha text,
  p_approval jsonb,
  p_approved_at timestamptz,
  p_expires_at timestamptz,
  p_public_copy_fingerprint text,
  p_pattern_fingerprint text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_approval_id text := lower(btrim(coalesce(p_approval_id, '')));
  normalized_founder_user_id text := btrim(coalesce(p_founder_user_id, ''));
  normalized_platform text := lower(btrim(coalesce(p_platform, '')));
  normalized_public_copy_fingerprint text := lower(btrim(coalesce(p_public_copy_fingerprint, '')));
  normalized_pattern_fingerprint text := lower(btrim(coalesce(p_pattern_fingerprint, '')));
  copy_lock bigint;
  pattern_lock bigint;
  active_approval_id text;
begin
  if normalized_approval_id = ''
    or normalized_founder_user_id = ''
    or normalized_platform = ''
    or btrim(coalesce(p_source_repo, '')) = ''
    or p_approval is null
    or p_approved_at is null
    or p_expires_at is null
    or p_expires_at <= p_approved_at then
    return false;
  end if;

  if lower(btrim(coalesce(p_proposal_hash, ''))) !~ '^[0-9a-f]{64}$'
    or lower(btrim(coalesce(p_public_payload_hash, ''))) !~ '^[0-9a-f]{64}$'
    or lower(btrim(coalesce(p_authorization_hash, ''))) !~ '^[0-9a-f]{64}$'
    or lower(btrim(coalesce(p_source_commit_sha, ''))) !~ '^[0-9a-f]{40}$'
    or normalized_public_copy_fingerprint !~ '^[0-9a-f]{64}$'
    or normalized_pattern_fingerprint !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  if lower(btrim(coalesce(p_approval->>'approval_id', ''))) <> normalized_approval_id
    or lower(btrim(coalesce(p_approval->>'proposal_hash', ''))) <> lower(btrim(p_proposal_hash))
    or lower(btrim(coalesce(p_approval->>'public_payload_hash', ''))) <> lower(btrim(p_public_payload_hash)) then
    return false;
  end if;

  -- Acquire both authority locks in deterministic numeric order so two requests
  -- that overlap on only one key cannot deadlock by taking copy/pattern locks in
  -- opposite order.
  copy_lock := pg_catalog.hashtextextended(
    'copy' || E'\x1f' || normalized_founder_user_id || E'\x1f' || normalized_platform || E'\x1f' || normalized_public_copy_fingerprint,
    0
  );
  pattern_lock := pg_catalog.hashtextextended(
    'pattern' || E'\x1f' || normalized_founder_user_id || E'\x1f' || normalized_platform || E'\x1f' || normalized_pattern_fingerprint,
    0
  );

  if copy_lock = pattern_lock then
    perform pg_catalog.pg_advisory_xact_lock(copy_lock);
  elsif copy_lock < pattern_lock then
    perform pg_catalog.pg_advisory_xact_lock(copy_lock);
    perform pg_catalog.pg_advisory_xact_lock(pattern_lock);
  else
    perform pg_catalog.pg_advisory_xact_lock(pattern_lock);
    perform pg_catalog.pg_advisory_xact_lock(copy_lock);
  end if;

  -- A consumed approval remains active through its bounded lease because a
  -- provider execution/readback may still be in flight. Revocation or expiry
  -- makes the reservation inactive without deleting the historical approval.
  select reservations.approval_id
    into active_approval_id
    from public.founder_content_active_public_copy_reservations as reservations
    join public.founder_content_approvals as approvals
      on approvals.approval_id = reservations.approval_id
   where reservations.founder_user_id = normalized_founder_user_id
     and reservations.platform = normalized_platform
     and reservations.public_copy_fingerprint = normalized_public_copy_fingerprint
     and approvals.revoked_at is null
     and approvals.expires_at > p_approved_at
   limit 1;

  if found then
    return false;
  end if;

  select reservations.approval_id
    into active_approval_id
    from public.founder_content_active_editorial_pattern_reservations as reservations
    join public.founder_content_approvals as approvals
      on approvals.approval_id = reservations.approval_id
   where reservations.founder_user_id = normalized_founder_user_id
     and reservations.platform = normalized_platform
     and reservations.pattern_fingerprint = normalized_pattern_fingerprint
     and approvals.revoked_at is null
     and approvals.expires_at > p_approved_at
   limit 1;

  if found then
    return false;
  end if;

  begin
    insert into public.founder_content_approvals (
      approval_id,
      founder_user_id,
      proposal_hash,
      public_payload_hash,
      authorization_hash,
      platform,
      source_repo,
      source_commit_sha,
      approval,
      approved_at,
      expires_at,
      revoked_at,
      consumed_at,
      consumed_by
    ) values (
      normalized_approval_id,
      normalized_founder_user_id,
      lower(btrim(p_proposal_hash)),
      lower(btrim(p_public_payload_hash)),
      lower(btrim(p_authorization_hash)),
      normalized_platform,
      btrim(p_source_repo),
      lower(btrim(p_source_commit_sha)),
      p_approval,
      p_approved_at,
      p_expires_at,
      null,
      null,
      null
    );
  exception
    when unique_violation then
      return false;
  end;

  insert into public.founder_content_active_public_copy_reservations (
    founder_user_id,
    platform,
    public_copy_fingerprint,
    approval_id,
    reserved_at,
    expires_at
  ) values (
    normalized_founder_user_id,
    normalized_platform,
    normalized_public_copy_fingerprint,
    normalized_approval_id,
    p_approved_at,
    p_expires_at
  )
  on conflict (founder_user_id, platform, public_copy_fingerprint)
  do update set
    approval_id = excluded.approval_id,
    reserved_at = excluded.reserved_at,
    expires_at = excluded.expires_at;

  insert into public.founder_content_active_editorial_pattern_reservations (
    founder_user_id,
    platform,
    pattern_fingerprint,
    approval_id,
    reserved_at,
    expires_at
  ) values (
    normalized_founder_user_id,
    normalized_platform,
    normalized_pattern_fingerprint,
    normalized_approval_id,
    p_approved_at,
    p_expires_at
  )
  on conflict (founder_user_id, platform, pattern_fingerprint)
  do update set
    approval_id = excluded.approval_id,
    reserved_at = excluded.reserved_at,
    expires_at = excluded.expires_at;

  return true;
end;
$function$;

revoke all on function public.issue_founder_content_approval_with_active_reservations(
  text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz, text, text
) from public;
revoke all on function public.issue_founder_content_approval_with_active_reservations(
  text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz, text, text
) from anon;
revoke all on function public.issue_founder_content_approval_with_active_reservations(
  text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz, text, text
) from authenticated;
grant execute on function public.issue_founder_content_approval_with_active_reservations(
  text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz, text, text
) to service_role;

comment on table public.founder_content_active_public_copy_reservations is
  'Current founder/platform exact canonical public-copy lease. Historical founder_content_approvals remain immutable; revocation or expiry permits a later fresh approval row while active/provider-in-flight copy remains serialized.';

comment on function public.issue_founder_content_approval_with_active_reservations(
  text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz, text, text
) is
  'Atomically requires both exact-copy and PromptOS editorial-pattern authority keys to be inactive before inserting a versioned immutable founder approval and moving both active reservation pointers. Consumption does not release either lease early.';

commit;
