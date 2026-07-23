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
  writeFounderSession,
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

/**
 * Founder authorization has two independent gates:
 *
 * 1. A valid Supabase Auth session, supplied either as a Bearer token for API
 *    clients or as the HttpOnly Control Room browser session cookie.
 * 2. The authenticated email must still exist in the service-role-only
 *    `founder_users` allowlist.
 *
 * Cookie sessions may refresh once with their refresh token. Bearer sessions
 * never receive implicit refresh behavior so automated clients remain explicit.
 * A refreshed cookie is not written until the refreshed identity passes the
 * founder allowlist, preventing authenticated nonfounders from receiving a
 * renewed cookie labelled as a Founder Control Room session.
 */
export async function requireFounder(
  req: FounderRequest,
  res: Response,
  next: NextFunction,
) {
  const explicitBearer = bearerToken(req);
  const cookieSession = explicitBearer ? null : readFounderSession(req);
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

  const { data: allowRow, error: allowError } = await supabase
    .from('founder_users')
    .select('email')
    .eq('email', identity.email)
    .maybeSingle();

  if (allowError) {
    return res.status(500).json({ error: 'Founder allowlist check failed' });
  }
  if (!allowRow) {
    return res.status(403).json({ error: 'Not on the founder allowlist' });
  }

  if (refreshedSession) writeFounderSession(res, refreshedSession);

  req.founder = identity;
  next();
}
