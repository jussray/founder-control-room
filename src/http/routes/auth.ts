import { Router } from 'express';
import {
  createSupabaseAuthClient,
  supabaseAuth,
} from '../../lib/supabaseAuthClient.js';
import { supabase } from '../../lib/supabaseClient.js';
import {
  clearFounderSession,
  writeFounderSession,
} from '../../auth/founderSession.js';
import { FOUNDER_API_URL, rateLimitMagicLink } from '../middleware/security.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { founderCallbackHtml } from './onboarding.js';

export const authRouter = Router();

const GENERIC_MAGIC_LINK_MESSAGE =
  'If this email is on the founder allowlist, a secure login link has been sent.';

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
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
 * Supabase's standard implicit magic-link flow returns credentials in the URL
 * fragment, which never reaches the server. This page loads a same-origin
 * module that posts those one-time credentials to POST /auth/session, where
 * they are verified and converted into an HttpOnly Control Room cookie.
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
  res.status(303).setHeader('Location', '/');
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

authRouter.post('/logout', (_req, res) => {
  clearFounderSession(res);
  return res.status(204).end();
});
