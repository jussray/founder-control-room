-- Founder Control Room workspace tenant foundation.
--
-- Existing platform projects remain in one platform workspace. Existing
-- allowlist rows without a bound Supabase Auth user receive isolated empty
-- workspaces and workspace_owner authority. This prevents an allowlist alias
-- from inheriting global FCR authority during the migration.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workspaces is
  'Tenant boundary for Founder Control Room. A workspace owns founder access and projects.';

alter table public.workspaces enable row level security;
revoke all on table public.workspaces from public;

-- Supabase defines anon/authenticated roles, while the generic Neon preview
-- used by CI does not. Preserve the Supabase privilege revocation exactly when
-- those roles exist and remain fail-closed on generic PostgreSQL previews.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.workspaces from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.workspaces from authenticated';
  end if;
end
$$;

insert into public.workspaces (id, slug, name)
values ('00000000-0000-0000-0000-000000000001', 'juss-founder-workspace', 'Juss Founder Workspace')
on conflict (slug) do nothing;

-- Give every unbound allowlist identity an isolated workspace without placing
-- email addresses in public slugs. These accounts receive no global authority.
insert into public.workspaces (slug, name)
select
  'founder-' || substr(md5(lower(fu.email)), 1, 20),
  'Founder Workspace'
from public.founder_users fu
where fu.user_id is null
on conflict (slug) do nothing;

alter table public.founder_users
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict,
  add column if not exists account_role text;

-- A currently bound Supabase Auth identity is the only class eligible for the
-- existing platform workspace. A uniqueness invariant below makes this fail
-- closed if more than one row would become platform_owner.
update public.founder_users
set workspace_id = (select id from public.workspaces where slug = 'juss-founder-workspace'),
    account_role = 'platform_owner'
where user_id is not null;

update public.founder_users fu
set workspace_id = w.id,
    account_role = 'workspace_owner'
from public.workspaces w
where fu.user_id is null
  and w.slug = 'founder-' || substr(md5(lower(fu.email)), 1, 20);

alter table public.founder_users
  alter column workspace_id set not null,
  alter column account_role set default 'workspace_owner',
  alter column account_role set not null;

alter table public.founder_users
  drop constraint if exists founder_users_account_role_check;

alter table public.founder_users
  add constraint founder_users_account_role_check
  check (account_role in ('platform_owner', 'workspace_owner'));

create unique index if not exists founder_users_single_platform_owner_idx
  on public.founder_users ((account_role))
  where account_role = 'platform_owner';

comment on column public.founder_users.workspace_id is
  'Workspace assigned by trusted administration. Users cannot self-assign.';
comment on column public.founder_users.account_role is
  'platform_owner may use legacy global founder routes; workspace_owner is restricted to workspace-aware routes.';

alter table public.projects
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

-- All pre-existing projects are platform state and stay together. Keep the
-- existing global slug uniqueness contract so legacy project-by-slug routes do
-- not become ambiguous when tenancy lands.
update public.projects
set workspace_id = coalesce(
  workspace_id,
  (select id from public.workspaces where slug = 'juss-founder-workspace')
);

alter table public.projects
  alter column workspace_id set not null;

create index if not exists projects_workspace_id_idx
  on public.projects (workspace_id);

comment on column public.projects.workspace_id is
  'Owning FCR workspace. Workspace-aware service-role queries must filter by this column.';

-- Historical founder_full_access policies call is_founder(). Narrow that
-- helper to the platform owner. Supabase provides auth.jwt(); generic preview
-- PostgreSQL does not. In a non-Supabase environment install a deny-all helper
-- instead of widening access or fabricating auth state.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth'
      and p.proname = 'jwt'
      and p.pronargs = 0
  ) then
    execute $function$
      create or replace function public.is_founder() returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select coalesce(
          exists (
            select 1
            from public.founder_users fu
            where lower(fu.email) = lower((select auth.jwt()) ->> 'email')
              and fu.account_role = 'platform_owner'
          ),
          false
        );
      $body$;
    $function$;
  else
    execute $function$
      create or replace function public.is_founder() returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select false;
      $body$;
    $function$;
  end if;
end
$$;
