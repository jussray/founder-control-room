import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Session } from '@supabase/supabase-js';
import { createSupabaseAuthClient, supabaseAuth } from '../../lib/supabaseAuthClient.js';
import { supabase } from '../../lib/supabaseClient.js';
import { clearFounderSession, readFounderSession, revokeFounderSession, rotateFounderSession } from '../../auth/founderSession.js';
import { clearMemberSession, revokeMemberSession } from '../../auth/memberSession.js';
import { respondError, respondSuccess } from '../apiResponse.js';
import { FOUNDER_API_URL, rateLimitMagicLink } from '../middleware/security.js';
import { requireSameOriginBrowserMutation } from '../middleware/csrf.js';
import { authenticatedIdentity, founderAllowlisted, requireFounder, requireInteractiveFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { founderCallbackHtml } from './onboarding.js';
import { oauthConsentRouter } from './oauthConsent.js';

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
const rateLimitFounderInvite = rateLimit({
  windowMs: 60 * 60 * 1_000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many founder enrollment attempts. Try again later.' },
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
  // Send founder links only for pre-provisioned accounts; never provision from a login request.
  const { data, error } = await supabase.from('founder_users')
    .select('user_id').eq('email', email).maybeSingle();
  if (error) throw new Error('Founder allowlist check failed');
  return Boolean(data?.user_id);
}
async function isAuthorizedFounder(user: unknown): Promise<boolean> {
  const identity = authenticatedIdentity(user);
  if (!identity) return false;
  const result = await founderAllowlisted(identity);
  if (result === 'error') throw new Error('Founder allowlist check failed');
  return result === 'allowed';
}
function sessionWithVerifiedUser(session: Session, user: Session['user']): Session { return { ...session, user }; }
async function establishFounderSession(req: Request, res: Response, session: Session): Promise<boolean> {
  try {
    // Switching back to founder must retire the browser's previous member identity.
    if (!(await revokeMemberSession(req))) return false;
    await rotateFounderSession(req, res, session);
    clearMemberSession(res);
    return true;
  }
  catch (error) {
    console.error('Founder browser session persistence failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

// Consent decisions require the existing interactive founder browser session.
authRouter.use('/oauth', oauthConsentRouter);

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
      const { error } = await supabaseAuth.auth.signInWithOtp({ email, options: { emailRedirectTo: `${FOUNDER_API_URL}/auth/callback`, shouldCreateUser: false } });
      if (error) console.error('signInWithOtp failed:', error.message);
    }
  } catch (error) { console.error('Founder magic-link request failed:', error instanceof Error ? error.message : String(error)); }
  return respondSuccess(res, { message: GENERIC_MAGIC_LINK_MESSAGE }, 202);
});

// Only an already authenticated founder may enroll a preapproved, unbound address.
// This endpoint sends an invite only when explicitly invoked. A new account receives
// no founder authority until its Supabase email is confirmed and its UUID is bound.
authRouter.post('/founder/invite', rateLimitFounderInvite, (req, res, next) => {
  // Never let an Authorization header opt a founder-only browser mutation out
  // of its strict origin check, even if an attacker also supplies cookies.
  if (req.get('Authorization')) {
    return respondError(res, 400, 'BAD_REQUEST', 'Use the interactive founder browser session.');
  }
  next();
}, requireSameOriginBrowserMutation, requireInteractiveFounder, async (req: FounderRequest, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const email = normalizeEmail(req.body?.email);
  if (!email || email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
    return respondError(res, 400, 'BAD_REQUEST', 'A valid email is required.');
  }
  try {
    const { data: allowRow, error: lookupError } = await supabase
      .from('founder_users').select('email,user_id').eq('email', email).maybeSingle();
    if (lookupError) return respondError(res, 503, 'AUTHORIZATION_UNAVAILABLE', 'Founder enrollment unavailable.');
    if (!allowRow) return respondError(res, 403, 'FORBIDDEN', 'Address has not been approved for founder enrollment.');
    if (allowRow.user_id) return respondError(res, 409, 'ALREADY_BOUND', 'Founder account is already linked.');

    const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${FOUNDER_API_URL}/auth/callback`,
    });
    const userId = invited?.user?.id;
    if (inviteError || !userId || normalizeEmail(invited?.user?.email) !== email) {
      return respondError(res, 503, 'INVITE_UNAVAILABLE', 'Invitation could not be confirmed.');
    }
    const { data: bound, error: bindError } = await supabase.from('founder_users')
      .update({ user_id: userId }).eq('email', email).is('user_id', null)
      .select('user_id').maybeSingle();
    if (bindError || bound?.user_id !== userId) {
      // A sent invite without a successful binding cannot pass founder authorization.
      return respondError(res, 503, 'BINDING_UNAVAILABLE', 'Invitation sent but founder enrollment requires review.');
    }
    return respondSuccess(res, { status: 'invited_pending_email_verification' }, 202);
  } catch {
    return respondError(res, 503, 'ENROLLMENT_UNAVAILABLE', 'Founder enrollment unavailable.');
  }
});

authRouter.get('/callback', rateLimitFounderOAuth, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const tokenHash = typeof req.query.token_hash === 'string' ? req.query.token_hash : null;
  const type = req.query.type === 'invite' ? 'invite'
    : req.query.type === 'email' ? 'email' : 'magiclink';
  if (!tokenHash) return res.status(200).type('html').send(founderCallbackHtml());

  const requestAuth = createSupabaseAuthClient();
  const { data, error } = await requestAuth.auth.verifyOtp({ token_hash: tokenHash, type });
  const verifiedUser = data.user;
  const email = normalizeEmail(verifiedUser?.email);
  if (error || !data.session || !verifiedUser || !email || !(await isAuthorizedFounder(verifiedUser))) {
    return res.status(401).type('html').send(founderCallbackHtml());
  }

  const founderSession = sessionWithVerifiedUser(data.session, verifiedUser);
  if (!(await establishFounderSession(req, res, founderSession))) {
    return res.status(503).type('html').send(founderCallbackHtml());
  }

  // The opaque HttpOnly founder capability is now the only browser session handoff.
  // Do not duplicate Supabase access/refresh credentials into a URL fragment.
  return res.redirect(303, '/');
});

authRouter.post('/session', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const accessToken = typeof req.body?.access_token === 'string' ? req.body.access_token : '';
  const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';
  if (!accessToken || !refreshToken || accessToken.length > 16_384 || refreshToken.length > 16_384) {
    return respondError(res, 400, 'BAD_REQUEST', 'Session credentials are missing or malformed.');
  }

  const requestAuth = createSupabaseAuthClient();
  const { data, error } = await requestAuth.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  const verifiedUser = data.user;
  const email = normalizeEmail(verifiedUser?.email);
  if (error || !data.session || !verifiedUser || !email) {
    return respondError(res, 401, 'UNAUTHENTICATED', 'The login link is invalid or expired.');
  }
  if (!(await isAuthorizedFounder(verifiedUser))) return respondError(res, 403, 'FORBIDDEN', 'Not on the founder allowlist.');
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
  if (!(await isAuthorizedFounder(verifiedUser))) { clearFounderSession(res); return respondError(res, 403, 'FORBIDDEN', 'Not on the founder allowlist.'); }

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
  if (!(await revokeMemberSession(req))) return respondError(res, 503, 'SESSION_REVOCATION_FAILED', 'Member session could not be revoked.');
  clearFounderSession(res);
  clearMemberSession(res);
  return res.status(204).end();
});
