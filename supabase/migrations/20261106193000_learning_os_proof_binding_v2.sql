-- Forward-only Learning OS v2: a later verified outcome plus founder-controlled reuse.
-- Preserve v1 migration checksum and FCR as the only action authority.
alter table public.learning_applications
  add column target_outcome_id uuid references public.outcomes(id) on delete restrict,
  add column cross_domain_permission_id uuid references public.founder_permission_requests(id) on delete restrict;
create unique index learning_applications_permission_once_idx
  on public.learning_applications(cross_domain_permission_id)
  where cross_domain_permission_id is not null;

-- Supporting evidence uses typed foreign keys rather than unverified text IDs.
create table public.learning_evidence_refs (
  id uuid primary key default gen_random_uuid(),
  learning_id uuid not null references public.learning_records(id) on delete restrict,
  approval_execution_id uuid references public.approval_executions(id) on delete restrict,
  proof_gate_result_id uuid references public.proof_gate_results(id) on delete restrict,
  supporting_outcome_id uuid references public.outcomes(id) on delete restrict,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  check (num_nonnulls(approval_execution_id,proof_gate_result_id,supporting_outcome_id)=1)
);
create index learning_evidence_refs_learning_idx on public.learning_evidence_refs(learning_id);
create function public.learning_evidence_scope_guard() returns trigger
language plpgsql security invoker set search_path=public as $$
declare r public.learning_records;
begin
  select * into r from public.learning_records where id=new.learning_id;
  if r.id is null then raise exception 'LEARNING_EVIDENCE_SOURCE_MISSING'; end if;
  if new.approval_execution_id is not null and not exists (
    select 1 from public.approval_executions e where e.id=new.approval_execution_id
    and e.project_id=r.origin_project_id and e.mission_id=r.origin_mission_id
  ) then raise exception 'LEARNING_EVIDENCE_SCOPE_MISMATCH'; end if;
  if new.proof_gate_result_id is not null and not exists (
    select 1 from public.proof_gate_results p where p.id=new.proof_gate_result_id
    and p.project_id=r.origin_project_id and p.mission_id=r.origin_mission_id
  ) then raise exception 'LEARNING_EVIDENCE_SCOPE_MISMATCH'; end if;
  if new.supporting_outcome_id is not null and not exists (
    select 1 from public.outcomes o where o.id=new.supporting_outcome_id
    and o.project_id=r.origin_project_id and o.mission_id=r.origin_mission_id
  ) then raise exception 'LEARNING_EVIDENCE_SCOPE_MISMATCH'; end if;
  return new;
end $$;
create trigger learning_evidence_scope before insert on public.learning_evidence_refs
for each row execute function public.learning_evidence_scope_guard();

-- Direct application inserts cannot bypass evidence or cross-domain founder authority.
create function public.learning_application_guard() returns trigger
language plpgsql security invoker set search_path=public as $$
declare r public.learning_records; e public.approval_executions;
        o public.outcomes; v_permission uuid;
