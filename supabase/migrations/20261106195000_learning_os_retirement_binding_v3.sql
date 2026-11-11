-- Learning OS v3: no synthetic 'approved' row can retire knowledge.
-- This successor does not mutate FCR's existing permission broker history.
create or replace function public.learning_transition_guard() returns trigger
language plpgsql security invoker set search_path = public
as $$
declare v_permission record;
begin
  if (new.outcome_id,new.origin_execution_id,new.origin_mission_id,new.origin_project_id,new.origin_head_sha,new.domain,
      new.outcome_summary,new.observed_by,new.expires_at,new.created_at)
     is distinct from
     (old.outcome_id,old.origin_execution_id,old.origin_mission_id,old.origin_project_id,old.origin_head_sha,old.domain,
      old.outcome_summary,old.observed_by,old.expires_at,old.created_at) then
    raise exception 'LEARNING_IMMUTABLE_IDENTITY';
  end if;
  if new.state = old.state then
    if new.retirement_approval_id is distinct from old.retirement_approval_id then
      raise exception 'LEARNING_RETIREMENT_APPROVAL_ONLY_DURING_TRANSITION';
    end if;
    return new;
  end if;
  if not (
    (old.state='OUTCOME_RECORDED' and new.state='SIGNAL_EXTRACTED') or
    (old.state='SIGNAL_EXTRACTED' and new.state='INTERPRETED') or
    (old.state='INTERPRETED' and new.state='RETAINED') or
    (old.state='RETAINED' and new.state='APPLIED') or
    (old.state='APPLIED' and new.state='REVISED') or
    (old.state <> 'RETIRED' and new.state='RETIRED')
  ) then
    raise exception 'LEARNING_INVALID_TRANSITION % -> %',old.state,new.state;
  end if;
  if new.state='SIGNAL_EXTRACTED' and not exists(select 1 from public.learning_signals where learning_id=new.id) then
    raise exception 'LEARNING_SIGNAL_PROOF_REQUIRED';
  end if;
  if new.state='INTERPRETED' and not exists(select 1 from public.learning_interpretations where learning_id=new.id) then
    raise exception 'LEARNING_INTERPRETATION_REQUIRED';
  end if;
  if new.state='APPLIED' and not exists(select 1 from public.learning_applications where learning_id=new.id) then
    raise exception 'LEARNING_APPLICATION_RECEIPT_REQUIRED';
  end if;
  if new.state='REVISED' and not exists(
    select 1 from public.learning_applications a join public.learning_application_reviews v on v.application_id=a.id
    where a.learning_id=new.id
  ) then
    raise exception 'LEARNING_APPLICATION_OUTCOME_REQUIRED';
  end if;
  if new.state='RETIRED' then
    -- Use the existing FCR broker. The exact lesson+head decision is consumed
    -- in this same database transaction, preventing replay or stale approvals.
    update public.founder_permission_requests p
       set consumed_at=now()
     where p.id=new.retirement_approval_id
       and p.request_contract='juss-v10/founder-permission-request@v1'
       and p.status='approved' and p.decision_surface='fcr'
       and p.decision->>'decision'='approved'
       and p.decision->>'founderExplicit'='true'
       and p.founder_user_id is not null
       and p.revoked_at is null and p.consumed_at is null
       and p.decided_at is not null and p.decided_at<=now()
       and p.decided_at>now()-interval '20 minutes'
       and p.expires_at>now() and p.expires_at<=p.decided_at+interval '20 minutes'
       and p.proposal->>'actionType'='retire_learning'
       and p.proposal->>'projectSlug'=(select slug from public.projects where id=old.origin_project_id)
       and p.proposal->>'expectedHeadSha'=old.origin_head_sha
       and p.action_target->>'type'='learning_retirement'
       and p.action_target->>'learningId'=new.id::text
       and p.action_target->>'originHeadSha'=old.origin_head_sha
    returning p.* into v_permission;
    if v_permission.id is null then raise exception 'LEARNING_FOUNDER_RETIREMENT_APPROVAL_REQUIRED'; end if;
  elsif new.retirement_approval_id is distinct from old.retirement_approval_id then
    raise exception 'LEARNING_RETIREMENT_APPROVAL_ONLY_FOR_RETIREMENT';
  end if;
  new.updated_at=now();
  return new;
end $$;
revoke all on function public.learning_transition_guard() from public,anon,authenticated;
