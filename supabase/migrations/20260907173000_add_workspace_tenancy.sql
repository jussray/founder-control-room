-- Founder Control Room workspace tenancy v1
--
-- Purpose:
--   Introduce an ownership envelope around the existing project graph before
--   public signup is ever enabled. The existing founder allowlist remains the
--   outer access gate. This migration does NOT make FCR self-service.
--
-- Compatibility:
--   All existing projects are assigned to one seeded legacy workspace and all
--   existing founder_users become owners of that workspace. This preserves the
--   current single-Control-Room behavior while making project access scoping
--   explicit and testable.

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  auth_user_id uuid,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, email),
  check (email = lower(email))
);

create index if not exists workspace_members_email_idx
  on workspace_members (email)
  where status = 'active';
create unique index if not exists workspace_members_auth_user_idx
  on workspace_members (workspace_id, auth_user_id)
  where auth_user_id is not null;

insert into workspaces (slug, name)
values ('juss-founder-control-room', 'Juss Founder Control Room')
on conflict (slug) do nothing;

insert into workspace_members (workspace_id, email, role, status)
select w.id, lower(fu.email), 'owner', 'active'
from workspaces w
cross join founder_users fu
where w.slug = 'juss-founder-control-room'
on conflict (workspace_id, email) do update
set role = excluded.role,
    status = excluded.status,
    updated_at = now();

alter table projects
  add column if not exists workspace_id uuid references workspaces(id) on delete restrict;

update projects p
set workspace_id = w.id
from workspaces w
where p.workspace_id is null
  and w.slug = 'juss-founder-control-room';

alter table projects alter column workspace_id set not null;

alter table projects drop constraint if exists projects_slug_key;
create unique index if not exists projects_workspace_slug_key
  on projects (workspace_id, slug);
create index if not exists projects_workspace_id_idx
  on projects (workspace_id);

