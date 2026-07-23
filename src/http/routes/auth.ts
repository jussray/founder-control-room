import { Router } from 'express';
import {
  createSupabaseAuthClient,
  supabaseAuth,
} from '../../lib/supabaseAuthClient.js';
import { supabase } from '../../lib/supabaseClient.js';
import {
  clearFounderSession,
  readFounderSession,
  writeFounderSession,
} from '../../auth/founderSession.js';
import { FOUNDER_API_URL, rateLimitMagicLink } from '../middleware/security.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { founderCallbackHtml } from './onboarding.js';

export const authRouter = Router();

const GENERIC_MAGIC_LINK_MESSAGE =
  'If this email is on the founder allowlist, a secure login link has been sent.';

const MIN_FOUNDER_PASSWORD_LENGTH = 12;

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizePassword(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function isAllowlisted(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('founder_users')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  if (error) throw new Error('Founder allowlist check failed');
  return Boolean(data);
}

/**
 * Starts a Supabase-hosted Google OAuth flow. The callback still performs the
 * private founder allowlist check before issuing the Control Room cookie, so a
 * valid Google identity alone never grants founder authority.
 */
authRouter.get('/google', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const { data, error } = await supabaseAuth.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${FOUNDER_API_URL}/auth/callback`,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      console.error('Google OAuth start failed:', error?.message ?? 'No redirect URL returned');
      return res.status(503).json({ error: 'Google sign-in is temporarily unavailable' });
    }

    return res.redirect(303, data.url);
  } catch (error) {
    console.error(
      'Google OAuth start failed:',
      error instanceof Error ? error.message : String(error),
    );
    return res.status(503).json({ error: 'Google sign-in is temporarily unavailable' });
  }
});

/**
 * Sends a one-time Supabase link only to an allowlisted founder email. The
 * response remains generic so the endpoint cannot enumerate founder accounts.
 */
authRouter.post('/magic-link', rateLimitMagicLink, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  try {
    if (await isAllowlisted(email)) {
      const { error } = await supabaseAuth.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${FOUNDER_API_URL}/auth/callback`,
          shouldCreateUser: true,
        },
      });
      if (error) console.error('signInWithOtp failed:', error.message);
    }
  } catch (error) {
    console.error(
      'Founder magic-link request failed:',
      error instanceof Error ? error.message : String(error),
    );
  }

  return res.status(202).json({ message: GENERIC_MAGIC_LINK_MESSAGE });
});

/**
 * Supabase's standard implicit magic-link and OAuth flows return credentials in
 * the URL fragment, which never reaches the server. This page loads a
 * same-origin module that posts those one-time credentials to POST
 * /auth/session, where they are verified and converted into an HttpOnly Control
 * Room cookie.
 *
 * A token_hash query is also supported for custom Supabase email templates.
 */
authRouter.get('/callback', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const tokenHash = typeof req.query.token_hash === 'string' ? req.query.token_hash : null;
  const type = typeof req.query.type === 'string' ? req.query.type : 'magiclink';

  if (!tokenHash) {
    return res.status(200).type('html').send(founderCallbackHtml());
  }

  const requestAuth = createSupabaseAuthClient();
  const { data, error } = await requestAuth.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as 'magiclink' | 'email',
  });

  const email = normalizeEmail(data.user?.email);
  if (error || !data.session || !email || !(await isAllowlisted(email))) {
    clearFounderSession(res);
    return res.status(401).type('html').send(founderCallbackHtml());
  }

  writeFounderSession(res, data.session);

  // The founder dashboard SPA (public/control-room/app.js) keeps its own
  // Bearer-token session in sessionStorage, read from this redirect's URL
  // *fragment* (consumeHashSession()) — fragments never reach the server,
  // so this is the standard implicit-flow handoff, not a leak. The
  // HttpOnly cookie written above is a separate, same-origin session used
  // by the lightweight onboarding shell at '/'; both are kept in sync from
  // this one verified Supabase session.
  const fragment = new URLSearchParams({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token ?? '',
    expires_at: String(data.session.expires_at ?? ''),
    email,
  });
  res.status(303).setHeader('Location', `/control-room/#${fragment.toString()}`);
  return res.end();
});

/**
 * Exchanges the implicit-flow access and refresh tokens for one HttpOnly
 * browser session. Tokens are never returned to page JavaScript after this.
 */
authRouter.post('/session', async (req, res) => {
  const accessToken = typeof req.body?.access_token === 'string' ? req.body.access_token : '';
  const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';

  if (!accessToken || !refreshToken || accessToken.length > 16_384 || refreshToken.length > 16_384) {
    clearFounderSession(res);
    return res.status(400).json({ error: 'Session credentials are missing or malformed' });
  }

  const requestAuth = createSupabaseAuthClient();
  const { data, error } = await requestAuth.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const email = normalizeEmail(data.user?.email);
  if (error || !data.session || !email) {
    clearFounderSession(res);
    return res.status(401).json({ error: 'The login link is invalid or expired' });
  }

  if (!(await isAllowlisted(email))) {
    clearFounderSession(res);
    return res.status(403).json({ error: 'Not on the founder allowlist' });
  }

  writeFounderSession(res, data.session);
  return res.status(201).json({ ok: true, founder: { email } });
});

authRouter.get('/me', requireFounder, (req: FounderRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ founder: req.founder });
});

/**
 * Lets an authenticated founder claim password ownership after magic-link
 * onboarding. The password is never logged, returned, persisted outside
 * Supabase Auth, or accepted without an existing founder session cookie.
 */
authRouter.post('/password', requireFounder, async (req: FounderRequest, res) => {
  const password = normalizePassword(req.body?.password);
  const confirmPassword = normalizePassword(req.body?.confirmPassword);

  if (password.length < MIN_FOUNDER_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `Password must be at least ${MIN_FOUNDER_PASSWORD_LENGTH} characters.`,
    });
  }
  if (confirmPassword && confirmPassword !== password) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const cookieSession = readFounderSession(req);
  if (!cookieSession) {
    clearFounderSession(res);
    return res.status(401).json({ error: 'Browser founder session required' });
  }

  const requestAuth = createSupabaseAuthClient();
  const { data: sessionData, error: sessionError } = await requestAuth.auth.setSession({
    access_token: cookieSession.accessToken,
    refresh_token: cookieSession.refreshToken,
  });

  const email = normalizeEmail(sessionData.user?.email);
  if (sessionError || !sessionData.session || !email || email !== req.founder?.email) {
    clearFounderSession(res);
    return res.status(401).json({ error: 'Founder session could not be verified' });
  }
  if (!(await isAllowlisted(email))) {
    clearFounderSession(res);
    return res.status(403).json({ error: 'Not on the founder allowlist' });
  }

  const { error: updateError } = await requestAuth.auth.updateUser({ password });
  if (updateError) {
    return res.status(400).json({ error: updateError.message });
  }

  const { data: refreshed } = await requestAuth.auth.getSession();
  if (refreshed.session) writeFounderSession(res, refreshed.session);

  return res.status(200).json({ ok: true, message: 'Founder password updated.' });
});

authRouter.post('/logout', (_req, res) => {
  clearFounderSession(res);
  return res.status(204).end();
});
