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
export interface FounderIdentity extends AuthenticatedIdentity {
  role?: FounderAccountRole;
  workspaceId?: string | null;
}
export interface FounderRequest extends Request {
  founder?: FounderIdentity;
}

export interface AuthenticatedIdentity {
  email: string;
  userId: string;
}

export function authenticatedIdentity(user: unknown): AuthenticatedIdentity | null {
  if (!user || typeof user !== 'object' || Array.isArray(user)) return null;
  const record = user as Record<string, unknown>;
  const email = typeof record.email === 'string'
    ? record.email.trim().toLowerCase()
    : '';
  const userId = typeof record.id === 'string' ? record.id.trim() : '';
  // Founder identity requires Supabase-confirmed ownership, not just a typed address.
  const confirmed = typeof record.email_confirmed_at === 'string' && record.email_confirmed_at.length > 0;
  return email && userId && confirmed ? { email, userId } : null;
}

export async function founderAllowlisted(identity: AuthenticatedIdentity): Promise<'allowed' | 'denied' | 'error'> {
  const { data: allowRow, error: allowError } = await supabase
    .from('founder_users')
    .select('*')
    .eq('email', identity.email)
    .eq('user_id', identity.userId)
    .maybeSingle();

  if (allowError) return 'error';
  if (!allowRow || allowRow.user_id !== identity.userId) return 'denied';
  const row = allowRow as Record<string, unknown>;
  if (typeof row.email === 'string' && row.email.trim().toLowerCase() !== identity.email) return 'denied';
  // Before the workspace migration, role is absent on the pre-provisioned
  // platform founder row. After migration, only explicit platform_owner is valid.
  if (Object.prototype.hasOwnProperty.call(row, 'account_role') && row.account_role !== 'platform_owner') {
    return 'denied';
  }
  return 'allowed';
}

/**
 * Founder authorization has two independent gates:
 *
 * 1. A valid Supabase Auth session, supplied either as a Bearer token for API
 *    clients or resolved server-side from the opaque HttpOnly Control Room
 *    browser session capability.
 * 2. The verified Supabase user ID and email must match the same server-only
 *    `founder_users` row. An unbound founder email grants no authority.
 *
 * Cookie sessions may refresh once with their server-held refresh token. A
 * successful refresh rotates the opaque browser capability; Bearer sessions
 * never receive implicit refresh behavior so automated clients remain explicit.
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

/**
 * Workspace membership is separate from platform founder authority.
 * The legacy global routes continue to call requireFounder, which refuses
 * workspace_owner rows even when they are verified.
 */
export async function requireWorkspaceUser(
  req: FounderRequest,
  res: Response,
  next: NextFunction,
) {
  const explicitBearer = bearerToken(req);
  const cookieSession = explicitBearer ? null : await readFounderSession(req);
  let accessToken = explicitBearer ?? cookieSession?.accessToken ?? null;
  if (!accessToken) return res.status(401).json({ error: 'Workspace session required' });

  let { data: userData, error: userError } = await supabaseAuth.auth.getUser(accessToken);
  let identity = authenticatedIdentity(userData?.user);
  let refreshedSession: Session | null = null;
  if ((userError || !identity) && cookieSession?.refreshToken) {
    const client = createSupabaseAuthClient();
    const refreshed = await client.auth.refreshSession({ refresh_token: cookieSession.refreshToken });
    const confirmed = authenticatedIdentity(refreshed.data.user);
    if (refreshed.data.session?.access_token && confirmed) {
      userData = { user: refreshed.data.user };
      userError = null;
      identity = confirmed;
      refreshedSession = refreshed.data.session;
      accessToken = refreshedSession.access_token;
    }
  }
  if (userError || !identity) return res.status(401).json({ error: 'Invalid or unconfirmed workspace session' });

  const { data, error } = await supabase.from('founder_users')
    .select('*').eq('email', identity.email).eq('user_id', identity.userId).maybeSingle();
  if (error) return res.status(503).json({ error: 'Workspace membership lookup unavailable' });
  const row = data as Record<string, unknown> | null;
  if (!row || row.user_id !== identity.userId ||
      typeof row.email !== 'string' || row.email.trim().toLowerCase() !== identity.email) {
    return res.status(403).json({ error: 'Workspace membership required' });
  }
  if (row.account_role !== 'platform_owner' && row.account_role !== 'workspace_owner') {
    return res.status(403).json({ error: 'Invalid workspace role' });
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const workspaceId = typeof row.workspace_id === 'string' ? row.workspace_id.trim() : '';
  if (!uuid.test(workspaceId)) return res.status(503).json({ error: 'Workspace assignment unavailable' });
  if (refreshedSession) {
    try { await rotateFounderSession(req, res, refreshedSession); }
    catch { return res.status(503).json({ error: 'Workspace session rotation failed' }); }
  }
  req.founder = { ...identity, role: row.account_role, workspaceId };
  next();
}
