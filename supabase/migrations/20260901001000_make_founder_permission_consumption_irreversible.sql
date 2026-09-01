-- Forward-only monotonic-consumption hardening for durable founder permission rows.
--
-- Historical migration identity is intentionally untouched. This successor keeps
-- the existing request/decision immutability guard and makes one-shot consumption
-- irreversible at the database boundary: consumed_at may move from NULL to one
-- timestamp exactly once, but a consumed approval can never be cleared or moved
-- to a different timestamp by a later service-role/backend write.
--
-- Revocation remains a separately mutable lifecycle field. This migration is
-- source-only until separately authorized and applied.

create or replace function public.enforce_founder_permission_identity_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
     or new.request_id is distinct from old.request_id
     or new.request_contract is distinct from old.request_contract
     or new.requested_by_surface is distinct from old.requested_by_surface
     or new.request_hash is distinct from old.request_hash
     or new.proposal is distinct from old.proposal
     or new.action_target is distinct from old.action_target
     or new.note is distinct from old.note
     or new.requested_at is distinct from old.requested_at then
    raise exception 'founder permission request identity is immutable'
      using errcode = '23514';
  end if;

  if old.status <> 'pending' and (
       new.status is distinct from old.status
       or new.decision is distinct from old.decision
       or new.decision_hash is distinct from old.decision_hash
       or new.decision_surface is distinct from old.decision_surface
       or new.founder_user_id is distinct from old.founder_user_id
       or new.founder_email is distinct from old.founder_email
       or new.decided_at is distinct from old.decided_at
       or new.expires_at is distinct from old.expires_at
  ) then
    raise exception 'founder permission decision identity is immutable'
      using errcode = '23514';
  end if;

  if old.consumed_at is not null
     and new.consumed_at is distinct from old.consumed_at then
    raise exception 'founder permission consumption is irreversible'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_founder_permission_identity_immutability()
  from public, anon, authenticated;

comment on function public.enforce_founder_permission_identity_immutability() is
  'Fails closed if durable founder request or decided authority identity changes, and makes consumed_at monotonic after first consumption. Revocation remains independently mutable.';
