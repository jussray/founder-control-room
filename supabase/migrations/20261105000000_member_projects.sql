-- SOURCE ONLY: review and migrate the FCR-specific database before enabling this surface.
create table if not exists public.fcr_member_projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  goal text not null default '' check (char_length(goal) <= 4000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fcr_member_projects_owner_updated_idx
  on public.fcr_member_projects(owner_user_id, updated_at desc);
alter table public.fcr_member_projects enable row level security;
revoke all on table public.fcr_member_projects from public, anon, authenticated;
-- Supabase installations can supply service_role grants through default privileges.
revoke all on table public.fcr_member_projects from service_role;
grant select, insert, update on table public.fcr_member_projects to service_role;
comment on table public.fcr_member_projects is
  'Private member-owned project drafts. Trusted API derives ownership from a revocable member session; no founder project records.';
