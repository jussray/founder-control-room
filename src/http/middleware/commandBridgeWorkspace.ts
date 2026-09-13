import type { NextFunction, Response } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { resolveActiveWorkspace, WorkspaceAccessError } from '../workspaceContext.js';
import type { FounderRequest } from './requireFounder.js';

type DbRecord = Record<string, unknown>;

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function activeProjectIds(req: FounderRequest): Promise<Set<string>> {
  const workspace = await resolveActiveWorkspace(req);
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', workspace.id);

  if (error) throw new WorkspaceAccessError(`Workspace project lookup failed: ${error.message}`);
  return new Set(
    ((data ?? []) as DbRecord[])
      .map((row) => stringValue(row.id))
      .filter(Boolean),
  );
}

function commandBridgeRequestId(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] === 'requests' && segments.length >= 2
    ? stringValue(segments[1]) || null
    : null;
}

function commandBridgeProjectSlug(req: FounderRequest): string | null {
  const segments = req.path.split('/').filter(Boolean);
  if (segments[0] && segments[0] !== 'requests') {
    return stringValue(segments[0]) || null;
  }
  if (segments[0] === 'requests' && segments.length === 1 && req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body as DbRecord : {};
    return stringValue(body.projectSlug) || null;
  }
  return null;
}

async function projectSlugAllowed(projectSlug: string, projectIds: Set<string>): Promise<boolean> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', projectSlug)
    .maybeSingle();
  if (error) throw new WorkspaceAccessError(`Command Bridge project lookup failed: ${error.message}`);
  const projectId = stringValue((data as DbRecord | null)?.id);
  return Boolean(projectId && projectIds.has(projectId));
}

async function requestIdAllowed(requestId: string, projectIds: Set<string>): Promise<boolean> {
  const { data, error } = await supabase
    .from('command_bridge_requests')
    .select('project_id')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw new WorkspaceAccessError(`Command Bridge request lookup failed: ${error.message}`);
  const projectId = stringValue((data as DbRecord | null)?.project_id);
  return Boolean(projectId && projectIds.has(projectId));
}

function filterRegistryResponse(res: Response, projectIds: Set<string>) {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode >= 400 || !body || typeof body !== 'object' || Array.isArray(body)) {
      return originalJson(body);
    }

    const record = body as DbRecord;
    if (!Array.isArray(record.requests)) return originalJson(body);

    const requests = (record.requests as DbRecord[]).filter((request) =>
      projectIds.has(stringValue(request.projectId)),
    );
    const requested = requests.filter((request) => request.status === 'requested').length;
    const approved = requests.filter((request) => request.status === 'approved').length;
    const executed = requests.filter((request) => request.status === 'executed').length;
    const writeRisk = requests.filter((request) => request.risk === 'write').length;

    return originalJson({
      ...record,
      summary: { total: requests.length, requested, approved, executed, writeRisk },
      requests,
    });
  }) as Response['json'];
}

/**
 * Tenant membrane for Command Bridge.
 *
 * Command Bridge carries project authority through multiple shapes: a root
 * registry, a project slug in the path, a project slug in a POST body, and a
 * request id that resolves back to project_id. Every one of those shapes must
 * bind to the authenticated founder's active workspace before the existing
 * command decision/execution logic may run.
 */
export async function requireCommandBridgeWorkspace(
  req: FounderRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const projectIds = await activeProjectIds(req);

    if (req.method === 'GET' && req.path === '/') {
      filterRegistryResponse(res, projectIds);
      next();
      return;
    }

    const projectSlug = commandBridgeProjectSlug(req);
    if (projectSlug && !(await projectSlugAllowed(projectSlug, projectIds))) {
      return res.status(404).json({ error: 'Resource not found in the active workspace' });
    }

    const requestId = commandBridgeRequestId(req.path);
    if (requestId && !(await requestIdAllowed(requestId, projectIds))) {
      return res.status(404).json({ error: 'Resource not found in the active workspace' });
    }

    next();
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Command Bridge workspace authorization failed' });
  }
}
