import type { Session } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import {
  createSupabaseAuthClient,
  supabaseAuth,
} from '../../lib/supabaseAuthClient.js';
import { supabase } from '../../lib/supabaseClient.js';
import {
  bearerToken,
  readFounderSession,
  rotateFounderSession,
} from '../../auth/founderSession.js';
import { resolveActiveWorkspace, WorkspaceAccessError } from '../workspaceContext.js';

export interface FounderRequest extends Request {
  founder?: { email: string; userId: string };
}

interface AuthenticatedIdentity {
  email: string;
  userId: string;
}

type FounderResourceScope =
  | { kind: 'project-slug'; value: string }
  | { kind: 'mission-id'; value: string }
  | { kind: 'terminal-run-id'; value: string };

function authenticatedIdentity(user: unknown): AuthenticatedIdentity | null {
  if (!user || typeof user !== 'object' || Array.isArray(user)) return null;
  const record = user as Record<string, unknown>;
  const email = typeof record.email === 'string'
    ? record.email.trim().toLowerCase()
    : '';
  const userId = typeof record.id === 'string' ? record.id.trim() : '';
  return email && userId ? { email, userId } : null;
}

async function founderAllowlisted(identity: AuthenticatedIdentity): Promise<'allowed' | 'denied' | 'error'> {
  const { data: allowRow, error: allowError } = await supabase
    .from('founder_users')
    .select('email')
    .eq('email', identity.email)
    .maybeSingle();

  if (allowError) return 'error';
  return allowRow ? 'allowed' : 'denied';
}

function originalPathSegments(req: FounderRequest): string[] {
  return req.originalUrl
    .split('?', 1)[0]
    .split('/')
    .filter(Boolean);
}

function founderResourceScope(req: FounderRequest): FounderResourceScope | null {
  const segments = originalPathSegments(req);
  const [surface, firstId, secondId] = segments;

  if (surface === 'projects' && firstId) {
    return { kind: 'project-slug', value: firstId };
  }
  if ((surface === 'missions' || surface === 'approvals') && firstId) {
    return { kind: 'mission-id', value: firstId };
  }
  if (surface === 'terminal' && firstId === 'runs' && secondId) {
    return { kind: 'terminal-run-id', value: secondId };
  }
  if (surface === 'terminal' && firstId && firstId !== 'runs') {
    return { kind: 'project-slug', value: firstId };
  }
  return null;
}

async function projectIdBelongsToWorkspace(projectId: string, workspaceId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) return 'error' as const;
  return data ? 'allowed' as const : 'denied' as const;
}

async function resourceWorkspaceAccess(
  req: FounderRequest,
): Promise<'allowed' | 'denied' | 'error'> {
  const scope = founderResourceScope(req);
  if (!scope) return 'allowed';

  try {
    const workspace = await resolveActiveWorkspace(req);

    if (scope.kind === 'project-slug') {
      const { data, error } = await supabase
        .from('projects')
        .select('id')
        .eq('workspace_id', workspace.id)
        .eq('slug', scope.value)
        .maybeSingle();
      if (error) return 'error';
      return data ? 'allowed' : 'denied';
    }

    if (scope.kind === 'mission-id') {
      const { data: mission, error } = await supabase
        .from('missions')
        .select('project_id')
        .eq('id', scope.value)
        .maybeSingle();
      if (error) return 'error';
      if (!mission?.project_id) return 'denied';
      return projectIdBelongsToWorkspace(String(mission.project_id), workspace.id);
    }

    const { data: run, error } = await supabase
      .from('terminal_runs')
      .select('project_id')
      .eq('id', scope.value)
      .maybeSingle();
    if (error) return 'error';
    if (!run?.project_id) return 'denied';
    return projectIdBelongsToWorkspace(String(run.project_id), workspace.id);
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return 'denied';
    return 'error';
  }
}

async function authorizeFounderResourceScope(
  req: FounderRequest,
  res: Response,
  identity: AuthenticatedIdentity,
): Promise<boolean> {
  // Make the verified identity available to the workspace resolver only after
  // Supabase authentication and the private founder allowlist both pass.
  req.founder = identity;
  const resourceState = await resourceWorkspaceAccess(req);
  if (resourceState === 'error') {
    res.status(500).json({ error: 'Workspace resource authorization failed' });
    return false;
  }
  if (resourceState === 'denied') {
    res.status(404).json({ error: 'Resource not found in the active workspace' });
    return false;
  }
  return true;
}

