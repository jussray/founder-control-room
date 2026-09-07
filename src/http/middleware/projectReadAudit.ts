import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import type { FounderRequest } from './requireFounder.js';
import { resolveActiveWorkspace, WorkspaceAccessError } from '../workspaceContext.js';

type JsonRecord = Record<string, unknown>;

interface ReadSurface {
  eventType: string;
  routeTemplate: string;
  slug?: string;
}

class ProjectReadAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectReadAuditError';
  }
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

function readSurface(pathname: string): ReadSurface | null {
  const segments = pathSegments(pathname);
  if (segments.length === 0) {
    return {
      eventType: 'project_registry_read',
      routeTemplate: 'GET /projects',
    };
  }

  const [slug, suffix] = segments;
  if (!slug) return null;

  if (segments.length === 1) {
    return {
      eventType: 'project_read',
      routeTemplate: 'GET /projects/:slug',
      slug,
    };
  }

  const surfaces: Record<string, Omit<ReadSurface, 'slug'>> = {
    releases: {
      eventType: 'project_releases_read',
      routeTemplate: 'GET /projects/:slug/releases',
    },
    connections: {
      eventType: 'project_connections_read',
      routeTemplate: 'GET /projects/:slug/connections',
    },
    files: {
      eventType: 'project_files_read',
      routeTemplate: 'GET /projects/:slug/files',
    },
    file: {
      eventType: 'project_file_read',
      routeTemplate: 'GET /projects/:slug/file',
    },
    'current-truth': {
      eventType: 'project_current_truth_read',
      routeTemplate: 'GET /projects/:slug/current-truth',
    },
  };

  const surface = suffix ? surfaces[suffix] : undefined;
  return surface ? { ...surface, slug } : null;
}

