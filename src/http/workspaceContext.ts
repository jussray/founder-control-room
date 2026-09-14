import { supabase } from '../lib/supabaseClient.js';
import type { FounderRequest } from './middleware/requireFounder.js';

type DbRecord = Record<string, unknown>;

export interface WorkspaceContext {
  id: string;
  role: string | null;
}

export class WorkspaceAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceAccessError';
  }
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Resolve the active workspace for an already-authenticated founder.
 *
 * Public self-service is intentionally still disabled: requireFounder remains
 * the outer allowlist gate. This helper adds the inner tenant-membership gate.
 * A caller may request one of its own workspaces with x-fcr-workspace-id;
 * asking for any other workspace fails closed.
 */
export async function resolveActiveWorkspace(req: FounderRequest): Promise<WorkspaceContext> {
  const email = optionalString(req.founder?.email)?.toLowerCase();
  if (!email) throw new WorkspaceAccessError('Authenticated founder email is unavailable');

  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, created_at')
    .eq('email', email)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    throw new WorkspaceAccessError(`Workspace membership lookup failed: ${error.message}`);
  }

  const memberships = (data ?? []) as DbRecord[];
  const requestedWorkspaceId = optionalString(req.get('x-fcr-workspace-id'));
  const selected = requestedWorkspaceId
    ? memberships.find((membership) => optionalString(membership.workspace_id) === requestedWorkspaceId)
    : memberships[0];

  const workspaceId = optionalString(selected?.workspace_id);
  if (!workspaceId) {
    if (requestedWorkspaceId) {
      throw new WorkspaceAccessError('Requested workspace is not available to this founder');
    }
    throw new WorkspaceAccessError('No active Control Room workspace membership exists for this founder');
  }

  return {
    id: workspaceId,
    role: optionalString(selected?.role),
  };
}
