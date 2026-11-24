import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Session } from '@supabase/supabase-js';
import { supabaseAuth, createSupabaseAuthClient } from '../../lib/supabaseAuthClient.js';
import { supabase } from '../../lib/supabaseClient.js';
import { rotateFounderSession } from '../../auth/founderSession.js';
import { clearMemberSession, revokeMemberSession } from '../../auth/memberSession.js';
import { respondError, respondSuccess } from '../apiResponse.js';
import { FOUNDER_API_URL, rateLimitMagicLink } from '../middleware/security.js';
import { workspaceFounderCallbackHtml } from './onboarding.js';

export const workspaceAuthRouter = Router();
const attempts = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many workspace sign-in attempts.' },
});
const MESSAGE = 'If this email can receive a secure sign-in link, check your inbox.';
type ProvisioningResult =
  | { state: 'ok'; founder: { email: string; userId: string; role: 'workspace_owner'; workspaceId: string } }
  | { state: 'forbidden' }
  | { state: 'error' };

function emailOf(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function provisionWorkspaceFounder(user: Session['user'] | null | undefined): Promise<ProvisioningResult> {
  const userId = typeof user?.id === 'string' ? user.id.trim() : '';
  const email = emailOf(user?.email);
  if (!userId || !email || typeof user?.email_confirmed_at !== 'string' || !user.email_confirmed_at) {
    return { state: 'forbidden' };
  }
  const { data, error } = await supabase.rpc('provision_workspace_founder', {
    p_user_id: userId, p_email: email,
  });
  if (error) return { state: error.code === '42501' ? 'forbidden' : 'error' };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { state: 'error' };
  const row = data as Record<string, unknown>;
  const workspaceId = typeof row.workspace_id === 'string' ? row.workspace_id : '';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (row.account_role !== 'workspace_owner' || row.user_id !== userId ||
      emailOf(row.email) !== email || !uuid.test(workspaceId)) return { state: 'error' };
  return { state: 'ok', founder: { email, userId, workspaceId, role: 'workspace_owner' } };
}

async function establishWorkspaceSession(req: Request, res: Response, session: Session): Promise<boolean> {
  try {
    // Switching from a member account must revoke the previous browser identity.
    if (!(await revokeMemberSession(req))) return false;
    await rotateFounderSession(req, res, session);
    clearMemberSession(res);
    return true;
  } catch { return false; }
}

workspaceAuthRouter.get('/google', attempts, async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const { data, error } = await supabaseAuth.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${FOUNDER_API_URL}/auth/workspace/callback`, skipBrowserRedirect: true },
    });
    if (error || !data.url) return respondError(res, 503, 'OAUTH_UNAVAILABLE', 'Workspace sign-in unavailable.');
    return res.redirect(303, data.url);
  } catch {
    return respondError(res, 503, 'OAUTH_UNAVAILABLE', 'Workspace sign-in unavailable.');
  }
});

workspaceAuthRouter.post('/magic-link', rateLimitMagicLink, async (req, res) => {
  const email = emailOf(req.body?.email);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respondError(res, 400, 'BAD_REQUEST', 'A valid email is required.');
  }
  try {
    await supabaseAuth.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${FOUNDER_API_URL}/auth/workspace/callback`, shouldCreateUser: true },
    });
  } catch { /* Avoid account enumeration; public response is uniform. */ }
  return respondSuccess(res, { message: MESSAGE }, 202);
});

workspaceAuthRouter.get('/callback', attempts, async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const tokenHash = typeof req.query.token_hash === 'string' ? req.query.token_hash : null;
  const type = req.query.type === 'email' ? 'email' : 'magiclink';
  if (!tokenHash) return res.status(200).type('html').send(workspaceFounderCallbackHtml());
  const client = createSupabaseAuthClient();
  const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.session || !data.user) {
    return res.status(401).type('html').send(workspaceFounderCallbackHtml());
  }
  const provisioned = await provisionWorkspaceFounder(data.user);
  if (provisioned.state !== 'ok') {
    return res.status(provisioned.state === 'forbidden' ? 403 : 503).type('html').send(workspaceFounderCallbackHtml());
  }
  if (!(await establishWorkspaceSession(req, res, { ...data.session, user: data.user }))) {
    return res.status(503).type('html').send(workspaceFounderCallbackHtml());
  }
  return res.redirect(303, '/app/');
});

workspaceAuthRouter.post('/session', attempts, async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const accessToken = typeof req.body?.access_token === 'string' ? req.body.access_token : '';
  const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';
  if (!accessToken || !refreshToken || accessToken.length > 16384 || refreshToken.length > 16384) {
    return respondError(res, 400, 'BAD_REQUEST', 'Session credentials missing or malformed.');
  }
  const client = createSupabaseAuthClient();
  const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    return respondError(res, 401, 'UNAUTHENTICATED', 'Login link is invalid or expired.');
  }
  const provisioned = await provisionWorkspaceFounder(data.user);
  if (provisioned.state !== 'ok') {
    return respondError(res, provisioned.state === 'forbidden' ? 403 : 503,
      'WORKSPACE_UNAVAILABLE', 'Workspace membership unavailable.');
  }
  if (!(await establishWorkspaceSession(req, res, { ...data.session, user: data.user }))) {
    return respondError(res, 503, 'SESSION_UNAVAILABLE', 'Workspace session storage unavailable.');
  }
  return respondSuccess(res, { founder: provisioned.founder }, 201);
});