-- Keep the current private-founder gate AND require workspace membership.
-- When self-service is deliberately enabled later, the founder allowlist can
-- be replaced at the auth edge without weakening this tenant check.
create or replace function has_workspace_access(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_founder()
    and exists (
      select 1
      from workspace_members wm
      where wm.workspace_id = target_workspace_id
        and wm.status = 'active'
        and (
          wm.email = lower(coalesce(auth.jwt() ->> 'email', ''))
          or (wm.auth_user_id is not null and wm.auth_user_id = auth.uid())
        )
    );
$$;

revoke all on function has_workspace_access(uuid) from public, anon;
grant execute on function has_workspace_access(uuid) to authenticated, service_role;

alter table workspaces enable row level security;
alter table workspace_members enable row level security;

create policy workspace_member_read on workspaces
for select using (has_workspace_access(id));

create policy workspace_member_read on workspace_members
for select using (has_workspace_access(workspace_id));

-- Replace broad founder-full-access on the project graph with membership-aware
-- policies. Service-role server code still bypasses RLS, so HTTP routes must
-- also scope queries explicitly by workspace_id.
drop policy if exists founder_full_access on projects;
drop policy if exists founder_full_access on project_connections;
drop policy if exists founder_full_access on project_events;
drop policy if exists founder_full_access on missions;
drop policy if exists founder_full_access on change_proposals;
drop policy if exists founder_full_access on approvals;
drop policy if exists founder_full_access on agent_runs;
drop policy if exists founder_full_access on council_conversations;
drop policy if exists founder_full_access on agent_costs;
drop policy if exists founder_full_access on releases;
drop policy if exists founder_full_access on issue_summaries;

create policy workspace_access on projects
for all
using (has_workspace_access(workspace_id))
with check (has_workspace_access(workspace_id));

create policy workspace_access on project_connections
for all
using (exists (
  select 1 from projects p
  where p.id = project_connections.project_id
    and has_workspace_access(p.workspace_id)
))
with check (exists (
  select 1 from projects p
  where p.id = project_connections.project_id
    and has_workspace_access(p.workspace_id)
));

create policy workspace_access on project_events
for all
using (exists (
  select 1 from projects p
  where p.id = project_events.project_id
    and has_workspace_access(p.workspace_id)
))
with check (exists (
  select 1 from projects p
  where p.id = project_events.project_id
    and has_workspace_access(p.workspace_id)
));

create policy workspace_access on missions
for all
using (exists (
  select 1 from projects p
  where p.id = missions.project_id
    and has_workspace_access(p.workspace_id)
))
with check (exists (
  select 1 from projects p
  where p.id = missions.project_id
    and has_workspace_access(p.workspace_id)
));

create policy workspace_access on change_proposals
for all
using (exists (
  select 1 from projects p
  where p.id = change_proposals.project_id
    and has_workspace_access(p.workspace_id)
))
with check (exists (
  select 1 from projects p
  where p.id = change_proposals.project_id
    and has_workspace_access(p.workspace_id)
));

create policy workspace_access on approvals
for all
using (
  exists (
    select 1
    from missions m
    join projects p on p.id = m.project_id
    where m.id = approvals.mission_id
      and has_workspace_access(p.workspace_id)
  )
  or exists (
    select 1
    from change_proposals cp
    join projects p on p.id = cp.project_id
    where cp.id = approvals.change_proposal_id
      and has_workspace_access(p.workspace_id)
  )
)
with check (
  exists (
    select 1
    from missions m
    join projects p on p.id = m.project_id
    where m.id = approvals.mission_id
      and has_workspace_access(p.workspace_id)
  )
  or exists (
    select 1
    from change_proposals cp
    join projects p on p.id = cp.project_id
    where cp.id = approvals.change_proposal_id
      and has_workspace_access(p.workspace_id)
  )
);

create policy workspace_access on agent_runs
for all
using (
  exists (
    select 1
    from missions m
    join projects p on p.id = m.project_id
    where m.id = agent_runs.mission_id
      and has_workspace_access(p.workspace_id)
  )
  or exists (
    select 1
    from change_proposals cp
    join projects p on p.id = cp.project_id
    where cp.id = agent_runs.change_proposal_id
      and has_workspace_access(p.workspace_id)
  )
)
with check (
  exists (
    select 1
    from missions m
    join projects p on p.id = m.project_id
    where m.id = agent_runs.mission_id
      and has_workspace_access(p.workspace_id)
  )
  or exists (
    select 1
    from change_proposals cp
    join projects p on p.id = cp.project_id
    where cp.id = agent_runs.change_proposal_id
      and has_workspace_access(p.workspace_id)
  )
);

create policy workspace_access on council_conversations
for all
using (exists (
  select 1
  from missions m
  join projects p on p.id = m.project_id
  where m.id = council_conversations.mission_id
    and has_workspace_access(p.workspace_id)
))
with check (exists (
  select 1
  from missions m
  join projects p on p.id = m.project_id
  where m.id = council_conversations.mission_id
    and has_workspace_access(p.workspace_id)
));

create policy workspace_access on agent_costs
for all
using (
  agent_costs.project_id is not null
  and exists (
    select 1 from projects p
    where p.id = agent_costs.project_id
      and has_workspace_access(p.workspace_id)
  )
)
with check (
  agent_costs.project_id is not null
  and exists (
    select 1 from projects p
    where p.id = agent_costs.project_id
      and has_workspace_access(p.workspace_id)
  )
);

create policy workspace_access on releases
for all
using (exists (
  select 1 from projects p
  where p.id = releases.project_id
    and has_workspace_access(p.workspace_id)
))
with check (exists (
  select 1 from projects p
  where p.id = releases.project_id
    and has_workspace_access(p.workspace_id)
));

create policy workspace_access on issue_summaries
for all
using (exists (
  select 1 from projects p
  where p.id = issue_summaries.project_id
    and has_workspace_access(p.workspace_id)
))
with check (exists (
  select 1 from projects p
  where p.id = issue_summaries.project_id
    and has_workspace_access(p.workspace_id)
));

comment on table workspaces is 'Tenant boundary for one founder/team Control Room universe.';
comment on table workspace_members is 'Membership and role binding for workspace isolation. Public self-service remains disabled until separately authorized.';
comment on column projects.workspace_id is 'Owning workspace. Project slugs are unique only inside a workspace.';
