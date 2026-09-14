-- Founder Control Room workspace tenant foundation.
--
-- This migration preserves every existing founder/project inside one default
-- workspace while introducing an explicit tenant boundary for future users.
-- Tenant users do NOT receive direct table access through Supabase RLS in this
-- phase. They must go through workspace-scoped FCR API routes, where the
-- service-role client is filtered explicitly by workspace_id.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workspaces is
  'Tenant boundary for Founder Control Room. A workspace owns projects and founder access.';

alter table public.workspaces enable row level security;
-- Intentionally no authenticated policy in this phase. Workspace metadata is
-- served through the FCR API; service_role remains the database authority.

insert into public.workspaces (id, slug, name)
values ('00000000-0000-0000-0000-000000000001', 'juss-founder-workspace', 'Juss Founder Workspace')
on conflict (slug) do nothing;

alter table public.founder_users
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict,
  add column if not exists account_role text;

update public.founder_users
set workspace_id = coalesce(
      workspace_id,
      (select id from public.workspaces where slug = 'juss-founder-workspace')
    ),
    account_role = coalesce(account_role, 'platform_owner');

alter table public.founder_users
  alter column workspace_id set not null,
  alter column account_role set default 'workspace_owner',
  alter column account_role set not null;

alter table public.founder_users
  drop constraint if exists founder_users_account_role_check;

alter table public.founder_users
  add constraint founder_users_account_role_check
  check (account_role in ('platform_owner', 'workspace_owner'));

comment on column public.founder_users.workspace_id is
  'Workspace assigned by service-role administration. Users cannot self-assign.';
comment on column public.founder_users.account_role is
  'platform_owner may use legacy global founder routes; workspace_owner is restricted to workspace-scoped routes.';

alter table public.projects
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

update public.projects
set workspace_id = coalesce(
  workspace_id,
  (select id from public.workspaces where slug = 'juss-founder-workspace')
);

alter table public.projects
  alter column workspace_id set not null;

-- Project slugs only need to be unique inside one workspace. This allows two
-- unrelated founders to connect repositories/projects with the same local name.
alter table public.projects drop constraint if exists projects_slug_key;
create unique index if not exists projects_workspace_slug_key
  on public.projects (workspace_id, slug);
create index if not exists projects_workspace_id_idx
  on public.projects (workspace_id);

comment on column public.projects.workspace_id is
  'Owning FCR workspace. Service-role API queries must always filter by this column for tenant users.';

-- The historical founder_full_access policies call is_founder(). Narrow that
-- helper to platform_owner only. Workspace owners intentionally get zero direct
-- authenticated-table access in this phase and must use the scoped API.
create or replace function public.is_founder() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.founder_users fu
      where lower(fu.email) = lower((select auth.jwt()) ->> 'email')
        and fu.account_role = 'platform_owner'
    ),
    false
  );
$$;

revoke all on table public.workspaces from anon, authenticated;
