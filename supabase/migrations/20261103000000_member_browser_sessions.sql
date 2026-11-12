-- Separate ordinary member browser capabilities from founder-only sessions.
-- SOURCE ONLY: requires reviewed migration and RLS/real-browser proof before release.
create table if not exists public.fcr_member_browser_sessions (
  session_id_hash text primary key
    check (session_id_hash ~ '^[0-9a-f]{64}$'),
  member_user_id uuid not null references auth.users(id) on delete cascade,
  member_email text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  constraint fcr_member_session_expiry_order check (expires_at > issued_at)
);
create index if not exists fcr_member_browser_sessions_active_idx
  on public.fcr_member_browser_sessions(expires_at) where revoked_at is null;
alter table public.fcr_member_browser_sessions enable row level security;
revoke all on table public.fcr_member_browser_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.fcr_member_browser_sessions to service_role;
comment on table public.fcr_member_browser_sessions is
  'Service-role-only member session hashes. No bearer tokens, founder records or customer project data.';
