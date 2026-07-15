-- Founder Control Room MCP Hub — Phase 1
-- Read-only portfolio capability discovery and tool-call evidence.
-- No endpoint URLs, bearer tokens, raw tool payloads, teen/customer content, or
-- provider secrets are stored in these tables.

create table if not exists mcp_servers (
  id text primary key,
  label text not null,
  role text not null,
  endpoint_env text not null,
  auth_token_env text,
  development_only boolean not null default false,
  monthly_budget_usd numeric(10,4) not null default 0 check (monthly_budget_usd >= 0),
  status text not null default 'declared' check (status in ('declared', 'configured', 'disabled', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table mcp_servers is 'Non-secret MCP capability declarations. Environment variable names are stored; credentials and endpoint values are not.';

create table if not exists mcp_project_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  server_id text not null references mcp_servers(id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'read_only' check (mode in ('discovery_only', 'read_only', 'approval_gated')),
  allowed_tool_patterns text[] not null default array[]::text[],
  denied_tool_patterns text[] not null default array[]::text[],
  cost_limit_usd numeric(10,4) not null default 0 check (cost_limit_usd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, server_id)
);

comment on table mcp_project_policies is 'Per-project least-authority MCP policy. Phase 1 remains read-only and zero-budget by default.';

create table if not exists mcp_tool_calls (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  approval_id uuid references approvals(id) on delete set null,
  server_id text not null,
  tool_name text not null,
  risk text not null check (risk in ('read', 'write', 'destructive', 'external_side_effect')),
  policy_decision text not null check (policy_decision in ('allow', 'deny', 'requires_approval')),
  status text not null check (status in ('previewed', 'passed', 'blocked', 'failed')),
  request_hash text not null,
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  estimated_cost_usd numeric(10,4) not null default 0 check (estimated_cost_usd >= 0),
  error_code text,
  created_at timestamptz not null default now()
);

comment on table mcp_tool_calls is 'Redacted MCP evidence ledger. Stores hashes and structural summaries, never raw arguments, raw results, secrets, journals, transcripts, customer data, or story drafts.';

create index if not exists mcp_tool_calls_project_created_idx
  on mcp_tool_calls (project_id, created_at desc);
create index if not exists mcp_tool_calls_server_tool_idx
  on mcp_tool_calls (server_id, tool_name, created_at desc);
create index if not exists mcp_tool_calls_mission_idx
  on mcp_tool_calls (mission_id, created_at desc)
  where mission_id is not null;

alter table mcp_servers enable row level security;
alter table mcp_project_policies enable row level security;
alter table mcp_tool_calls enable row level security;

create policy founder_full_access on mcp_servers
  for all using (is_founder()) with check (is_founder());
create policy founder_full_access on mcp_project_policies
  for all using (is_founder()) with check (is_founder());
create policy founder_full_access on mcp_tool_calls
  for all using (is_founder()) with check (is_founder());

create trigger mcp_servers_set_updated_at before update on mcp_servers
  for each row execute function set_updated_at();
create trigger mcp_project_policies_set_updated_at before update on mcp_project_policies
  for each row execute function set_updated_at();

insert into mcp_servers (id, label, role, endpoint_env, auth_token_env, development_only, monthly_budget_usd)
values
  ('github', 'GitHub MCP', 'repository-read-and-review', 'MCP_GITHUB_URL', 'MCP_GITHUB_TOKEN', false, 0),
  ('playwright', 'Playwright MCP', 'qa-investigation-and-evidence', 'MCP_PLAYWRIGHT_URL', 'MCP_PLAYWRIGHT_TOKEN', false, 0),
  ('figma', 'Figma MCP', 'design-context-and-specification-read', 'MCP_FIGMA_URL', 'MCP_FIGMA_TOKEN', false, 0),
  ('supabase-dev', 'Supabase Development MCP', 'development-schema-inspection', 'MCP_SUPABASE_DEV_URL', 'MCP_SUPABASE_DEV_TOKEN', true, 0)
on conflict (id) do update set
  label = excluded.label,
  role = excluded.role,
  endpoint_env = excluded.endpoint_env,
  auth_token_env = excluded.auth_token_env,
  development_only = excluded.development_only,
  monthly_budget_usd = excluded.monthly_budget_usd,
  updated_at = now();
