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

export type FounderAccountRole = 'platform_owner' | 'workspace_owner';

export interface FounderIdentity {
  email: string;
  userId: string;
  role: FounderAccountRole;
  workspaceId: string | null;
}

export interface FounderRequest extends Request {
  founder?: FounderIdentity;
}

interface AuthenticatedIdentity {
  email: string;
  userId: string;
}

interface FounderAccess {
  role: FounderAccountRole;
  workspaceId: string | null;
}

function authenticatedIdentity(user: unknown): AuthenticatedIdentity | null {
  if (!user || typeof user !== 'object' || Array.isArray(user)) return null;
  const record = user as Record<string, unknown>;
  const email = typeof record.email === 'string'
    ? record.email.trim().toLowerCase()
    : '';
  const userId = typeof record.id === 'string' ? record.id.trim() : '';
  return email && userId ? { email, userId } : null;
}

async function founderAccess(
  identity: AuthenticatedIdentity,
): Promise<{ state: 'allowed'; access: FounderAccess } | { state: 'denied' | 'error' }> {
  const { data: allowRow, error: allowError } = await supabase
    .from('founder_users')
    .select('*')
    .eq('email', identity.email)
    .maybeSingle();

  if (allowError) return { state: 'error' };
  if (!allowRow || typeof allowRow !== 'object' || Array.isArray(allowRow)) {
    return { state: 'denied' };
  }

  const record = allowRow as Record<string, unknown>;
  const rawRole = record.account_role;
  const role: FounderAccountRole = rawRole === undefined || rawRole === null
    ? 'platform_owner'
    : rawRole === 'platform_owner' || rawRole === 'workspace_owner'
      ? rawRole
      : 'platform_owner';

  if (rawRole !== undefined && rawRole !== null && rawRole !== 'platform_owner' && rawRole !== 'workspace_owner') {
    return { state: 'error' };
  }

  const workspaceId = typeof record.workspace_id === 'string' && record.workspace_id.trim()
    ? record.workspace_id.trim()
    : null;

  return { state: 'allowed', access: { role, workspaceId } };
}

function founderIdentity(
  identity: AuthenticatedIdentity,
  access: FounderAccess,
): FounderIdentity {
  return {
    email: identity.email,
    userId: identity.userId,
    role: access.role,
    workspaceId: access.workspaceId,
  };
}

async function authorizeFounderRequest(
  req: FounderRequest,
  res: Response,
  allowWorkspaceOwner: boolean,
): Promise<FounderIdentity | null> {
  const explicitBearer = bearerToken(req);
  const cookieSession = explicitBearer ? null : await readFounderSession(req);
  const accessToken = explicitBearer ?? cookieSession?.accessToken ?? null;

  if (!accessToken) {
    res.status(401).json({ error: 'Founder session required' });
    return null;
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
      userData = { user: refreshed.data.user };
      userError = null;
      identity = refreshedIdentity;
      refreshedSession = refreshed.data.session;
    }
  }

  if (userError || !identity) {
    res.status(401).json({ error: 'Invalid or expired founder session' });
    return null;
  }

  const accessState = await founderAccess(identity);
  if (accessState.state === 'error') {
    res.status(500).json({ error: 'Founder allowlist check failed' });
    return null;
  }
  if (accessState.state === 'denied') {
    res.status(403).json({ error: 'Not on the founder allowlist' });
    return null;
  }

  if (!allowWorkspaceOwner && accessState.access.role !== 'platform_owner') {
    res.status(403).json({ error: 'This route requires platform founder authority' });
    return null;
  }

  if (allowWorkspaceOwner && !accessState.access.workspaceId) {
    res.status(503).json({ error: 'Founder workspace assignment is required' });
    return null;
  }

  if (refreshedSession) {
    try {
      await rotateFounderSession(req, res, refreshedSession);
    } catch {
      res.status(503).json({ error: 'Founder browser session rotation failed' });
      return null;
    }
  }

  return founderIdentity(identity, accessState.access);
}

/**
 * Legacy/global Founder Control Room routes remain platform-owner-only.
 *
 * This is the fail-closed tenant boundary: adding a workspace_owner to the
 * allowlist does not grant access to existing service-role routes that have
 * not yet been made explicitly workspace-aware.
 */
export async function requireFounder(
  req: FounderRequest,
  res: Response,
  next: NextFunction,
) {
  const founder = await authorizeFounderRequest(req, res, false);
  if (!founder) return;
  req.founder = founder;
  next();
}

/**
 * Workspace-scoped routes may admit either the platform owner or a tenant
 * workspace owner, but only after a concrete workspace assignment exists.
 * Every route using this middleware must still filter service-role queries by
 * req.founder.workspaceId.
 */
export async function requireWorkspaceUser(
  req: FounderRequest,
  res: Response,
  next: NextFunction,
) {
  const founder = await authorizeFounderRequest(req, res, true);
  if (!founder) return;
  req.founder = founder;
  next();
}

/**
 * High-consequence interactive founder decisions remain platform-owner-only.
 * An Authorization bearer header is deliberately ignored here, so bearer
 * automation cannot borrow a browser session as proof of a current founder
 * interaction.
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

  const accessState = await founderAccess(identity);
  if (accessState.state === 'error') {
    return res.status(500).json({ error: 'Founder allowlist check failed' });
  }
  if (accessState.state === 'denied') {
    return res.status(403).json({ error: 'Not on the founder allowlist' });
  }
  if (accessState.access.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Interactive platform founder authority required' });
  }

  req.founder = founderIdentity(identity, accessState.access);
  next();
}
