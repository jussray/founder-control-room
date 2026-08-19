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
-- revision guard. That exact revision refresh gets its own append-only work row.
drop trigger if exists merge_intents_enqueue_on_reapproval on merge_intents;
create trigger merge_intents_enqueue_on_reapproval
  after update of revision on merge_intents
  for each row
  when (new.state = 'waiting' and new.revision is distinct from old.revision)
  execute function enqueue_merge_intent_reconciliation();

comment on function enqueue_merge_intent_reconciliation() is
  'Durably wakes the existing reconciler after merge-intent approval/reapproval. Does not execute or authorize merge.';

commit;
