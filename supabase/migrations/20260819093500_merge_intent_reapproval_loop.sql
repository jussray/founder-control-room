-- =============================================================================
-- Close the merge-intent reapproval loop
--
-- Sticky liveness revocation must have a supported recovery path. FCR's founder
-- approval route only creates a fresh approval from mission.status=in_review.
-- Therefore a durable intent revocation returns an approved mission to review.
-- This is deny-only: it removes approval, never grants it.
-- =============================================================================

begin;

-- Replace the lifecycle projector from 20260819093000 so the intentional
-- approved -> in_review safety transition preserves the sticky revocation state
-- rather than relabeling it CANCELLED.
create or replace function project_merge_intent_mission_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent_state text;
begin
  if new.status = 'integrated' then
    update merge_intents
       set state = 'merged',
           stale_reason = null,
           last_reconciled_at = now(),
           updated_at = now()
     where mission_id = new.id;
    return new;
  end if;

  if old.status = 'approved' and new.status <> 'approved' then
    select state
      into v_intent_state
      from merge_intents
     where mission_id = new.id;

    -- This exact transition is the supported safety/reapproval loop. The intent
    -- has already recorded WHY approval was revoked and must keep that reason
    -- until a new founder approval refreshes it to WAITING with a new revision.
    if new.status = 'in_review'
       and v_intent_state in ('needs_review', 'stale', 'expired', 'blocked') then
      update merge_intents
         set last_reconciled_at = coalesce(last_reconciled_at, now()),
             updated_at = now()
       where mission_id = new.id;
      return new;
    end if;

    update merge_intents
       set state = 'cancelled',
           stale_reason = 'mission left approved state without integration',
           last_reconciled_at = now(),
           updated_at = now()
     where mission_id = new.id
       and state <> 'merged';
  end if;

  return new;
end;
$$;

revoke all on function project_merge_intent_mission_lifecycle() from public;

create or replace function return_revoked_fcr_merge_to_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state not in ('needs_review', 'stale', 'expired', 'blocked')
     or new.state is not distinct from old.state then
    return new;
  end if;

  update missions
     set status = 'in_review',
         updated_at = now()
   where id = new.mission_id
     and project_id = new.project_id
     and status = 'approved';

  return new;
end;
$$;

revoke all on function return_revoked_fcr_merge_to_review() from public;

drop trigger if exists merge_intents_return_revoked_to_review on merge_intents;
create trigger merge_intents_return_revoked_to_review
  after update of state on merge_intents
  for each row
  when (
    new.state in ('needs_review', 'stale', 'expired', 'blocked')
    and new.state is distinct from old.state
  )
  execute function return_revoked_fcr_merge_to_review();

comment on function return_revoked_fcr_merge_to_review() is
  'Deny-only recovery loop: observed merge-intent revocation returns approved FCR mission to in_review so explicit founder reapproval can create a new revision.';

commit;
