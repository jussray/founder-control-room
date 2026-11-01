/** Strict service-only read adapter for customer-managed public tenants. */
import { supabase } from '../lib/supabaseClient.js';
import type { PublicMcpTenantReader, PublicProjectSummary } from './publicTenantAccess.js';

// Deliberately does NOT read the founder projects table or execute providers.
export const publicTenantReader: PublicMcpTenantReader = {
  async listMemberships(userId) {
    const { data, error } = await supabase.from('fcr_public_memberships')
      .select('tenant_id,user_id,status')
      .eq('user_id', userId).eq('status', 'active').limit(21);
    if (error) throw new Error('public_mcp_membership_read_unavailable');
    return (data ?? []).map((row) => ({
      tenantId: row.tenant_id, userId: row.user_id, status: row.status,
    }));
  },
  async listProjects(tenantId) {
    const { data, error } = await supabase.from('fcr_public_projects')
      .select('id,tenant_id,name,status,observed_at')
      .eq('tenant_id', tenantId).order('id').limit(51);
    if (error) throw new Error('public_mcp_projects_read_unavailable');
    return (data ?? []).map((row): PublicProjectSummary => ({
      id: row.id, tenantId: row.tenant_id, name: row.name,
      status: row.status, observedAt: row.observed_at,
    }));
  },
  async getProject(tenantId, projectId) {
    const { data, error } = await supabase.from('fcr_public_projects')
      .select('id,tenant_id,name,status,observed_at')
      .eq('tenant_id', tenantId).eq('id', projectId).maybeSingle();
    if (error) throw new Error('public_mcp_project_read_unavailable');
    return data ? {
      id: data.id, tenantId: data.tenant_id, name: data.name,
      status: data.status, observedAt: data.observed_at,
    } : null;
  },
};

