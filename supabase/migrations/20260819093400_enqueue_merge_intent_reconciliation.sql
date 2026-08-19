-- =============================================================================
-- Immediate merge-intent reconciliation enqueue
--
-- The two-minute scheduler is a safety sweep, not the primary wake-up path.
-- Creating or refreshing an approved merge intent appends durable work to the
-- existing controller_outbox in the SAME transaction as the approval change.
-- =============================================================================

begin;

create or replace function enqueue_merge_intent_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into controller_outbox (
    project_id,
    controller,
    resource_id,
    reason,
    available_at
  ) values (
    new.project_id,
    'MergeIntentController',
    new.mission_id::text,
    'dependency_changed',
    now()
  );
  return new;
end;
$$;

revoke all on function enqueue_merge_intent_reconciliation() from public;

drop trigger if exists merge_intents_enqueue_on_insert on merge_intents;
create trigger merge_intents_enqueue_on_insert
  after insert on merge_intents
  for each row
  when (new.state = 'waiting')
  execute function enqueue_merge_intent_reconciliation();

-- A new approval changes the optimistic approval revision in the BEFORE UPDATE
-- revision guard. UPDATE OF revision would be wrong here because PostgreSQL
-- decides UPDATE-OF trigger eligibility from the original SET list, before a
-- BEFORE trigger changes NEW.revision. Use AFTER UPDATE + a revision predicate.
drop trigger if exists merge_intents_enqueue_on_reapproval on merge_intents;
create trigger merge_intents_enqueue_on_reapproval
  after update on merge_intents
  for each row
  when (new.state = 'waiting' and new.revision is distinct from old.revision)
  execute function enqueue_merge_intent_reconciliation();

-- The historical backfill ran before these enqueue triggers existed. Wake every
-- non-expired backfilled candidate once so immediate reconciliation, not the
-- two-minute sweep, is the primary path after migration installation.
insert into controller_outbox (
  project_id,
  controller,
  resource_id,
  reason,
  available_at
)
select
  project_id,
  'MergeIntentController',
  mission_id::text,
  'startup',
  now()
from merge_intents
where state = 'waiting';

comment on function enqueue_merge_intent_reconciliation() is
  'Durably wakes the existing reconciler after merge-intent approval/reapproval. Does not execute or authorize merge.';

commit;
