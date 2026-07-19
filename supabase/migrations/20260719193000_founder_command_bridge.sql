-- Founder Command Bridge
--
-- Agents may request proof-gate commands, but the founder keeps command
-- authority. This table stores command cards, approvals, rejection, expiry,
-- and terminal-run handoff evidence. It is not a shell tunnel and it does not
-- bypass the guarded terminal registry.

create table if not exists command_bridge_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  command_id text not null,
  command_label text not null,
  command_risk text not null check (command_risk in ('read', 'verify', 'write')),
  expected_commit_sha text not null check (expected_commit_sha ~ '^[0-9a-fA-F]{40}$'),
  reason text not null,
  rollback_path text,
  evidence_intent text,
  requested_by_agent text not null default 'agent',
  requested_by_founder text not null default 'founder',
  status text not null default 'requested' check (status in (
    'requested', 'approved', 'rejected', 'expired', 'executed', 'cancelled'
  )),
  command_snapshot jsonb not null default '{}'::jsonb,
  founder_edits jsonb not null default '{}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  rejected_by text,
  rejected_at timestamptz,
  terminal_run_id uuid references terminal_runs(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (expires_at <= created_at + interval '24 hours')
);

create index if not exists command_bridge_requests_project_status_idx
  on command_bridge_requests (project_id, status, expires_at);

create index if not exists command_bridge_requests_mission_idx
  on command_bridge_requests (mission_id, created_at desc);

create index if not exists command_bridge_requests_terminal_run_idx
  on command_bridge_requests (terminal_run_id)
  where terminal_run_id is not null;

alter table command_bridge_requests enable row level security;

drop policy if exists "control_room_service_role_only" on command_bridge_requests;
create policy "control_room_service_role_only" on command_bridge_requests
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table command_bridge_requests from anon, authenticated;
grant select, insert, update, delete on table command_bridge_requests to service_role;

comment on table command_bridge_requests is
  'Founder-approved command cards. Agents request, founder decides, guarded terminal executes. No raw shell tunnel.';
comment on column command_bridge_requests.command_snapshot is
  'Frozen allowlisted command metadata from src/terminal/registry.ts at request time.';
comment on column command_bridge_requests.founder_edits is
  'Founder-approved modifications to reason, rollback path, usage limit, or execution notes. Never store secrets.';
comment on column command_bridge_requests.terminal_run_id is
  'Optional link to the guarded terminal run that executed the approved card.';