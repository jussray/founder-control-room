-- =============================================================================
-- Durable merge-intent liveness projection
--
-- Safety and liveness are deliberately separate:
--   * missions + proof_gate_results remain approval authority;
--   * approval_executions remains the external-mutation/idempotency ledger;
--   * merge_intents is an enumerable projection so an approved FCR merge cannot
--     exist only as remembered intent between approval and execution.
--
-- This projection never authorizes provider mutation.
-- =============================================================================

begin;

create table if not exists merge_intents (
  id                       uuid primary key default gen_random_uuid(),
  mission_id               uuid not null unique references missions(id) on delete cascade,
  project_id               uuid not null references projects(id) on delete cascade,
  repository               text not null,
  pull_request_number      integer not null check (pull_request_number > 0),
  target_branch            text not null,
  source_branch            text not null,
  approved_base_sha        text not null check (approved_base_sha ~ '^[0-9a-f]{40}$'),
  approved_head_sha        text not null check (approved_head_sha ~ '^[0-9a-f]{40}$'),
  -- Deterministic provider-diff witness for the immutable approved base/head
  -- pair. It is derived by MergeIntentController before REVALIDATED, because the
  -- database trigger intentionally performs no provider/network reads.
  approved_diff_hash       text check (approved_diff_hash is null or approved_diff_hash ~ '^[0-9a-f]{64}$'),
  approval_proof_id        uuid not null references proof_gate_results(id) on delete restrict,
  approved_by              text not null,
  approved_author_identity text not null,
  review_policy_hash       text not null check (review_policy_hash ~ '^[0-9a-f]{64}$'),
  proof_expires_at         timestamptz not null,
  state                    text not null default 'waiting'
    check (state in (
      'waiting',
      'ready',
      'stale',
      'needs_review',
      'executing',
      'merged',
      'cancelled',
      'expired',
      'blocked'
    )),
  stale_reason             text,
  last_observed_base_sha   text check (last_observed_base_sha is null or last_observed_base_sha ~ '^[0-9a-f]{40}$'),
  last_observed_head_sha   text check (last_observed_head_sha is null or last_observed_head_sha ~ '^[0-9a-f]{40}$'),
  last_observed_diff_hash  text check (last_observed_diff_hash is null or last_observed_diff_hash ~ '^[0-9a-f]{64}$'),
  execution_id             uuid references approval_executions(id) on delete set null,
  merge_commit_sha         text check (merge_commit_sha is null or merge_commit_sha ~ '^[0-9a-f]{40}$'),
  failure_count            integer not null default 0 check (failure_count >= 0),
  last_reconciled_at       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_merge_intents_state
  on merge_intents (state, updated_at desc);

create index if not exists idx_merge_intents_project_state
  on merge_intents (project_id, state, updated_at desc);

alter table merge_intents enable row level security;
drop policy if exists "merge_intents_service_role_only" on merge_intents;
create policy "merge_intents_service_role_only" on merge_intents
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table merge_intents from anon, authenticated;
grant select, insert, update, delete on table merge_intents to service_role;

comment on table merge_intents is
  'Enumerable merge liveness/audit projection. Never approval or provider-mutation authority.';
comment on column merge_intents.approved_diff_hash is
  'Canonical provider diff hash derived from the immutable approved base/head pair before REVALIDATED; nullable only while waiting for first reconciliation.';
comment on column merge_intents.state is
  'Projection state only. READY does not authorize merge execution.';

-- -----------------------------------------------------------------------------
-- Approval transition -> durable intent in the SAME database transaction.
--
-- FCR already pins provider-backed PR/base/head/author/review-policy identity in
-- missions.policy_snapshot before changing in_review -> approved. This trigger
-- converts those pinned facts plus one concrete fresh passing merge proof into
-- durable liveness state. Any missing fact aborts the approval update, so an
-- approved FCR mission cannot commit without an intent row.
-- -----------------------------------------------------------------------------
create or replace function project_fcr_merge_intent_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repository text;
  v_review jsonb;
  v_proof record;
  v_head_sha text;
  v_base_sha text;
  v_policy_hash text;
  v_author text;
  v_pr_number integer;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  select lower(coalesce(repo_identifier, ''))
    into v_repository
    from projects
   where id = new.project_id;

  -- This first liveness membrane is intentionally exact to FCR, where the
  -- approval route already has immutable provider PR context. Other projects
  -- keep their existing behavior until they expose an equally exact approval
  -- projection rather than receiving guessed metadata here.
  if v_repository <> 'jussray/founder-control-room' then
    return new;
  end if;

  v_review := coalesce(new.policy_snapshot -> 'independentReview', '{}'::jsonb);
  v_head_sha := lower(coalesce(new.policy_snapshot ->> 'expectedHeadSha', ''));
  v_base_sha := lower(coalesce(v_review ->> 'baseSha', ''));
  v_policy_hash := lower(coalesce(v_review ->> 'policyHash', ''));
  v_author := btrim(coalesce(v_review ->> 'authorIdentity', ''));

  begin
    v_pr_number := (v_review ->> 'pullRequestNumber')::integer;
  exception when others then
    raise exception 'FCR merge approval cannot persist merge intent: invalid pull request number';
  end;

  if v_pr_number is null or v_pr_number <= 0
     or v_head_sha !~ '^[0-9a-f]{40}$'
     or v_base_sha !~ '^[0-9a-f]{40}$'
     or v_policy_hash !~ '^[0-9a-f]{64}$'
     or v_author = ''
     or coalesce(new.branch_ref, '') = '' then
    raise exception 'FCR merge approval cannot persist merge intent: exact provider approval identity is incomplete';
  end if;

  select id, approved_by, ran_at
    into v_proof
    from proof_gate_results
   where mission_id = new.id
     and project_id = new.project_id
     and gate_id = 'merge'
     and status = 'pass'
     and coalesce(btrim(approved_by), '') <> ''
   order by ran_at desc, id desc
   limit 1;

  if v_proof.id is null then
    raise exception 'FCR merge approval cannot persist merge intent: passing founder proof is missing';
  end if;

  if v_proof.ran_at < now() - interval '15 minutes' then
    raise exception 'FCR merge approval cannot persist merge intent: passing founder proof is stale';
  end if;

  insert into merge_intents (
    mission_id,
    project_id,
    repository,
    pull_request_number,
    target_branch,
    source_branch,
    approved_base_sha,
    approved_head_sha,
    approved_diff_hash,
    approval_proof_id,
    approved_by,
    approved_author_identity,
    review_policy_hash,
    proof_expires_at,
    state,
    stale_reason,
    last_observed_base_sha,
    last_observed_head_sha,
    last_observed_diff_hash,
    execution_id,
    merge_commit_sha,
    failure_count,
    last_reconciled_at,
    updated_at
  ) values (
    new.id,
    new.project_id,
    v_repository,
    v_pr_number,
    coalesce(nullif(new.base_ref, ''), 'main'),
    new.branch_ref,
    v_base_sha,
    v_head_sha,
    null,
    v_proof.id,
    v_proof.approved_by,
    v_author,
    v_policy_hash,
    v_proof.ran_at + interval '15 minutes',
    'waiting',
    null,
    null,
    null,
    null,
    null,
    null,
    0,
    null,
    now()
  )
  on conflict (mission_id) do update set
    project_id = excluded.project_id,
    repository = excluded.repository,
    pull_request_number = excluded.pull_request_number,
    target_branch = excluded.target_branch,
    source_branch = excluded.source_branch,
    approved_base_sha = excluded.approved_base_sha,
    approved_head_sha = excluded.approved_head_sha,
    approved_diff_hash = null,
    approval_proof_id = excluded.approval_proof_id,
    approved_by = excluded.approved_by,
    approved_author_identity = excluded.approved_author_identity,
    review_policy_hash = excluded.review_policy_hash,
    proof_expires_at = excluded.proof_expires_at,
    state = 'waiting',
    stale_reason = null,
    last_observed_base_sha = null,
    last_observed_head_sha = null,
    last_observed_diff_hash = null,
    execution_id = null,
    merge_commit_sha = null,
    failure_count = 0,
    last_reconciled_at = null,
    updated_at = now();

  return new;
end;
$$;

revoke all on function project_fcr_merge_intent_on_approval() from public;

drop trigger if exists missions_project_merge_intent_on_approval on missions;
create trigger missions_project_merge_intent_on_approval
  after update of status on missions
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function project_fcr_merge_intent_on_approval();

-- -----------------------------------------------------------------------------
-- Existing execution ledger -> intent lifecycle projection.
--
-- These triggers observe approval_executions; they do not create execution
-- authority. The guarded /execute route remains the only path that reserves and
-- performs the provider action.
-- -----------------------------------------------------------------------------
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
       and state not in ('merged', 'cancelled');
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
     where mission_id = new.mission_id;
    return new;
  end if;

  if new.status = 'failed' then
    update merge_intents
       set state = 'blocked',
           execution_id = new.id,
           stale_reason = 'guarded merge execution failed; re-reconcile before any new approval',
           failure_count = failure_count + 1,
           last_reconciled_at = now(),
           updated_at = now()
     where mission_id = new.mission_id
       and state <> 'merged';
  end if;

  return new;
end;
$$;

revoke all on function project_merge_intent_execution_lifecycle() from public;

drop trigger if exists approval_executions_project_merge_intent_insert on approval_executions;
create trigger approval_executions_project_merge_intent_insert
  after insert on approval_executions
  for each row
  when (new.action_type = 'merge')
  execute function project_merge_intent_execution_lifecycle();

drop trigger if exists approval_executions_project_merge_intent_update on approval_executions;
create trigger approval_executions_project_merge_intent_update
  after update of status on approval_executions
  for each row
  when (new.action_type = 'merge' and new.status is distinct from old.status)
  execute function project_merge_intent_execution_lifecycle();

-- Mission-side completion/cancellation is a final projection safety net.
create or replace function project_merge_intent_mission_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'integrated' then
    update merge_intents
       set state = 'merged',
           stale_reason = null,
           last_reconciled_at = now(),
           updated_at = now()
     where mission_id = new.id;
  elsif old.status = 'approved' and new.status <> 'approved' then
    update merge_intents
       set state = case when new.status = 'integrated' then 'merged' else 'cancelled' end,
           stale_reason = case when new.status = 'integrated' then null else 'mission left approved state without integration' end,
           last_reconciled_at = now(),
           updated_at = now()
     where mission_id = new.id
       and state <> 'merged';
  end if;
  return new;
end;
$$;

revoke all on function project_merge_intent_mission_lifecycle() from public;

drop trigger if exists missions_project_merge_intent_lifecycle on missions;
create trigger missions_project_merge_intent_lifecycle
  after update of status on missions
  for each row
  when (old.status is distinct from new.status)
  execute function project_merge_intent_mission_lifecycle();

commit;
