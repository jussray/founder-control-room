-- Forward-only authority-integrity guard for durable founder permission rows.
--
-- The canonical request hash already binds the request contract, request id,
-- originating surface, proposal, action target, and note. The canonical decision
-- hash already binds that request hash to the explicit founder decision. This
-- trigger makes those persisted identities load-bearing at the database boundary
-- so service-role writes cannot rewrite an approved authority record between
-- application validation and one-shot consumption.
--
-- Consumption and revocation remain the only intended post-decision lifecycle
-- mutations. This migration is source-only until separately authorized/applied.

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

  return new;
end;
$$;

revoke execute on function public.enforce_founder_permission_identity_immutability()
  from public, anon, authenticated;

drop trigger if exists founder_permission_identity_immutability
  on public.founder_permission_requests;

create trigger founder_permission_identity_immutability
before update on public.founder_permission_requests
for each row
execute function public.enforce_founder_permission_identity_immutability();

comment on function public.enforce_founder_permission_identity_immutability() is
  'Fails closed if durable founder request identity changes, or if canonical decision identity/provenance/time changes after leaving pending. Consumption and revocation lifecycle fields remain mutable.';
