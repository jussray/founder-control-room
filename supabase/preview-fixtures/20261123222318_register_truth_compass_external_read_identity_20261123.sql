-- Ephemeral Neon preview only. Baseline projects DDL copied from the original
-- FCR schema migration; creates the dependency only if absent. Never deployed
-- to Supabase; no project row or execution authority is fabricated here.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                 -- e.g. "sekret-bip" — stable projectId used everywhere
  name text not null,                        -- e.g. "Se'kret Bip"
  repo_provider text not null default 'github', -- matches RepositoryProvider.name
  repo_identifier text,                      -- e.g. "jussray/Sekret-Bip"
  cloudflare_account text,
  supabase_project text,                     -- the PROJECT'S OWN Supabase ref, not this one
  stack text,                                -- e.g. "expo/react-native + cloudflare worker + supabase"
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
