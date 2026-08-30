import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Session } from '@supabase/supabase-js';
import { createSupabaseAuthClient, supabaseAuth } from '../../lib/supabaseAuthClient.js';
import { supabase } from '../../lib/supabaseClient.js';
import { clearFounderSession, readFounderSession, revokeFounderSession, rotateFounderSession, writeFounderSession } from '../../auth/founderSession.js';
import { respondError, respondSuccess } from '../apiResponse.js';
import { FOUNDER_API_URL, rateLimitMagicLink } from '../middleware/security.js';
import { requireFounder, requireInteractiveFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { founderCallbackHtml } from './onboarding.js';

export const authRouter = Router();
const GENERIC_MAGIC_LINK_MESSAGE = 'If this email is on the founder allowlist, a secure login link has been sent.';
const MIN_FOUNDER_PASSWORD_LENGTH = 12;
const rateLimitFounderOAuth = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});
const rateLimitFounderPassword = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password update attempts, please try again later.' },
});

function normalizeEmail(value: unknown): string { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function normalizePassword(value: unknown): string { return typeof value === 'string' ? value : ''; }
async function isAllowlisted(email: string): Promise<boolean> {
  const { data, error } = await supabase.from('founder_users').select('email').eq('email', email).maybeSingle();
  if (error) throw new Error('Founder allowlist check failed');
  return Boolean(data);
}
function sessionWithVerifiedUser(session: Session, user: Session['user']): Session { return { ...session, user }; }
async function establishFounderSession(req: Request, res: Response, session: Session): Promise<boolean> {
  try { await rotateFounderSession(req, res, session); return true; }
  catch (error) {
    console.error('Founder browser session persistence failed:', error instanceof Error ? error.message : String(error));
    clearFounderSession(res);
    return false;
  }
}

authRouter.get('/google', rateLimitFounderOAuth, async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { data, error } = await supabaseAuth.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${FOUNDER_API_URL}/auth/callback`, skipBrowserRedirect: true } });
    if (error || !data.url) { console.error('Google OAuth start failed:', error?.message ?? 'No redirect URL returned'); return respondError(res, 503, 'OAUTH_UNAVAILABLE', 'Google sign-in is temporarily unavailable.'); }
    return res.redirect(303, data.url);
  } catch (error) {
    console.error('Google OAuth start failed:', error instanceof Error ? error.message : String(error));
    return respondError(res, 503, 'OAUTH_UNAVAILABLE', 'Google sign-in is temporarily unavailable.');
  }
});

authRouter.post('/magic-link', rateLimitMagicLink, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email || !email.includes('@')) return respondError(res, 400, 'BAD_REQUEST', 'A valid email is required.');
  try {
    if (await isAllowlisted(email)) {
      const { error } = await supabaseAuth.auth.signInWithOtp({ email, options: { emailRedirectTo: `${FOUNDER_API_URL}/auth/callback`, shouldCreateUser: true } });
      if (error) console.error('signInWithOtp failed:', error.message);
    }
  } catch (error) { console.error('Founder magic-link request failed:', error instanceof Error ? error.message : String(error)); }
  return respondSuccess(res, { message: GENERIC_MAGIC_LINK_MESSAGE }, 202);
});

authRouter.get('/callback', rateLimitFounderOAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const tokenHash = typeof req.query.token_hash === 'string' ? req.query.token_hash : null;
  const type = typeof req.query.type === 'string' ? req.query.type : 'magiclink';
  if (!tokenHash) return res.status(200).type('html').send(founderCallbackHtml());

  const requestAuth = createSupabaseAuthClient();
  const { data, error } = await requestAuth.auth.verifyOtp({ token_hash: tokenHash, type: type as 'magiclink' | 'email' });
  const verifiedUser = data.user;
  const email = normalizeEmail(verifiedUser?.email);
  if (error || !data.session || !verifiedUser || !email || !(await isAllowlisted(email))) {
    clearFounderSession(res);
    return res.status(401).type('html').send(founderCallbackHtml());
  }

  const replaced = await revokeFounderSession(req, 'replaced');
  if (!replaced) { clearFounderSession(res); return res.status(503).type('html').send(founderCallbackHtml()); }
  const founderSession = sessionWithVerifiedUser(data.session, verifiedUser);
  try { await writeFounderSession(res, founderSession); }
  catch (sessionError) {
    console.error('Founder browser session persistence failed:', sessionError instanceof Error ? sessionError.message : String(sessionError));
    clearFounderSession(res);
    return res.status(503).type('html').send(founderCallbackHtml());
  }

  // The opaque HttpOnly founder capability is now the only browser session handoff.
  // Do not duplicate Supabase access/refresh credentials into a URL fragment.
  return res.redirect(303, '/');
});

authRouter.post('/session', async (req, res) => {
  const accessToken = typeof req.body?.access_token === 'string' ? req.body.access_token : '';
  const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';
  if (!accessToken || !refreshToken || accessToken.length > 16_384 || refreshToken.length > 16_384) {
    clearFounderSession(res);
    return respondError(res, 400, 'BAD_REQUEST', 'Session credentials are missing or malformed.');
  }

  const requestAuth = createSupabaseAuthClient();
  const { data, error } = await requestAuth.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  const verifiedUser = data.user;
  const email = normalizeEmail(verifiedUser?.email);
  if (error || !data.session || !verifiedUser || !email) {
    clearFounderSession(res);
    return respondError(res, 401, 'UNAUTHENTICATED', 'The login link is invalid or expired.');
  }
  if (!(await isAllowlisted(email))) { clearFounderSession(res); return respondError(res, 403, 'FORBIDDEN', 'Not on the founder allowlist.'); }
  const founderSession = sessionWithVerifiedUser(data.session, verifiedUser);
  if (!(await establishFounderSession(req, res, founderSession))) return respondError(res, 503, 'SESSION_UNAVAILABLE', 'Founder browser session storage is temporarily unavailable.');
  return respondSuccess(res, { founder: { email } }, 201);
});

authRouter.get('/me', requireFounder, (req: FounderRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return respondSuccess(res, { founder: req.founder });
});

authRouter.post('/password', rateLimitFounderPassword, requireInteractiveFounder, async (req: FounderRequest, res) => {
  const password = normalizePassword(req.body?.password);
  const confirmPassword = normalizePassword(req.body?.confirmPassword);
  if (password.length < MIN_FOUNDER_PASSWORD_LENGTH) return respondError(res, 400, 'BAD_REQUEST', `Password must be at least ${MIN_FOUNDER_PASSWORD_LENGTH} characters.`);
  if (confirmPassword && confirmPassword !== password) return respondError(res, 400, 'BAD_REQUEST', 'Passwords do not match.');

  const cookieSession = await readFounderSession(req);
  if (!cookieSession) { clearFounderSession(res); return respondError(res, 401, 'UNAUTHENTICATED', 'Browser founder session required.'); }
  const requestAuth = createSupabaseAuthClient();
  const { data: sessionData, error: sessionError } = await requestAuth.auth.setSession({ access_token: cookieSession.accessToken, refresh_token: cookieSession.refreshToken });
  const verifiedUser = sessionData.user;
  const email = normalizeEmail(verifiedUser?.email);
  if (sessionError || !sessionData.session || !verifiedUser || !email || email !== req.founder?.email) {
    clearFounderSession(res);
    return respondError(res, 401, 'UNAUTHENTICATED', 'Founder session could not be verified.');
  }
  if (!(await isAllowlisted(email))) { clearFounderSession(res); return respondError(res, 403, 'FORBIDDEN', 'Not on the founder allowlist.'); }

  const { error: updateError } = await requestAuth.auth.updateUser({ password });
  if (updateError) { console.warn('Founder credential update failed:', updateError.message); return respondError(res, 400, 'PASSWORD_UPDATE_FAILED', 'The password could not be updated.'); }
  const { data: refreshed } = await requestAuth.auth.getSession();
  if (refreshed.session) {
    const refreshedUser = refreshed.session.user ?? verifiedUser;
    if (!(await establishFounderSession(req, res, sessionWithVerifiedUser(refreshed.session, refreshedUser)))) return respondError(res, 503, 'SESSION_UNAVAILABLE', 'Founder browser session storage is temporarily unavailable.');
  }
  return respondSuccess(res, { message: 'Founder password updated.' });
});

authRouter.post('/logout', async (req, res) => {
  const revoked = await revokeFounderSession(req, 'logout');
  if (!revoked) return respondError(res, 503, 'SESSION_REVOCATION_FAILED', 'Founder browser session could not be revoked.');
  clearFounderSession(res);
  return res.status(204).end();
});
