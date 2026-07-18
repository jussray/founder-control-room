import { Router } from 'express';
import { supabaseAuth } from '../../lib/supabaseAuthClient.js';
import { supabase } from '../../lib/supabaseClient.js';
import { FOUNDER_API_URL } from '../middleware/security.js';

export const authRouter = Router();

/**
 * POST /auth/magic-link
 * Body: { "email": "founder@example.com" }
 *
 * Sends a Supabase magic link to `email`, but only if it's on the founder
 * allowlist. Responds with the same generic message either way so this
 * endpoint can't be used to probe which emails are founders.
 *
 * emailRedirectTo uses FOUNDER_API_URL (this backend's own public URL) so
 * the magic-link callback hits /auth/callback on this server — not the
 * frontend. Keep FOUNDER_API_URL and FOUNDER_ALLOWED_ORIGINS separate.
 */
authRouter.post('/magic-link', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  const { data: allowRow } = await supabase
    .from('founder_users')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  if (allowRow) {
    const { error } = await supabaseAuth.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${FOUNDER_API_URL}/auth/callback`,
      },
    });
    if (error) {
      console.error('signInWithOtp failed:', error.message);
    }
  }

  return res.status(202).json({
    message: 'If this email is on the founder allowlist, a magic link has been sent.',
  });
});

/**
 * GET /auth/callback?token_hash=...&type=magiclink
 *
 * The founder's mail client hits this after clicking the emailed link.
 *
 * Default response is a redirect to the Control Room frontend
 * (`/control-room/`) with the session in the URL fragment — a fragment is
 * never sent to the server (no log/referrer leakage) and the static SPA
 * reads it client-side, stores it, and strips it from the address bar.
 * Pass `?format=json` or `Accept: application/json` to get the session as
 * JSON instead, for non-browser callers.
 */
authRouter.get('/callback', async (req, res) => {
  const tokenHash = typeof req.query.token_hash === 'string' ? req.query.token_hash : null;
  const type = typeof req.query.type === 'string' ? req.query.type : 'magiclink';
  const wantsJson = req.query.format === 'json' || (req.get('accept')?.includes('application/json') ?? false);

  if (!tokenHash) {
    return res.status(400).json({ error: 'token_hash is required' });
  }

  const { data, error } = await supabaseAuth.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as 'magiclink' | 'email',
  });

  if (error || !data.session || !data.user?.email) {
    return res.status(401).json({ error: error?.message ?? 'Verification failed' });
  }

  // Defense in depth: re-check the allowlist even though only allowlisted
  // emails were ever sent a link.
  const { data: allowRow } = await supabase
    .from('founder_users')
    .select('email')
    .eq('email', data.user.email)
    .maybeSingle();

  if (!allowRow) {
    await supabaseAuth.auth.signOut();
    return res.status(403).json({ error: 'Not on the founder allowlist' });
  }

  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    founder: { email: data.user.email },
  };

  if (wantsJson) {
    return res.json(session);
  }

  const fragment = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: String(session.expires_at ?? ''),
    email: session.founder.email,
  }).toString();

  return res.redirect(302, `/control-room/#${fragment}`);
});
