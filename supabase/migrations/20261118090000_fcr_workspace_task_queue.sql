-- FCR native workspace task queue, candidate-only until workspace tenancy ships.
-- One tenant, one owner, one project, one explicit read-only grant per task.
-- Browser roles have no grants; all task reads/writes go through trusted FCR APIs.

create unique index if not exists fcr_projects_id_workspace_uq
  on public.projects (id, workspace_id);
create unique index if not exists fcr_founder_users_id_workspace_uq
  on public.founder_users (user_id, workspace_id);

create table if not exists public.fcr_workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  owner_user_id uuid not null,
  project_id uuid not null,
  capability_id text not null default 'public-web-observation-v1'
    check (capability_id = 'public-web-observation-v1'),
  operation text not null check (operation in ('search', 'fetch')),
  request_json jsonb not null check (jsonb_typeof(request_json) = 'object'
    and pg_column_size(request_json) <= 4096),
  cadence_minutes integer not null check (cadence_minutes between 60 and 10080),
  next_due_at timestamptz not null,
  state text not null default 'paused' check (state in ('paused', 'enabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fcr_task_owner_workspace_fk foreign key (owner_user_id, workspace_id)
    references public.founder_users(user_id, workspace_id) on delete restrict,
  constraint fcr_task_project_workspace_fk foreign key (project_id, workspace_id)
    references public.projects(id, workspace_id) on delete restrict,
  constraint fcr_task_identity_uq unique (id, workspace_id, owner_user_id, capability_id)
);

create index if not exists fcr_tasks_due_idx
  on public.fcr_workspace_tasks (next_due_at, id) where state = 'enabled';
create index if not exists fcr_tasks_owner_idx
  on public.fcr_workspace_tasks (workspace_id, owner_user_id, id);

create table if not exists public.fcr_workspace_task_grants (
  task_id uuid primary key,
  workspace_id uuid not null,
  owner_user_id uuid not null,
  capability_id text not null check (capability_id = 'public-web-observation-v1'),
  scope text not null default 'READ' check (scope = 'READ'),
  state text not null default 'revoked' check (state in ('active', 'revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint fcr_task_grant_exact_owner_fk foreign key
    (task_id, workspace_id, owner_user_id, capability_id)
    references public.fcr_workspace_tasks
      (id, workspace_id, owner_user_id, capability_id) on delete restrict
);

create table if not exists public.fcr_workspace_task_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.fcr_workspace_tasks(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  owner_user_id uuid not null,
  scheduled_for timestamptz not null,
  claimed_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > claimed_at),
  state text not null default 'claimed'
    check (state in ('claimed', 'provider_observed_unverified', 'blocked', 'unknown')),
  observed_at timestamptz,
  evidence_fingerprint text check (
    evidence_fingerprint is null or evidence_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  provider_receipt_id text check (
    provider_receipt_id is null or char_length(provider_receipt_id) between 1 and 160
  ),
  result_count integer check (result_count is null or result_count between 0 and 100),
  constraint fcr_task_run_one_per_due unique (task_id, scheduled_for),
  constraint fcr_task_run_claim_owner_fk foreign key (task_id, workspace_id, owner_user_id)
    references public.fcr_workspace_tasks(id, workspace_id, owner_user_id)
    on delete restrict
);
-- The run FK has a narrower exact-owner key than the grant's capability key.
create unique index if not exists fcr_tasks_run_owner_fk_idx
  on public.fcr_workspace_tasks (id, workspace_id, owner_user_id);

create index if not exists fcr_workspace_runs_owner_idx
  on public.fcr_workspace_task_runs (workspace_id, owner_user_id, claimed_at desc);

alter table public.fcr_workspace_tasks enable row level security;
alter table public.fcr_workspace_task_grants enable row level security;
alter table public.fcr_workspace_task_runs enable row level security;

revoke all on public.fcr_workspace_tasks from public;
revoke all on public.fcr_workspace_task_grants from public;
revoke all on public.fcr_workspace_task_runs from public;
-- No anon/authenticated policy or grant is created; browser access is denied.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.fcr_workspace_tasks, public.fcr_workspace_task_grants, public.fcr_workspace_task_runs from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.fcr_workspace_tasks, public.fcr_workspace_task_grants, public.fcr_workspace_task_runs from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert on public.fcr_workspace_tasks, public.fcr_workspace_task_grants, public.fcr_workspace_task_runs to service_role';
    execute 'grant update (state, next_due_at, updated_at) on public.fcr_workspace_tasks to service_role';
    execute 'grant update (state, expires_at) on public.fcr_workspace_task_grants to service_role';
    execute 'grant update (state, observed_at, evidence_fingerprint, provider_receipt_id, result_count) on public.fcr_workspace_task_runs to service_role';
  end if;
end $$;

-- Only a trusted service-role backend may claim due tasks. The database, not
-- caller-supplied task data, checks the task owner, project and live grant.
create or replace function public.claim_due_fcr_workspace_tasks(p_limit integer default 5)
returns setof public.fcr_workspace_task_runs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task record;
  v_run public.fcr_workspace_task_runs%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'invalid task claim limit' using errcode = '22023';
  end if;

  for v_task in
    select t.*
    from public.fcr_workspace_tasks t
    join public.fcr_workspace_task_grants g
      on g.task_id = t.id and g.workspace_id = t.workspace_id
      and g.owner_user_id = t.owner_user_id
      and g.capability_id = t.capability_id
    join public.founder_users fu
      on fu.user_id = t.owner_user_id and fu.workspace_id = t.workspace_id
      and fu.account_role in ('platform_owner', 'workspace_owner')
    join public.projects p
      on p.id = t.project_id and p.workspace_id = t.workspace_id
    where t.state = 'enabled' and t.next_due_at <= v_now
      and t.capability_id = 'public-web-observation-v1'
      and g.scope = 'READ' and g.state = 'active' and g.expires_at > v_now
    order by t.next_due_at, t.id
    for update of t skip locked
    limit p_limit
  loop
    insert into public.fcr_workspace_task_runs (
      task_id, workspace_id, owner_user_id, scheduled_for,
      claimed_at, expires_at, state
    ) values (
      v_task.id, v_task.workspace_id, v_task.owner_user_id, v_task.next_due_at,
      v_now, v_now + interval '5 minutes', 'claimed'
    )
    on conflict (task_id, scheduled_for) do nothing
    returning * into v_run;

    if found then
      update public.fcr_workspace_tasks
      set next_due_at = greatest(v_now, v_task.next_due_at)
          + v_task.cadence_minutes * interval '1 minute',
          updated_at = v_now
      where id = v_task.id;
      return next v_run;
    end if;
  end loop;
end;
$$;

-- A run receipt records provider observation, NOT independently verified truth.
-- A second completion or late lease can never become a fresh success.
create or replace function public.complete_fcr_workspace_task_run(
  p_run_id uuid,
  p_state text,
  p_evidence_fingerprint text default null,
  p_provider_receipt_id text default null,
  p_result_count integer default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_state not in ('provider_observed_unverified', 'blocked', 'unknown') then
    raise exception 'invalid task result state' using errcode = '22023';
  end if;
  if p_state = 'provider_observed_unverified'
     and (p_evidence_fingerprint is null or p_provider_receipt_id is null
          or p_result_count is null) then
    raise exception 'provider observation needs real receipt fields'
      using errcode = '22023';
  end if;

  update public.fcr_workspace_task_runs
  set state = p_state, observed_at = clock_timestamp(),
      evidence_fingerprint = p_evidence_fingerprint,
      provider_receipt_id = p_provider_receipt_id,
      result_count = p_result_count
  where id = p_run_id and state = 'claimed' and expires_at > clock_timestamp();
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.claim_due_fcr_workspace_tasks(integer) from public;
revoke all on function public.complete_fcr_workspace_task_run(uuid,text,text,text,integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.claim_due_fcr_workspace_tasks(integer) from anon';
    execute 'revoke all on function public.complete_fcr_workspace_task_run(uuid,text,text,text,integer) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.claim_due_fcr_workspace_tasks(integer) from authenticated';
    execute 'revoke all on function public.complete_fcr_workspace_task_run(uuid,text,text,text,integer) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.claim_due_fcr_workspace_tasks(integer) to service_role';
    execute 'grant execute on function public.complete_fcr_workspace_task_run(uuid,text,text,text,integer) to service_role';
  end if;
end $$;
