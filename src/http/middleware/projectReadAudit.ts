import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import type { FounderRequest } from './requireFounder.js';

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
  };

  const surface = suffix ? surfaces[suffix] : undefined;
  return surface ? { ...surface, slug } : null;
}

function projectIdsFromRegistryBody(body: unknown): string[] | null {
  const projects = asRecord(body)?.['projects'];
  if (!Array.isArray(projects)) return null;

  const ids = projects
    .map(project => asRecord(project)?.['id'])
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (projects.length > 0 && ids.length !== projects.length) {
    throw new ProjectReadAuditError(
      'Project registry response contained a row without an auditable project id',
    );
  }

  return ids;
}

function projectIdFromBody(body: unknown): string | null {
  const id = asRecord(asRecord(body)?.['project'])?.['id'];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

async function resolveProjectId(slug: string): Promise<string> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw new ProjectReadAuditError(`Project audit lookup failed: ${error.message}`);
  }

  const id = data?.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new ProjectReadAuditError(
      `Project audit lookup found no registered project for slug ${slug}`,
    );
  }

  return id;
}

async function projectIdsForRead(
  surface: ReadSurface,
  body: unknown,
): Promise<string[]> {
  if (!surface.slug) {
    return projectIdsFromRegistryBody(body) ?? [];
  }

  const responseProjectId = projectIdFromBody(body);
  return [responseProjectId ?? await resolveProjectId(surface.slug)];
}

async function persistReadAudit(
  req: FounderRequest,
  surface: ReadSurface,
  body: unknown,
): Promise<void> {
  const projectIds = await projectIdsForRead(surface, body);

  // An empty registry reveals no project rows and the schema has no global audit
  // parent. Every non-empty registry row and every project-specific read is
  // fail-closed below.
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

/**
 * Delays successful JSON responses from the Project Registry until a sanitized
 * access event has persisted. Error responses and non-GET methods are not
 * rewritten. This is mounted around `projectsRouter` only, after unrelated
 * repository-verification routes.
 */
export function requireProjectReadAudit(
  req: FounderRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.method !== 'GET') {
    next();
    return;
  }

  const surface = readSurface(req.path);
  if (!surface) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  let responseCommitted = false;

  res.json = ((body: unknown) => {
    if (responseCommitted || res.statusCode >= 400) {
      return originalJson(body);
    }

    responseCommitted = true;
    void persistReadAudit(req, surface, body)
      .then(() => {
        originalJson(body);
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
