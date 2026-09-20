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

export interface FounderRequest extends Request {
  founder?: { email: string; userId: string };
}

interface AuthenticatedIdentity {
  email: string;
  userId: string;
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

async function founderAllowlisted(identity: AuthenticatedIdentity): Promise<'allowed' | 'denied' | 'error'> {
  const { data: allowRow, error: allowError } = await supabase
    .from('founder_users')
    .select('email')
    .eq('email', identity.email)
    .maybeSingle();

  if (allowError) return 'error';
  return allowRow ? 'allowed' : 'denied';
}

/**
 * Founder authorization has two independent gates:
 *
 * 1. A valid Supabase Auth session, supplied either as a Bearer token for API
 *    clients or resolved server-side from the opaque HttpOnly Control Room
 *    browser session capability.
 * 2. The authenticated email must still exist in the service-role-only
 *    `founder_users` allowlist.
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
