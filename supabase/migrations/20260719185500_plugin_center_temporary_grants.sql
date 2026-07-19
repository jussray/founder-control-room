-- Plugin Center: temporary permission grants
--
-- This ledger gives Founder Control Room a first-class place to record short-
-- lived capability exceptions such as Claude Code Bash allow rules. It does
-- not store secrets and it does not bypass route-level proof gates. The actual
-- enforcement surface still lives in the relevant provider, terminal runner,
-- .claude/settings.json, or approval route; this table preserves intent,
-- expiry, usage limit, and revocation evidence.

create table if not exists plugin_permission_grants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  connection_id uuid references project_connections(id) on delete set null,
  grant_type text not null default 'tool_rule' check (grant_type in (
    'tool_rule', 'provider_action', 'bash_rule', 'connector_scope', 'other'
  )),
  tool_rule text not null,
  reason text,
  requested_by text not null default 'founder',
  usage_limit text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (expires_at <= created_at + interval '24 hours')
);

create index if not exists plugin_permission_grants_project_active_idx
  on plugin_permission_grants (project_id, expires_at)
  where revoked_at is null;

create index if not exists plugin_permission_grants_connection_idx
  on plugin_permission_grants (connection_id)
  where connection_id is not null;

comment on table plugin_permission_grants is
  'Temporary Plugin Center capability grants. Stores intent and expiry only; no credential values and no automatic bypass of proof gates.';
comment on column plugin_permission_grants.tool_rule is
  'The human-readable enforcement rule or provider action, e.g. Bash(git push origin main). Never place credential values here.';
comment on column plugin_permission_grants.usage_limit is
  'Human-readable limit for use, e.g. close only issues whose evidence is preserved and whose gates are resolved.';
