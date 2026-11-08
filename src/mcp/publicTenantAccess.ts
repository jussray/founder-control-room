/**
 * Non-authorizing public MCP tenancy membrane. No founder project, approval,
 * provider, repository, or credential table is accepted by this interface.
 *
 * This module has no side effects; the HTTP adapter supplies a verified
 * Supabase Auth user and a narrowly projected public-only data store.
 */
export type PublicMcpUser = Readonly<{
  id: string;
  clientId: string;
}>;

export type PublicTenantMembership = Readonly<{
  tenantId: string;
  userId: string;
  status: 'active' | 'revoked';
}>;

export type PublicProjectSummary = Readonly<{
  id: string;
  tenantId: string;
  name: string;
  status: string;
  observedAt: string | null;
}>;

export interface PublicMcpTenantReader {
  /** The adapter MUST constrain this query to the authenticated user ID. */
  listMemberships(userId: string): Promise<readonly PublicTenantMembership[]>;
  /** The adapter MUST constrain this query to the provided tenant ID. */
  listProjects(tenantId: string): Promise<readonly PublicProjectSummary[]>;
  /** The adapter MUST filter by BOTH tenant ID and project ID. */
  getProject(tenantId: string, projectId: string): Promise<PublicProjectSummary | null>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TENANTS = 20;
const MAX_PROJECTS_PER_TENANT = 50;
const MAX_RETURNED_PROJECTS = 100;

export class PublicMcpAccessDenied extends Error {
  constructor() { super('Resource not found or not available to this connection'); }
}

function membershipsFor(user: PublicMcpUser, rows: readonly PublicTenantMembership[]) {
  // A hard upper bound fails closed instead of silently dropping grants.
  if (rows.length > MAX_TENANTS) throw new PublicMcpAccessDenied();
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.userId !== user.id || row.status !== 'active' || !UUID.test(row.tenantId)) {
      throw new PublicMcpAccessDenied();
    }
    if (ids.has(row.tenantId)) throw new PublicMcpAccessDenied();
    ids.add(row.tenantId);
  }
  return [...ids];
}

function safeProject(row: PublicProjectSummary, tenantId: string) {
  if (row.tenantId !== tenantId || !UUID.test(row.id) || !UUID.test(row.tenantId)) {
    throw new PublicMcpAccessDenied();
  }
  // Return a strict public projection, never spread arbitrary database fields.
  return {
    projectId: row.id,
    name: row.name.slice(0, 160),
    status: row.status.slice(0, 48),
    observedAt: row.observedAt,
    executionAuthorized: false as const,
  };
}

export async function listMyPublicProjects(user: PublicMcpUser, reader: PublicMcpTenantReader) {
  const tenants = membershipsFor(user, await reader.listMemberships(user.id));
  const projects: ReturnType<typeof safeProject>[] = [];
  for (const tenantId of tenants) {
    const rows = await reader.listProjects(tenantId);
    if (rows.length > MAX_PROJECTS_PER_TENANT) throw new PublicMcpAccessDenied();
    for (const row of rows) {
      if (projects.length >= MAX_RETURNED_PROJECTS) throw new PublicMcpAccessDenied();
      projects.push(safeProject(row, tenantId));
    }
  }
  return { projects, executionAuthorized: false as const };
}

export async function getMyPublicProject(
  user: PublicMcpUser,
  reader: PublicMcpTenantReader,
  projectId: string,
) {
  if (!UUID.test(projectId)) throw new PublicMcpAccessDenied();
  const tenants = membershipsFor(user, await reader.listMemberships(user.id));
  for (const tenantId of tenants) {
    const row = await reader.getProject(tenantId, projectId);
    if (row) return { project: safeProject(row, tenantId), executionAuthorized: false as const };
  }
  // Do not reveal whether an unknown ID belongs to another tenant.
  throw new PublicMcpAccessDenied();
}
