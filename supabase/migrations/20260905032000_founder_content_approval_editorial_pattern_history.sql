-- Preserve the editorial-pattern identity of every founder-content approval as
-- immutable history so a provider-verified publication can remain part of the
-- future novelty gate after the active reservation lease expires or moves.
--
-- The active reservation table is an authority lease, not a historical ledger.
-- This table is populated only from that serialized issuance boundary and stores
-- no raw thesis, hook, post copy, credentials, or provider payload.
--
-- Source-only until an explicitly authorized production migration apply.

begin;

create table if not exists public.founder_content_approval_editorial_pattern_history (
  approval_id         text primary key
    references public.founder_content_approvals(approval_id) on delete restrict,
  founder_user_id     text not null,
  platform            text not null
    check (platform ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  pattern_fingerprint text not null
    check (pattern_fingerprint ~ '^[0-9a-f]{64}$'),
  bound_at             timestamptz not null
);

alter table public.founder_content_approval_editorial_pattern_history enable row level security;

revoke all on table public.founder_content_approval_editorial_pattern_history from public;
revoke all on table public.founder_content_approval_editorial_pattern_history from anon, authenticated;
revoke all on table public.founder_content_approval_editorial_pattern_history from service_role;
grant select on table public.founder_content_approval_editorial_pattern_history to service_role;

-- Preserve every currently recoverable approval-pattern binding before the
-- trigger begins capturing future active-reservation inserts/updates.
insert into public.founder_content_approval_editorial_pattern_history (
  approval_id,
  founder_user_id,
  platform,
  pattern_fingerprint,
  bound_at
)
select
  reservations.approval_id,
  reservations.founder_user_id,
  reservations.platform,
  reservations.pattern_fingerprint,
  reservations.reserved_at
from public.founder_content_active_editorial_pattern_reservations as reservations
on conflict (approval_id) do nothing;

create or replace function public.capture_founder_content_approval_editorial_pattern_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  existing public.founder_content_approval_editorial_pattern_history%rowtype;
begin
  select *
    into existing
    from public.founder_content_approval_editorial_pattern_history as history
   where history.approval_id = new.approval_id;

  if found then
    if existing.founder_user_id <> new.founder_user_id
      or existing.platform <> new.platform
      or existing.pattern_fingerprint <> new.pattern_fingerprint then
      raise exception 'FOUNDER_CONTENT_APPROVAL_PATTERN_HISTORY_CONFLICT';
    end if;
    return new;
  end if;

  insert into public.founder_content_approval_editorial_pattern_history (
    approval_id,
    founder_user_id,
    platform,
    pattern_fingerprint,
    bound_at
  ) values (
    new.approval_id,
    new.founder_user_id,
    new.platform,
    new.pattern_fingerprint,
    new.reserved_at
  );

  return new;
end;
$function$;

revoke all on function public.capture_founder_content_approval_editorial_pattern_history() from public;
revoke all on function public.capture_founder_content_approval_editorial_pattern_history() from anon;
revoke all on function public.capture_founder_content_approval_editorial_pattern_history() from authenticated;
revoke all on function public.capture_founder_content_approval_editorial_pattern_history() from service_role;

-- The trigger executes inside the same transaction as the active reservation
-- mutation. If immutable identity conflicts, approval issuance fails closed.
drop trigger if exists capture_founder_content_approval_editorial_pattern_history
  on public.founder_content_active_editorial_pattern_reservations;
create trigger capture_founder_content_approval_editorial_pattern_history
after insert or update of approval_id, founder_user_id, platform, pattern_fingerprint
on public.founder_content_active_editorial_pattern_reservations
for each row
execute function public.capture_founder_content_approval_editorial_pattern_history();

comment on table public.founder_content_approval_editorial_pattern_history is
  'Immutable fingerprint-only history linking each founder-content approval to the PromptOS thesis/hook pattern serialized at issuance. Used to retain provider-verified publication memory without persisting raw thesis, hook, or copy.';

comment on function public.capture_founder_content_approval_editorial_pattern_history() is
  'Copies each serialized active approval-pattern binding into immutable history in the same transaction. Conflicting reuse of an approval id fails closed.';

commit;
