-- SOURCE ONLY. Apply only through founder-approved FCR migration gate.
begin;
create table if not exists public.founder_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  headline text not null default '' check (char_length(headline) <= 200),
  bio text not null default '' check (char_length(bio) <= 1200),
  website_url text check (website_url is null or (char_length(website_url) <= 300 and website_url ~ '^https://')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists founder_profiles_active_owner_unique
  on public.founder_profiles(owner_user_id) where deleted_at is null;
alter table public.founder_profiles enable row level security;
revoke all on public.founder_profiles from public, anon, authenticated;
grant select, insert, update on public.founder_profiles to service_role;
comment on table public.founder_profiles is
  'Private owner-scoped profile content. Service-layer Access JWT and FCR scoped API key required. Account deletion stays separate.';
commit;
