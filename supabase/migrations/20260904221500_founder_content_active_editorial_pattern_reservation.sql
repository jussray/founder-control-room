-- Atomically reserve one founder editorial pattern through the bounded approval
-- lease while preserving founder_content_approvals as immutable one-shot
-- approval history.
--
-- Exact public-copy identity remains separate: the existing deterministic
-- approval_id continues to serialize byte-identical canonical publishable copy.
-- This migration adds only the missing thesis/hook reservation so two
-- differently worded drafts with the same editorial pattern cannot both hold
-- live publication authority during the same approval/provider-readback window.
--
-- This migration is source-only until an explicitly authorized apply. Merely
-- committing it performs no provider or production database mutation.

begin;

create table if not exists public.founder_content_active_editorial_pattern_reservations (
  founder_user_id     text not null,
  platform            text not null check (platform ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  pattern_fingerprint text not null check (pattern_fingerprint ~ '^[0-9a-f]{64}$'),
  approval_id         text not null references public.founder_content_approvals(approval_id) on delete restrict,
  reserved_at         timestamptz not null,
  expires_at          timestamptz not null,
  primary key (founder_user_id, platform, pattern_fingerprint),
  constraint founder_content_active_editorial_pattern_reservations_expiry_check
    check (expires_at > reserved_at)
);

create index if not exists founder_content_active_editorial_pattern_reservations_approval_idx
  on public.founder_content_active_editorial_pattern_reservations (approval_id);

alter table public.founder_content_active_editorial_pattern_reservations enable row level security;
drop policy if exists "founder_content_active_editorial_pattern_reservations_service_role_only"
  on public.founder_content_active_editorial_pattern_reservations;
create policy "founder_content_active_editorial_pattern_reservations_service_role_only"
  on public.founder_content_active_editorial_pattern_reservations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.founder_content_active_editorial_pattern_reservations from public;
revoke all on table public.founder_content_active_editorial_pattern_reservations from anon, authenticated;
grant select, insert, update on table public.founder_content_active_editorial_pattern_reservations to service_role;

create or replace function public.issue_founder_content_approval_with_pattern_reservation(
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
  normalized_pattern_fingerprint text := lower(btrim(coalesce(p_pattern_fingerprint, '')));
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
    or normalized_pattern_fingerprint !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  if lower(btrim(coalesce(p_approval->>'approval_id', ''))) <> normalized_approval_id
    or lower(btrim(coalesce(p_approval->>'proposal_hash', ''))) <> lower(btrim(p_proposal_hash))
    or lower(btrim(coalesce(p_approval->>'public_payload_hash', ''))) <> lower(btrim(p_public_payload_hash)) then
    return false;
  end if;

  -- Every issuer acquires the same key in the same form before inspecting or
  -- replacing the active reservation. Novelty history is advisory evidence;
  -- this transaction is the authoritative concurrent issuance boundary.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      normalized_founder_user_id || E'\x1f' || normalized_platform || E'\x1f' || normalized_pattern_fingerprint,
      0
    )
  );

  -- Consumption is intentionally NOT a release signal. A consumed one-shot
  -- approval may already have crossed into provider execution while publication
  -- readback is still pending. Keep its editorial pattern reserved through the
  -- bounded approval lease unless the approval was explicitly revoked.
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

  -- The exact-copy approval identity remains independently deterministic in
  -- application code. A duplicate approval_id therefore still fails closed;
  -- the pattern reservation below adds a second, orthogonal concurrency key.
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

revoke all on function public.issue_founder_content_approval_with_pattern_reservation(
  text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz, text
) from public;
revoke all on function public.issue_founder_content_approval_with_pattern_reservation(
  text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz, text
) from anon;
revoke all on function public.issue_founder_content_approval_with_pattern_reservation(
  text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz, text
) from authenticated;
grant execute on function public.issue_founder_content_approval_with_pattern_reservation(
  text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz, text
) to service_role;

comment on table public.founder_content_active_editorial_pattern_reservations is
  'Current founder/platform editorial-pattern lease. Linked founder_content_approvals rows remain immutable history; a non-revoked approval keeps the pattern through its bounded expires_at even after one-shot consumption, covering provider execution/readback latency.';

comment on function public.issue_founder_content_approval_with_pattern_reservation(
  text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz, text
) is
  'Atomically inserts one exact-copy founder approval and acquires the founder/platform PromptOS editorial-pattern reservation only when no linked non-revoked, unexpired approval already owns that pattern. Consumption does not release the lease early; exact-copy and editorial-pattern identities remain separate.';

commit;
