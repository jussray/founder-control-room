-- Founder Command Bridge
--
-- Agents do not receive a live shell. They create short-lived command cards.
-- The founder approves, denies, or lets the card expire. Approved execution
-- still goes through the guarded terminal runner and its allowlisted command
-- registry. This table preserves direction, approval, expiry, and the eventual
-- terminal run receipt.

create table if not exists command_bridge_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  command_id text not null,
  expected_commit_sha text not null check (expected_commit_sha ~ '^[0-9a-fA-F]{40}$'),
  requesting_agent text not null default 'unknown-agent',
  requested_by text not null default 'founder',
  reason text not null,
  rollback_plan text,
  risk text not null check (risk in ('read', 'verify', 'write')),
  status text not null default 'requested' check (status in (
    'requested', 'approved', 'denied', 'expired', 'executed', 'failed', 'audit_incomplete'
  )),
  expires_at timestamptz not null,
  approved_by text,
  approved_at timestamptz,
  approval_note text,
  terminal_run_id uuid references terminal_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (expires_at <= created_at + interval '1 hour')
);

alter table command_bridge_requests enable row level security;

drop policy if exists founder_full_access on command_bridge_requests;
create policy founder_full_access on command_bridge_requests
  for all using (is_founder()) with check (is_founder());

create index if not exists command_bridge_requests_project_status_idx
  on command_bridge_requests (project_id, status, created_at desc);

create index if not exists command_bridge_requests_mission_idx
  on command_bridge_requests (mission_id, created_at desc);

create index if not exists command_bridge_requests_terminal_run_idx
  on command_bridge_requests (terminal_run_id)
  where terminal_run_id is not null;

comment on table command_bridge_requests is
  'Founder Command Bridge cards. Agents request an allowlisted command; the founder keeps direction and approval; execution still runs through guarded terminal.';
comment on column command_bridge_requests.expected_commit_sha is
  'Exact 40-character commit SHA expected by the mission policy snapshot. Prevents command cards from floating across moving heads.';
comment on column command_bridge_requests.rollback_plan is
  'Human-readable reversal plan. No credentials or private content.';
comment on column command_bridge_requests.terminal_run_id is
  'Receipt link to terminal_runs after the approved command is executed through the guarded terminal runner.';
