-- =============================================================================
-- Merge-intent deny-only execution veto
--
-- merge_intents is NOT approval authority. It can never make a merge eligible.
-- It can, however, preserve observed historical drift by refusing the existing
-- approval_executions reservation until an explicit new approval revision
-- refreshes the intent. The guarded /execute path must still pass every proof,
-- evidence, review, provider-identity, diff, and exact-head gate afterwards.
-- =============================================================================

begin;

create or replace function enforce_fcr_merge_intent_execution_veto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repository text;
  v_state text;
  v_proof_expires_at timestamptz;
begin
  if new.action_type <> 'merge' or new.mission_id is null then
    return new;
  end if;

  select lower(coalesce(p.repo_identifier, ''))
    into v_repository
    from missions m
    join projects p on p.id = m.project_id
   where m.id = new.mission_id;

  if v_repository <> 'jussray/founder-control-room' then
    return new;
  end if;

  -- Lock the current approval projection for the duration of the reservation
  -- insert. A concurrent reconciler cannot overwrite it between veto and the
  -- AFTER INSERT lifecycle projection.
  select state, proof_expires_at
    into v_state, v_proof_expires_at
    from merge_intents
   where mission_id = new.mission_id
   for update;

  if v_state is null then
    raise exception
      'FCR merge execution vetoed: approved mission has no durable merge intent';
  end if;

  if v_state not in ('waiting', 'ready') then
    raise exception
      'FCR merge execution vetoed: merge intent state % requires explicit reapproval/reconciliation',
      v_state;
  end if;

  if v_proof_expires_at is null or v_proof_expires_at <= now() then
    raise exception
      'FCR merge execution vetoed: merge intent founder proof lease expired';
  end if;

  return new;
end;
$$;

revoke all on function enforce_fcr_merge_intent_execution_veto() from public;

drop trigger if exists approval_executions_fcr_merge_intent_veto on approval_executions;
create trigger approval_executions_fcr_merge_intent_veto
  before insert on approval_executions
  for each row
  when (new.action_type = 'merge')
  execute function enforce_fcr_merge_intent_execution_veto();

-- Tighten the lifecycle projector installed in 20260819093000. A failed
-- execution may only rewrite the intent that this execution itself moved to
-- EXECUTING. It must never erase a sticky stale/needs-review/cancelled state.
create or replace function project_merge_intent_execution_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merge_sha text;
begin
  if new.action_type <> 'merge' or new.mission_id is null then
    return new;
  end if;

  if new.status = 'pending' then
    update merge_intents
       set state = 'executing',
           execution_id = new.id,
           stale_reason = null,
           updated_at = now()
     where mission_id = new.mission_id
       and state in ('waiting', 'ready');
    return new;
  end if;

  if new.status = 'succeeded' then
    v_merge_sha := lower(coalesce(new.result ->> 'mergeCommitSha', ''));
    update merge_intents
       set state = 'merged',
           execution_id = new.id,
           merge_commit_sha = case when v_merge_sha ~ '^[0-9a-f]{40}$' then v_merge_sha else merge_commit_sha end,
           stale_reason = null,
           last_reconciled_at = now(),
           updated_at = now()
     where mission_id = new.mission_id
       and (execution_id = new.id or state = 'merged');
    return new;
  end if;

  if new.status = 'failed' then
    update merge_intents
       set state = 'blocked',
           stale_reason = 'guarded merge execution failed; re-reconcile before any new approval',
           failure_count = failure_count + 1,
           last_reconciled_at = now(),
           updated_at = now()
     where mission_id = new.mission_id
       and execution_id = new.id
       and state = 'executing';
  end if;

  return new;
end;
$$;

revoke all on function project_merge_intent_execution_lifecycle() from public;

commit;
