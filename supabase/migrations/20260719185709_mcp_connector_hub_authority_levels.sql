-- MCP / Connector Hub: authority-level model on the existing
-- project_connections table (0001_init.sql). No new table — connector,
-- project, provider, config, and status already lived here; this adds the
-- L0-L6 authority classification, declared capabilities, data-boundary
-- notes, and a last-successful-check timestamp so the Control Room can
-- show connector state without ever holding the credential itself.
--
-- L0-L6 mirror the existing L99 "no approval carries forward" model:
-- inspection is a different gate than execution, which is a different gate
-- than integrate/deploy/spend. See src/lib/authorityLevels.ts.

alter table project_connections
  add column if not exists authority_level text
    check (authority_level in ('L0','L1','L2','L3','L4','L5','L6')),
  add column if not exists capabilities text[] not null default array[]::text[],
  add column if not exists data_boundary text,
  add column if not exists required_approval text,
  add column if not exists last_checked_at timestamptz;

comment on column project_connections.authority_level is
  'L0 read public docs .. L6 deploy/migrate/spend/communicate/change providers. No approval carries from one level into another.';
comment on column project_connections.capabilities is
  'Free-form capability labels, e.g. {"inspect_repos","create_branch","read_only"}.';
comment on column project_connections.data_boundary is
  'Human-readable note on what this connection may and may not touch, e.g. "sanitized operational events only, no teen journal content".';
comment on column project_connections.last_checked_at is
  'Last time a founder-triggered health check confirmed this connection actually works.';

-- Widen the connection_type allowlist to cover the named provider surfaces
-- (design, creative, comms, browser verification) without collapsing them
-- into 'other'. Existing rows and the check name stay intact — additive.
alter table project_connections drop constraint if exists project_connections_connection_type_check;
alter table project_connections add constraint project_connections_connection_type_check
  check (connection_type in (
    'git', 'github', 'cloudflare', 'supabase', 'openai', 'anthropic', 'perplexity',
    'shopify', 'expo', 'apple', 'google_play', 'stripe',
    'figma', 'canva', 'playwright', 'gmail', 'calendar', 'context7', 'other'
  ));