function projectIdsFromRegistryBody(body: unknown): string[] | null {
  const projects = asRecord(body)?.projects;
  if (!Array.isArray(projects)) return null;

  const ids = projects
    .map(project => asRecord(project)?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (projects.length > 0 && ids.length !== projects.length) {
    throw new ProjectReadAuditError(
      'Project registry response contained a row without an auditable project id',
    );
  }

  return ids;
}

function projectIdFromBody(body: unknown): string | null {
  const id = asRecord(asRecord(body)?.project)?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

async function authenticateFounder(req: FounderRequest, res: Response): Promise<boolean> {
  if (req.founder) return true;
  const { requireFounder } = await import('./requireFounder.js');
  let authenticated = false;
  await requireFounder(req, res, () => {
    authenticated = true;
  });
  return authenticated;
}

async function workspaceProjectIds(workspaceId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', workspaceId);

  if (error) throw new ProjectReadAuditError(`Workspace project lookup failed: ${error.message}`);
  return new Set(
    (data ?? [])
      .map((row: { id?: unknown }) => row.id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
  );
}

async function workspaceProjectId(workspaceId: string, slug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new ProjectReadAuditError(`Workspace project lookup failed: ${error.message}`);
  return typeof data?.id === 'string' && data.id.length > 0 ? data.id : null;
}

function filterRegistryBody(body: unknown, allowedIds: Set<string>): unknown {
  const record = asRecord(body);
  if (!record || !Array.isArray(record.projects)) return body;
  return {
    ...record,
    projects: record.projects.filter((project) => {
      const id = asRecord(project)?.id;
      return typeof id === 'string' && allowedIds.has(id);
    }),
  };
}

async function projectIdsForRead(
  surface: ReadSurface,
  body: unknown,
  guardedProjectId: string | null,
): Promise<string[]> {
  if (!surface.slug) {
    return projectIdsFromRegistryBody(body) ?? [];
  }

  const responseProjectId = projectIdFromBody(body);
  const projectId = responseProjectId ?? guardedProjectId;
  if (!projectId) {
    throw new ProjectReadAuditError(
      `Project audit lookup found no workspace project for slug ${surface.slug}`,
    );
  }
  return [projectId];
}

async function persistReadAudit(
  req: FounderRequest,
  surface: ReadSurface,
  body: unknown,
  guardedProjectId: string | null,
): Promise<void> {
  const projectIds = await projectIdsForRead(surface, body, guardedProjectId);

  if (projectIds.length === 0) return;

  const rows = projectIds.map(projectId => ({
    project_id: projectId,
    source_event_id: randomUUID(),
    event_type: surface.eventType,
    severity: 'info',
    screen: 'control-room-api',
    metadata: {
      route: surface.routeTemplate,
      actor: 'founder',
      founder_user_id: req.founder?.userId ?? null,
      result_project_count: projectIds.length,
    },
  }));

  const { error } = await supabase.from('project_events').insert(rows);
  if (error) {
    throw new ProjectReadAuditError(`Project read audit failed: ${error.message}`);
  }
}

async function createWorkspaceProject(
  req: FounderRequest,
  res: Response,
  workspaceId: string,
): Promise<Response> {
  const body = req.body as JsonRecord;
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  if (!slug || !name) return res.status(400).json({ error: 'slug and name are required' });
  if (!slugPattern.test(slug)) {
    return res.status(400).json({ error: 'slug must be lowercase alphanumeric segments separated by hyphens' });
  }

  const repoProvider = typeof body.repoProvider === 'string' ? body.repoProvider : 'github';
  const repoIdentifier = typeof body.repoIdentifier === 'string' ? body.repoIdentifier : null;
  const stack = typeof body.stack === 'string' ? body.stack : null;
  const riskLevel = typeof body.riskLevel === 'string' ? body.riskLevel : 'medium';

  const { data: existing, error: existingError } = await supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('slug', slug)
    .maybeSingle();
  if (existingError) return res.status(500).json({ error: existingError.message });
  if (existing) return res.status(409).json({ error: `Project "${slug}" is already registered.` });

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      workspace_id: workspaceId,
      slug,
      name,
      repo_provider: repoProvider,
      repo_identifier: repoIdentifier,
      stack,
      risk_level: riskLevel,
      status: 'active',
    })
    .select()
    .single();

  if (error || !project) {
    if ((error as { code?: string } | null)?.code === '23505') {
      return res.status(409).json({ error: `Project "${slug}" is already registered.` });
    }
    return res.status(500).json({ error: error?.message ?? 'Project creation returned no record' });
  }

  const { error: eventError } = await supabase.from('project_events').insert({
    project_id: project.id,
    source_event_id: randomUUID(),
    event_type: 'project_registered',
    severity: 'info',
    screen: 'control-room-api',
    metadata: {
      route: 'POST /projects',
      registered_by: req.founder?.email,
      workspaceId,
    },
  });
  if (eventError) {
    return res.status(500).json({
      error: 'Project was created, but its registration audit event could not be recorded',
      detail: eventError.message,
    });
  }

  return res.status(201).json({ project });
}

/**
 * Transitional tenant boundary and project-read audit for the canonical
 * /projects cockpit.
 *
 * requireFounder remains the outer private-founder gate. This middleware adds
 * an active workspace-membership gate before any legacy project router can run.
 * Root project creation is handled here so workspace_id is never omitted.
 * Project-specific routes are pre-authorized against workspace_id before the
 * legacy slug-only handler executes. Global slug uniqueness remains in place
 * during this transition, preventing a second workspace from sharing a slug
 * until every legacy route is directly workspace-aware.
 */
export async function requireProjectReadAudit(
  req: FounderRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!(await authenticateFounder(req, res))) return;

  let workspace;
  try {
    workspace = await resolveActiveWorkspace(req);
  } catch (error) {
    const message = error instanceof WorkspaceAccessError || error instanceof Error
      ? error.message
      : 'Workspace access denied';
    res.status(403).json({ error: message });
    return;
  }

  const segments = pathSegments(req.path);

  if (req.method === 'POST' && segments.length === 0) {
    await createWorkspaceProject(req, res, workspace.id);
    return;
  }

  let guardedProjectId: string | null = null;
  if (segments.length > 0) {
    try {
      guardedProjectId = await workspaceProjectId(workspace.id, segments[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workspace project lookup failed';
      res.status(500).json({ error: message });
      return;
    }
    if (!guardedProjectId) {
      res.status(404).json({ error: 'Project not found in the active workspace' });
      return;
    }
  }

  if (req.method !== 'GET') {
    next();
    return;
  }

  const surface = readSurface(req.path);
  if (!surface) {
    next();
    return;
  }

  let allowedRegistryIds: Set<string> | null = null;
  if (!surface.slug) {
    try {
      allowedRegistryIds = await workspaceProjectIds(workspace.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workspace project lookup failed';
      res.status(500).json({ error: message });
      return;
    }
  }

  const originalJson = res.json.bind(res);
  let responseCommitted = false;

  res.json = ((body: unknown) => {
    if (responseCommitted || res.statusCode >= 400) {
      return originalJson(body);
    }

    responseCommitted = true;
    const scopedBody = allowedRegistryIds ? filterRegistryBody(body, allowedRegistryIds) : body;
    void persistReadAudit(req, surface, scopedBody, guardedProjectId)
      .then(() => {
        originalJson(scopedBody);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Project read audit persistence failed', {
          route: surface.routeTemplate,
          message,
        });
        res.status(500);
        originalJson({
          error: 'Project read audit persistence failed',
          code: 'AUDIT_PERSISTENCE_FAILED',
        });
      });

    return res;
  }) as Response['json'];

  next();
}
