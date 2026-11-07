-- Repository verification may propose repairs, but it never receives ambient
-- authority to spend money or execute later repository/runtime actions.

create or replace function public.enforce_repository_repair_mission_policy()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb := coalesce(new.policy_snapshot, '{}'::jsonb);
  v_approvals jsonb := coalesce(v_snapshot->'approvals_required', '[]'::jsonb);
  v_forbidden jsonb := coalesce(v_snapshot->'forbidden', '[]'::jsonb);
  v_required_approval text;
  v_forbidden_action text;
begin
  if v_snapshot->>'source' <> 'repository_verification' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status <> 'proposed' then
    raise exception 'repository_verification_mission_must_start_proposed'
      using errcode = '42501';
  end if;

  if jsonb_typeof(v_approvals) <> 'array' then
    v_approvals := '[]'::jsonb;
  end if;
  if jsonb_typeof(v_forbidden) <> 'array' then
    v_forbidden := '[]'::jsonb;
  end if;

  foreach v_required_approval in array array[
    'approve_mission_scope',
    'approve_any_paid_commitment',
    'create_sandbox_workspace',
    'create_branch',
    'commit_patch',
    'integrate',
    'deploy',
    'rollback',
    'secret_access',
    'destructive_action'
  ]
  loop
    if not (v_approvals @> jsonb_build_array(v_required_approval)) then
      v_approvals := v_approvals || jsonb_build_array(v_required_approval);
    end if;
  end loop;

  foreach v_forbidden_action in array array[
    'automatic_billing_change',
    'automatic_paid_purchase',
    'automatic_secret_access',
    'automatic_merge',
    'automatic_deployment',
    'automatic_rollback',
    'automatic_destructive_action'
  ]
  loop
    if not (v_forbidden @> jsonb_build_array(v_forbidden_action)) then
      v_forbidden := v_forbidden || jsonb_build_array(v_forbidden_action);
    end if;
  end loop;

  new.policy_snapshot := v_snapshot || jsonb_build_object(
    'authority', 'proposal_only',
    'founder_constraints', jsonb_build_object(
      'monthly_budget', 0,
      'approval_threshold', 0,
      'prefer_free', true,
      'recurring_cost_requires_approval', true
    ),
    'approvals_required', v_approvals,
    'forbidden', v_forbidden
  );

  return new;
end;
$$;

revoke all on function public.enforce_repository_repair_mission_policy() from public;
revoke all on function public.enforce_repository_repair_mission_policy() from anon;
revoke all on function public.enforce_repository_repair_mission_policy() from authenticated;

comment on function public.enforce_repository_repair_mission_policy() is
  'Forces repository-verification missions to start proposed and retain zero-budget, free-first, separately approved execution boundaries.';

drop trigger if exists enforce_repository_repair_mission_policy
  on public.missions;

create trigger enforce_repository_repair_mission_policy
before insert or update of policy_snapshot, status
on public.missions
for each row
execute function public.enforce_repository_repair_mission_policy();

-- Normalize existing repository-verification missions through the same trigger.
update public.missions
set policy_snapshot = policy_snapshot
where policy_snapshot->>'source' = 'repository_verification';
