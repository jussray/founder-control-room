-- PRE-RELEASE SCHEMA PROPOSAL ONLY. This is NOT a migration and has NOT run.
-- A separate founder-approved migration is required before activation.
-- Public customers MUST NOT share the governed founder projects tables.
-- Review existing database conventions, data API grants, and RLS before use.

create table if not exists public.fcr_public_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);

create table if not exists public.fcr_public_memberships (
  tenant_id uuid not null references public.fcr_public_tenants(id),
  user_id uuid not null references auth.users(id),
  status text not null check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.fcr_public_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.fcr_public_tenants(id),
  name text not null check (char_length(name) between 1 and 160),
  status text not null default 'unknown' check (status in ('unknown', 'observed', 'needs_review')),
  observed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists fcr_public_projects_tenant_idx
  on public.fcr_public_projects (tenant_id);

alter table public.fcr_public_tenants enable row level security;
alter table public.fcr_public_memberships enable row level security;
alter table public.fcr_public_projects enable row level security;

-- Default-deny all writes from browsers and untrusted OAuth clients.
revoke all on public.fcr_public_tenants from anon, authenticated;
revoke all on public.fcr_public_memberships from anon, authenticated;
revoke all on public.fcr_public_projects from anon, authenticated;
grant select on public.fcr_public_memberships to authenticated;
grant select on public.fcr_public_projects to authenticated;

-- Do not trust user-editable JWT metadata. Access is server-held membership.
create policy fcr_public_own_active_memberships on public.fcr_public_memberships
  for select to authenticated using (
    user_id = (select auth.uid())
    and status = 'active'
    and (select auth.jwt() ->> 'client_id') is not null
  );

create policy fcr_public_own_projects on public.fcr_public_projects
  for select to authenticated using (
    (select auth.jwt() ->> 'client_id') is not null
    and exists (
      select 1 from public.fcr_public_memberships m
      where m.tenant_id = fcr_public_projects.tenant_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

-- No INSERT/UPDATE/DELETE policies for authenticated/anon roles.
-- Provision and revoke membership only through a separately approved
-- trusted administrative workflow with evidence and rate limits.
-- Final migration must include an RLS test matrix for tenants A and B,
-- disabled membership, unknown user, founder isolation, and service_role access.
