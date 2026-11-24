-- Register Truth Compass as an external, paused evidence identity.
-- This row exists only so read-only evidence receipts can reference the project.
-- It does not add the project to PORTFOLIO_PROJECTS or grant execution authority.
insert into projects (
  slug,
  name,
  repo_provider,
  repo_identifier,
  stack,
  status,
  risk_level
)
values (
  'truth-compass',
  'Truth Compass',
  'github',
  'jussray/truth-compass',
  'tanstack start + supabase',
  'paused',
  'low'
)
on conflict (slug) do nothing;