begin
  select * into r from public.learning_records where id=new.learning_id for update;
  select * into e from public.approval_executions where id=new.cited_by_execution_id;
  select * into o from public.outcomes where id=new.target_outcome_id;
  if r.id is null or r.state<>'RETAINED' or r.expires_at<=now()
    or e.id is null or o.id is null or e.mission_id=r.origin_mission_id
    or e.mission_id is distinct from new.cited_by_mission_id
    or e.project_id is distinct from o.project_id
    or e.mission_id is distinct from o.mission_id
    or e.expected_head_sha is distinct from new.target_head_sha
    or e.status<>'succeeded' or e.success is distinct from true
    or e.executed_at is null or o.observed_at is null or o.observed_at<e.executed_at
    or o.classification not in ('achieved','partial','failed')
    or nullif(btrim(o.verification_method),'') is null
    or jsonb_typeof(o.evidence) is distinct from 'array'
    or jsonb_array_length(o.evidence)=0
    or not exists(select 1 from public.learning_mission_domains d
      where d.mission_id=e.mission_id and d.project_id=e.project_id
      and d.domain=new.target_domain)
  then raise exception 'LEARNING_VERIFIED_DOWNSTREAM_OUTCOME_REQUIRED'; end if;

  if new.target_domain<>r.domain then
    if length(btrim(coalesce(new.cross_domain_reason,'')))<12 then
      raise exception 'LEARNING_CROSS_DOMAIN_REASON_REQUIRED';
    end if;
    update public.founder_permission_requests p
       set consumed_at=now()
     where p.id=new.cross_domain_permission_id
       and p.request_contract='juss-v10/founder-permission-request@v1'
       and p.status='approved' and p.decision_surface='fcr'
       and p.decision->>'decision'='approved'
       and p.decision->>'founderExplicit'='true'
       and p.founder_user_id is not null
       and p.revoked_at is null and p.consumed_at is null
       and p.decided_at is not null
       and p.decided_at<=now() and p.decided_at>now()-interval '20 minutes'
       and p.expires_at>now() and p.expires_at<=p.decided_at+interval '20 minutes'
       and p.proposal->>'actionType'='apply_learning_cross_domain'
       and p.proposal->>'projectSlug'=(select slug from public.projects where id=e.project_id)
       and p.proposal->>'expectedHeadSha'=new.target_head_sha
       and p.action_target->>'type'='learning_application'
       and p.action_target->>'learningId'=new.learning_id::text
       and p.action_target->>'targetMissionId'=new.cited_by_mission_id::text
       and p.action_target->>'targetOutcomeId'=new.target_outcome_id::text
       and p.action_target->>'targetHeadSha'=new.target_head_sha
       and p.action_target->>'targetDomain'=new.target_domain
       and p.action_target->>'crossDomainReason'=new.cross_domain_reason
    returning p.id into v_permission;
    if v_permission is null then
      raise exception 'LEARNING_CROSS_DOMAIN_FOUNDER_APPROVAL_REQUIRED';
    end if;
  elsif new.cross_domain_permission_id is not null or new.cross_domain_reason is not null then
    raise exception 'LEARNING_UNNECESSARY_CROSS_DOMAIN_AUTHORITY';
  end if;
  return new;
end $$;
create trigger learning_application_insert_guard before insert on public.learning_applications
for each row execute function public.learning_application_guard();

-- Atomic promotion: row lock + expected state, insert-trigger validation, UPDATE
-- all in one transaction, with a single winner for concurrent requests.
create function public.learning_apply_verified(
  p_learning_id uuid,p_expected_state text,p_execution_id uuid,
  p_outcome_id uuid,p_target_domain text,p_how_applied text,
  p_cross_domain_reason text default null,p_founder_permission_id uuid default null
) returns public.learning_records
language plpgsql security invoker set search_path=public as $$
declare r public.learning_records; e public.approval_executions;
begin
  select * into r from public.learning_records where id=p_learning_id for update;
  if r.id is null or r.state is distinct from p_expected_state
    or p_expected_state<>'RETAINED' then raise exception 'LEARNING_STALE_STATE'; end if;
  select * into e from public.approval_executions where id=p_execution_id;
  if e.id is null then raise exception 'LEARNING_EXECUTION_REQUIRED'; end if;
  insert into public.learning_applications(
    learning_id,cited_by_execution_id,cited_by_mission_id,target_head_sha,
    target_domain,cross_domain_reason,how_applied,target_outcome_id,cross_domain_permission_id
  ) values (
    p_learning_id,e.id,e.mission_id,e.expected_head_sha,p_target_domain,
    p_cross_domain_reason,p_how_applied,p_outcome_id,p_founder_permission_id
  );
  update public.learning_records set state='APPLIED'
  where id=p_learning_id and state='RETAINED' returning * into r;
  if r.id is null then raise exception 'LEARNING_LOST_PROMOTION_RACE'; end if;
  return r;
end $$;

alter table public.learning_evidence_refs enable row level security;
revoke all on table public.learning_evidence_refs from public,anon,authenticated;
grant select,insert on table public.learning_evidence_refs to service_role;
revoke all on function public.learning_evidence_scope_guard() from public,anon,authenticated;
revoke all on function public.learning_application_guard() from public,anon,authenticated;
revoke all on function public.learning_apply_verified(uuid,text,uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.learning_apply_verified(uuid,text,uuid,uuid,text,text,text,uuid) to service_role;
