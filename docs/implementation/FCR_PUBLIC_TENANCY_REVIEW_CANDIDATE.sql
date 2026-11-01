-- SOURCE-ONLY REVIEW CANDIDATE. NOT APPLIED, NOT A DEPLOYED MIGRATION.
-- Approved target must be checked by exact Supabase project ref and migration SHA.
-- Postgres 17 / Supabase: default deny, distinct from existing founder tables.
-- Create on a disposable review database, prove RLS, then generate migration via CLI.

begin;

create table public.fcr_public_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.fcr_public_memberships (
  tenant_id uuid not null references public.fcr_public_tenants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index fcr_public_memberships_user_status_idx
  on public.fcr_public_memberships (user_id, status, tenant_id);

create table public.fcr_public_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.fcr_public_tenants(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  status text not null default 'unknown' check (status in ('unknown', 'observed', 'needs_review')),
  observed_at timestamptz,
  created_at timestamptz not null default now()
);
create index fcr_public_projects_tenant_idx
  on public.fcr_public_projects (tenant_id, id);

-- Service-only billing receipt ledger. Never write a receipt from user input.
-- Provider signatures, idempotency and event ownership must be verified first.
create table public.fcr_public_billing_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.fcr_public_tenants(id) on delete restrict,
  provider text not null check (char_length(provider) between 1 and 40),
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 200),
  signature_verified_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id),
  unique (id, tenant_id)
);

-- Paid state cannot be represented without a referenced verified receipt.
-- This is NOT billing activation; checkout/webhook flow remains separately gated.
create table public.fcr_public_entitlements (
  tenant_id uuid primary key references public.fcr_public_tenants(id) on delete restrict,
  plan text not null default 'explorer' check (plan in ('explorer', 'solo', 'team')),
  status text not null default 'inactive' check (status in ('inactive', 'active', 'suspended', 'canceled')),
  verified_receipt_id uuid,
  valid_until timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (verified_receipt_id, tenant_id)
    references public.fcr_public_billing_receipts (id, tenant_id),
  constraint paid_entitlement_requires_receipt check (
    plan = 'explorer'
    or (status <> 'active' or (verified_receipt_id is not null and valid_until is not null))
  )
);

-- Data API defense in depth. No public tenant can see existing founder tables.
alter table public.fcr_public_tenants enable row level security;
alter table public.fcr_public_memberships enable row level security;
alter table public.fcr_public_projects enable row level security;
alter table public.fcr_public_billing_receipts enable row level security;
alter table public.fcr_public_entitlements enable row level security;

revoke all on public.fcr_public_tenants from public, anon, authenticated;
revoke all on public.fcr_public_memberships from public, anon, authenticated;
revoke all on public.fcr_public_projects from public, anon, authenticated;
revoke all on public.fcr_public_billing_receipts from public, anon, authenticated;
revoke all on public.fcr_public_entitlements from public, anon, authenticated;

-- Only these two public-only projections are available to signed-in users.
-- No policies or grants for public tenants, billing or entitlements.
grant select on public.fcr_public_memberships to authenticated;
grant select on public.fcr_public_projects to authenticated;

-- JWT user_metadata is never used. Anonymous Supabase sign-in is excluded.
-- Membership query is self-scoped, so the project membership policy is
-- non-recursive even though it selects fcr_public_memberships.
create policy fcr_public_own_active_memberships
  on public.fcr_public_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and status = 'active'
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

create policy fcr_public_own_projects
  on public.fcr_public_projects
  for select to authenticated
  using (
    coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
    and exists (
      select 1 from public.fcr_public_memberships m
      where m.tenant_id = fcr_public_projects.tenant_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

-- No authenticated or anonymous INSERT/UPDATE/DELETE grant or policy exists.
-- The service-role-only business workflow must still check actor membership.
commit;
