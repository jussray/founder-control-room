-- GitHub portfolio ingress
--
-- The webhook resolver uses this explicit connection as an owner-scoped
-- fallback after checking exact repository connections. It lets future
-- repositories under the founder's GitHub owner enter the evidence spine
-- without adding a filename to a social allowlist. It does not publish,
-- deploy, or grant provider credentials.

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
  'jussray-portfolio',
  'jussray GitHub Portfolio',
  'github',
  null,
  'GitHub portfolio event spine',
  'active',
  'high'
)
on conflict (slug) do nothing;

insert into project_connections (
  project_id,
  connection_type,
  label,
  config,
  status
)
select
  id,
  'git',
  'jussray-all-owned-github',
  jsonb_build_object(
    'repositoryScope',
    jsonb_build_object(
      'mode', 'all_owned',
      'owner', 'jussray'
    )
  ),
  'active'
from projects
where slug = 'jussray-portfolio'
on conflict (project_id, connection_type, label) do nothing;
