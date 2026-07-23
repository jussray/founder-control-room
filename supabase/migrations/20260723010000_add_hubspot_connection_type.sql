-- Founder onboarding provider parity.
--
-- HubSpot is already declared in src/lib/pluginCenter.ts with a critical L6
-- authority boundary, but the project_connections database allowlist predates
-- that catalog entry. This migration admits the provider name only. It does not
-- create credentials, connect HubSpot, grant CRM mutation authority, or alter
-- any existing connection row.

alter table project_connections
  drop constraint if exists project_connections_connection_type_check;

alter table project_connections
  add constraint project_connections_connection_type_check
  check (connection_type in (
    'git', 'github', 'cloudflare', 'supabase', 'openai', 'anthropic', 'perplexity',
    'shopify', 'expo', 'apple', 'google_play', 'stripe',
    'figma', 'canva', 'playwright', 'gmail', 'calendar', 'context7', 'hubspot', 'other'
  ));
