-- Workspace tenancy transition guards.
--
-- Keep global project slug uniqueness temporarily while legacy route surfaces
-- still resolve project identity by slug alone. Once every project route is
-- directly workspace-scoped this can intentionally become workspace-local.
create unique index if not exists projects_slug_tenant_transition_key
  on projects (slug);

create trigger workspaces_set_updated_at before update on workspaces
  for each row execute function set_updated_at();
create trigger workspace_members_set_updated_at before update on workspace_members
  for each row execute function set_updated_at();

-- Project-linked ledgers added after the original Control Room schema must use
-- the same owning-workspace boundary as the core project graph.
drop policy if exists founder_full_access on mcp_project_policies;
create policy workspace_access on mcp_project_policies
for all to authenticated
using (exists (
  select 1 from projects p
  where p.id = mcp_project_policies.project_id
    and has_workspace_access(p.workspace_id)
))
with check (exists (
  select 1 from projects p
  where p.id = mcp_project_policies.project_id
    and has_workspace_access(p.workspace_id)
));

drop policy if exists founder_full_access on mcp_tool_calls;
create policy workspace_access on mcp_tool_calls
for all to authenticated
using (exists (
  select 1 from projects p
  where p.id = mcp_tool_calls.project_id
    and has_workspace_access(p.workspace_id)
))
with check (exists (
  select 1 from projects p
  where p.id = mcp_tool_calls.project_id
    and has_workspace_access(p.workspace_id)
));

drop policy if exists founder_full_access on plugin_permission_grants;
create policy workspace_access on plugin_permission_grants
for all to authenticated
using (exists (
  select 1 from projects p
  where p.id = plugin_permission_grants.project_id
    and has_workspace_access(p.workspace_id)
))
with check (exists (
  select 1 from projects p
  where p.id = plugin_permission_grants.project_id
    and has_workspace_access(p.workspace_id)
));

drop policy if exists founder_full_access on external_code_use_discoveries;
create policy workspace_access on external_code_use_discoveries
for all to authenticated
using (exists (
  select 1 from projects p
  where p.id = external_code_use_discoveries.project_id
    and has_workspace_access(p.workspace_id)
))
with check (exists (
  select 1 from projects p
  where p.id = external_code_use_discoveries.project_id
    and has_workspace_access(p.workspace_id)
));

-- The historical proof-gate read policy was narrowed from any authenticated
-- user to is_founder(), but that is still portfolio-global. Make proof results
-- tenant-local while keeping inserts service-role-only.
drop policy if exists founders_can_read on proof_gate_results;
create policy workspace_member_read on proof_gate_results
for select to authenticated
using (exists (
  select 1 from projects p
  where p.id = proof_gate_results.project_id
    and has_workspace_access(p.workspace_id)
));

comment on index projects_slug_tenant_transition_key is
  'Temporary global slug uniqueness while legacy project routes migrate to explicit workspace_id scoping.';