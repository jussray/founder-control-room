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

  if ((userError || !userData?.user?.email) && cookieSession?.refreshToken) {
    const requestAuth = createSupabaseAuthClient();
    const refreshed = await requestAuth.auth.refreshSession({
      refresh_token: cookieSession.refreshToken,
    });

    if (refreshed.data.session?.access_token && refreshed.data.user?.email) {
      writeFounderSession(res, refreshed.data.session);
      accessToken = refreshed.data.session.access_token;
      userData = { user: refreshed.data.user };
      userError = null;
    }
  }

  if (userError || !userData?.user?.email) {
    return res.status(401).json({ error: 'Invalid or expired founder session' });
  }

  const email = userData.user.email.trim().toLowerCase();
  const { data: allowRow, error: allowError } = await supabase
    .from('founder_users')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  if (allowError) {
    return res.status(500).json({ error: 'Founder allowlist check failed' });
  }
  if (!allowRow) {
    return res.status(403).json({ error: 'Not on the founder allowlist' });
  }

  req.founder = { email, userId: userData.user.id };
  next();
}