/**
 * Founder authorization has three independent gates on customer-scoped routes:
 *
 * 1. A valid Supabase Auth session, supplied either as a Bearer token for API
 *    clients or resolved server-side from the opaque HttpOnly Control Room
 *    browser session capability.
 * 2. The authenticated email must still exist in the service-role-only
 *    `founder_users` allowlist.
 * 3. Any project slug, mission id, approval mission id, terminal project, or
 *    terminal run id named by the request must resolve through a project owned
 *    by an active workspace membership for the same founder.
 *
 * This check uses originalUrl rather than router-local params so it also runs
 * on privileged preflight middleware mounted directly at
 * /approvals/:missionId/execute before the approvals router.
 *
 * Root /projects registry filtering and project creation remain owned by the
 * project tenant middleware because they do not name a project resource yet.
 * Public self-service signup remains disabled.
 */
export async function requireFounder(
  req: FounderRequest,
  res: Response,
  next: NextFunction,
) {
  const explicitBearer = bearerToken(req);
  const cookieSession = explicitBearer ? null : await readFounderSession(req);
  let accessToken = explicitBearer ?? cookieSession?.accessToken ?? null;

  if (!accessToken) {
    return res.status(401).json({ error: 'Founder session required' });
  }

  let { data: userData, error: userError } = await supabaseAuth.auth.getUser(accessToken);
  let identity = authenticatedIdentity(userData?.user);
  let refreshedSession: Session | null = null;

  if ((userError || !identity) && cookieSession?.refreshToken) {
    const requestAuth = createSupabaseAuthClient();
    const refreshed = await requestAuth.auth.refreshSession({
      refresh_token: cookieSession.refreshToken,
    });
    const refreshedIdentity = authenticatedIdentity(refreshed.data.user);

    if (refreshed.data.session?.access_token && refreshedIdentity) {
      accessToken = refreshed.data.session.access_token;
      userData = { user: refreshed.data.user };
      userError = null;
      identity = refreshedIdentity;
      refreshedSession = refreshed.data.session;
    }
  }

  if (userError || !identity) {
    return res.status(401).json({ error: 'Invalid or expired founder session' });
  }

  const allowState = await founderAllowlisted(identity);
  if (allowState === 'error') {
    return res.status(500).json({ error: 'Founder allowlist check failed' });
  }
  if (allowState === 'denied') {
    return res.status(403).json({ error: 'Not on the founder allowlist' });
  }

  if (!(await authorizeFounderResourceScope(req, res, identity))) return;

  if (refreshedSession) {
    try {
      await rotateFounderSession(req, res, refreshedSession);
    } catch {
      return res.status(503).json({ error: 'Founder browser session rotation failed' });
    }
  }

  req.founder = identity;
  next();
}

/**
 * High-consequence interactive founder decisions must authenticate the opaque
 * browser capability itself. An Authorization bearer header is deliberately
 * ignored here, so bearer automation cannot borrow a browser session as proof
 * of a current founder interaction.
 *
 * The Supabase access token held in server-side session state must still be
 * current at decision time. We do not silently refresh it in this path: an
 * expired interactive identity must return through the normal authenticated UI
 * flow before it can decide authority.
 */
export async function requireInteractiveFounder(
  req: FounderRequest,
  res: Response,
  next: NextFunction,
) {
  const cookieSession = await readFounderSession(req);
  if (!cookieSession) {
    return res.status(401).json({ error: 'Interactive founder session required' });
  }
  if (typeof cookieSession.expiresAt === 'number' && cookieSession.expiresAt <= Math.floor(Date.now() / 1000)) {
    return res.status(401).json({ error: 'Interactive founder session expired' });
  }

  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(cookieSession.accessToken);
  const identity = authenticatedIdentity(userData?.user);
  if (userError || !identity) {
    return res.status(401).json({ error: 'Invalid or expired interactive founder session' });
  }

  const allowState = await founderAllowlisted(identity);
  if (allowState === 'error') {
    return res.status(500).json({ error: 'Founder allowlist check failed' });
  }
  if (allowState === 'denied') {
    return res.status(403).json({ error: 'Not on the founder allowlist' });
  }

  req.founder = identity;
  next();
}
