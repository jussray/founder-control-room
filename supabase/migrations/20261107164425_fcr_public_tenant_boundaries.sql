-- FCR external Site: independent, initially empty customer namespaces.
-- Source-only migration; a separate exact-candidate approval is required to apply.
-- These tables never share FCR's founder-controlled projects or mission tables.
begin;

create table public.fcr_public_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.fcr_public_memberships (
  tenant_id uuid not null references public.fcr_public_tenants(id),
  user_id uuid not null references auth.users(id),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.fcr_public_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.fcr_public_tenants(id),
  name text not null check (char_length(name) between 1 and 160),
  status text not null default 'unknown'
    check (status in ('unknown', 'observed', 'needs_review')),
  observed_at timestamptz,
  created_at timestamptz not null default now()
);

create index fcr_public_projects_tenant_idx
  on public.fcr_public_projects(tenant_id);
create index fcr_public_memberships_user_status_idx
  on public.fcr_public_memberships(user_id, status);

-- No browser or general OAuth access. Only the trusted FCR service-role
-- backend may read or provision tenants, enforcing membership per request.
alter table public.fcr_public_tenants enable row level security;
alter table public.fcr_public_memberships enable row level security;
alter table public.fcr_public_projects enable row level security;

revoke all on table public.fcr_public_tenants from public, anon, authenticated;
revoke all on table public.fcr_public_memberships from public, anon, authenticated;
revoke all on table public.fcr_public_projects from public, anon, authenticated;

grant select, insert, update, delete on table public.fcr_public_tenants to service_role;
grant select, insert, update, delete on table public.fcr_public_memberships to service_role;
grant select, insert, update, delete on table public.fcr_public_projects to service_role;

create policy fcr_public_tenants_service_role
  on public.fcr_public_tenants for all to service_role
  using (true) with check (true);
create policy fcr_public_memberships_service_role
  on public.fcr_public_memberships for all to service_role
  using (true) with check (true);
create policy fcr_public_projects_service_role
  on public.fcr_public_projects for all to service_role
  using (true) with check (true);

comment on table public.fcr_public_tenants is
  'Independent public customer workspace namespaces. Empty until separately authorized provisioning.';
comment on table public.fcr_public_memberships is
  'Explicit immutable auth.users memberships for public customers. Service-role-only.';
comment on table public.fcr_public_projects is
  'Sanitized tenant projects, never founder portfolio records. Service-role-only.';

-- Intentionally NO seeded founder tenants, copied projects, or memberships.
commit;
