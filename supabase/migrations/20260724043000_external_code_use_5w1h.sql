-- Founder Control Room external code-use 5W1H ledger.
-- Stores sanitized public evidence only. Raw MCP payloads, private repository code,
-- credentials, teen data, journals, voice, media, and customer data are forbidden.

create table if not exists external_code_use_discoveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source text not null check (source in ('github_mcp', 'exa_mcp', 'manual')),
  source_tool text not null,
  evidence_url text not null,
  external_owner text,
  external_repository text,
  title text not null,
  evidence_summary text not null,
  discovery_query text not null,
  evidence_hash text not null,
  classification text not null default 'possible'
    check (classification in ('confirmed', 'probable', 'possible', 'dismissed')),
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  who_text text not null,
  what_text text not null,
  where_text text not null,
  when_text text not null,
  why_text text not null,
  how_text text not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  last_digest_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, evidence_hash)
);

comment on table external_code_use_discoveries is
  'Sanitized public evidence that an outside repository, page, package, deployment, or product may use founder-owned repository code, normalized into 5W1H.';
comment on column external_code_use_discoveries.discovery_query is
  'Public metadata query only. Never store private source fragments, secrets, user data, journals, voice, media, or customer content.';

create index if not exists external_code_use_discoveries_project_seen_idx
  on external_code_use_discoveries (project_id, last_seen_at desc);
create index if not exists external_code_use_discoveries_classification_idx
  on external_code_use_discoveries (classification, last_seen_at desc);
create index if not exists external_code_use_discoveries_source_idx
  on external_code_use_discoveries (source, last_seen_at desc);

create table if not exists external_code_use_digest_runs (
  id uuid primary key default gen_random_uuid(),
  digest_hour timestamptz not null unique,
  recipient text not null check (recipient = 'sekretbip@gmail.com'),
  status text not null check (status in ('running', 'sent', 'failed')),
  item_count integer not null default 0 check (item_count >= 0),
  new_item_count integer not null default 0 check (new_item_count >= 0),
  source_counts jsonb not null default '{}'::jsonb,
  warnings text[] not null default array[]::text[],
  resend_email_id text,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table external_code_use_digest_runs is
  'Hourly, idempotent Resend delivery ledger for the external code-use list. The recipient is purpose-bound to the Se''kret Bip inbox.';

alter table external_code_use_discoveries enable row level security;
alter table external_code_use_digest_runs enable row level security;

revoke all on table external_code_use_discoveries from anon, authenticated;
revoke all on table external_code_use_digest_runs from anon, authenticated;
grant select, insert, update, delete on table external_code_use_discoveries to service_role;
grant select, insert, update, delete on table external_code_use_digest_runs to service_role;

create policy founder_full_access on external_code_use_discoveries
  for all to authenticated using (is_founder()) with check (is_founder());
create policy founder_full_access on external_code_use_digest_runs
  for all to authenticated using (is_founder()) with check (is_founder());

create trigger external_code_use_discoveries_set_updated_at
  before update on external_code_use_discoveries
  for each row execute function set_updated_at();
create trigger external_code_use_digest_runs_set_updated_at
  before update on external_code_use_digest_runs
  for each row execute function set_updated_at();

-- Zero-cash discovery and evidence adapters. Exa's unauthenticated/free-credit
-- remote MCP path is allowed only while no paid budget is configured. Resend MCP
-- remains read-only evidence access; the purpose-bound hourly sender uses the
-- dedicated RESEND_API_KEY runtime secret and fixed recipient contract.
insert into mcp_servers (
  id, label, role, endpoint_env, auth_token_env, development_only, monthly_budget_usd
)
values
  ('exa', 'Exa Deep Search MCP', 'public-web-external-code-use-discovery', 'MCP_EXA_URL', null, false, 0),
  ('resend', 'Resend MCP', 'email-delivery-evidence', 'MCP_RESEND_URL', 'RESEND_API_KEY', false, 0)
on conflict (id) do update set
  label = excluded.label,
  role = excluded.role,
  endpoint_env = excluded.endpoint_env,
  auth_token_env = excluded.auth_token_env,
  development_only = excluded.development_only,
  monthly_budget_usd = excluded.monthly_budget_usd,
  updated_at = now();

insert into mcp_project_policies (
  project_id, server_id, enabled, mode,
  allowed_tool_patterns, denied_tool_patterns, cost_limit_usd
)
select
  p.id,
  policy.server_id,
  true,
  'read_only',
  policy.allowed_patterns,
  policy.denied_patterns,
  0
from projects p
join (
  values
    (
      'exa',
      array['deep_search_exa','web_search_advanced_exa','web_search_exa','web_fetch_exa']::text[],
      array['*people*','*contact*','*email*','*phone*','*create*','*update*','*delete*','*write*']::text[],
      array['sekret-bip','juss-beautiful-hair','jbh-private','l99','chief-ai-machine','untold-stories','founder-control-room','promptos']::text[]
    ),
    (
      'resend',
      array['list_*','get_*','read_*','search_*','inspect_*','status_*']::text[],
      array['*send*','*batch*','*broadcast*','*create*','*update*','*delete*','*cancel*','*remove*','*key*']::text[],
      array['sekret-bip','founder-control-room']::text[]
    )
) as policy(server_id, allowed_patterns, denied_patterns, project_slugs)
  on p.slug = any(policy.project_slugs)
on conflict (project_id, server_id) do update set
  enabled = excluded.enabled,
  mode = excluded.mode,
  allowed_tool_patterns = excluded.allowed_tool_patterns,
  denied_tool_patterns = excluded.denied_tool_patterns,
  cost_limit_usd = excluded.cost_limit_usd,
  updated_at = now();
