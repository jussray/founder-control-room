-- Server-controlled browser sessions for Founder Control Room.
--
-- The browser receives only a random opaque capability. Supabase access and
-- refresh credentials are encrypted by FCR before service-role persistence so
-- browser-session revocation, expiry, rotation, and continuity verification are
-- controlled by FCR without storing reusable credentials in plaintext.

create table if not exists public.founder_browser_sessions (
  session_id_hash text primary key,
  founder_user_id uuid not null references auth.users(id) on delete cascade,
  founder_email text not null,
  credential_ciphertext text not null,
  credential_iv text not null,
  credential_auth_tag text not null,
  auth_expires_at bigint,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  session_version integer not null default 1,
  continuity_fingerprint text not null,
  revoked_at timestamptz,
  revoke_reason text,
  constraint founder_browser_sessions_hash_shape
    check (session_id_hash ~ '^[0-9a-f]{64}$'),
  constraint founder_browser_sessions_continuity_fingerprint_shape
    check (continuity_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint founder_browser_sessions_positive_version
    check (session_version > 0),
  constraint founder_browser_sessions_expiry_after_issue
    check (expires_at > issued_at),
  constraint founder_browser_sessions_revocation_after_issue
    check (revoked_at is null or revoked_at >= issued_at)
);

create index if not exists founder_browser_sessions_active_idx
  on public.founder_browser_sessions (expires_at)
  where revoked_at is null;

alter table public.founder_browser_sessions enable row level security;

-- Browser and ordinary authenticated Supabase clients never read or mutate
-- founder session state. The backend's existing service-role client is the only
-- application path allowed to resolve these opaque capabilities. Credential
-- plaintext exists only transiently in backend memory around Supabase Auth calls.
revoke all on table public.founder_browser_sessions from anon, authenticated;
grant select, insert, update, delete on table public.founder_browser_sessions to service_role;

comment on table public.founder_browser_sessions is
  'Service-role-only FCR browser session state. Browser cookies contain only opaque random capabilities; Supabase credentials are persisted only as an application-level AES-256-GCM authenticated-encryption envelope.';
comment on column public.founder_browser_sessions.session_id_hash is
  'SHA-256 of the high-entropy opaque browser capability. The raw capability is never persisted.';
comment on column public.founder_browser_sessions.credential_ciphertext is
  'AES-256-GCM ciphertext for the bounded Supabase access/refresh credential payload. Key material is never stored in the database.';
comment on column public.founder_browser_sessions.credential_iv is
  'Per-session random AES-GCM IV encoded as base64url.';
comment on column public.founder_browser_sessions.credential_auth_tag is
  'AES-GCM authentication tag binding ciphertext to exact session identity/timestamps/version through additional authenticated data.';
comment on column public.founder_browser_sessions.continuity_fingerprint is
  'SHA-256 state-integrity fingerprint over the session hash, founder identity, issue/expiry timestamps, and session version. It excludes browser/device/network tracking signals and grants no authority.';
comment on column public.founder_browser_sessions.revoked_at is
  'Server-side revocation witness. Revoked capabilities fail closed and cannot regain validity.';
