import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createSupabaseAuthClient, supabaseAuth } from '../../lib/supabaseAuthClient.js';
import { supabase } from '../../lib/supabaseClient.js';
import { clearMemberSession, readMemberSession, revokeMemberSession, writeMemberSession } from '../../auth/memberSession.js';
import { clearFounderSession, revokeFounderSession } from '../../auth/founderSession.js';
import { respondError, respondSuccess } from '../apiResponse.js';
import { FOUNDER_API_URL, rateLimitMagicLink } from '../middleware/security.js';
import { onboardingContentSecurityPolicy } from '../middleware/onboardingSecurity.js';
import { memberProjectsRouter } from './memberProjects.js';

export const memberAuthRouter = Router();
memberAuthRouter.use('/projects', memberProjectsRouter);
const callbackThrottle = rateLimit({
  windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false,
});
const sessionThrottle = rateLimit({
  windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
});
const GENERIC = 'If this address can receive mail, a secure sign-in link may arrive.';
// The authenticated browser session must be set on the Pages origin, not the API subdomain.
const MEMBER_CALLBACK_ORIGIN = process.env.NODE_ENV === 'production'
  ? 'https://foundercontrolroom.org' : FOUNDER_API_URL;
// Email validation is bounded and linear even for attacker-controlled inputs.
function validMemberEmail(email: string): boolean {
  if (!email || email.length > 254 || /\s/u.test(email)) return false;
  const at = email.indexOf('@');
  const lastDot = email.lastIndexOf('.');
  return at > 0 && at === email.lastIndexOf('@') &&
    lastDot > at + 1 && lastDot < email.length - 1;
}

function emailFrom(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
async function isFounder(email: string): Promise<boolean> {
  const { data, error } = await supabase.from('founder_users')
    .select('email').eq('email', email).maybeSingle();
  if (error) throw new Error('Founder identity boundary unavailable');
  return Boolean(data);
}
function verifiedIdentity(value: unknown): { userId: string; email: string } | null {
  if (!value || typeof value !== 'object') return null;
  const user = value as { id?: unknown; email?: unknown };
  const userId = typeof user.id === 'string' ? user.id : '';
  const email = emailFrom(user.email);
  return userId && validMemberEmail(email) ? { userId, email } : null;
}

async function establishMemberSession(req: import('express').Request, res: import('express').Response, identity: {userId: string; email: string}): Promise<void> {
  // Verified account-switching must not leave an older founder capability active.
  if (!(await revokeFounderSession(req, 'member_account_switch'))) throw new Error('Founder session revocation failed');
  if (!(await revokeMemberSession(req))) throw new Error('Previous member session revocation failed');
  clearFounderSession(res);
  await writeMemberSession(res, identity);
}

const callbackHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Member sign-in | Founder Control Room</title><link rel="stylesheet" href="/assets/control-room.css"><script type="module" src="/auth/member/callback.js"></script></head><body><main class="shell callback"><section class="panel"><p class="eyebrow">Member account</p><h1 id="callback-title">Completing secure sign-in</h1><p id="callback-message">Verifying your session.</p><a id="callback-return" href="/welcome" hidden>Back to welcome</a></section></main></body></html>';

const callbackJs = String.raw`const title=document.getElementById('callback-title');
const message=document.getElementById('callback-message');
const back=document.getElementById('callback-return');
function fail(){title.textContent='Sign-in could not be completed';message.textContent='The link is invalid, expired or the service is unavailable. Please request a new one.';back.hidden=false;history.replaceState(null,'','/auth/member/callback')}
const fragment=new URLSearchParams(location.hash.slice(1));
if(new URLSearchParams(location.search).has('error')||fragment.has('error')){fail()}
else{const access=fragment.get('access_token'),refresh=fragment.get('refresh_token');
if(!access||!refresh){fail()}
else{try{const response=await fetch('/auth/member/session',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({access_token:access,refresh_token:refresh})});
history.replaceState(null,'','/auth/member/callback');if(!response.ok)throw Error('member session rejected');
location.replace('/member/')}catch{fail()}}}
`;

memberAuthRouter.post('/magic-link', rateLimitMagicLink, async (req, res) => {
  const email = emailFrom(req.body?.email);
  if (!validMemberEmail(email)) {
    return respondError(res, 400, 'BAD_REQUEST', 'A valid email is required.');
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    // This is a separate customer login, not a change to the founder allowlist.
    // Founder addresses keep their existing founder-only login flow.
    if (!(await isFounder(email))) {
      const { error } = await supabaseAuth.auth.signInWithOtp({
        email, options: {
          emailRedirectTo: MEMBER_CALLBACK_ORIGIN + '/auth/member/callback',
          shouldCreateUser: true,
        },
      });
      if (error) {
        // Keep the response indistinguishable for both known and unknown addresses.
        // Provider delivery diagnostics belong in server-side telemetry, never the browser.
      }
    }
  } catch {
    // Generic response prevents discovering whether a founder email exists.
  }
  return respondSuccess(res, { message: GENERIC }, 202);
});

memberAuthRouter.get('/callback.js', onboardingContentSecurityPolicy, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.type('text/javascript').send(callbackJs);
});

memberAuthRouter.get('/callback', callbackThrottle, onboardingContentSecurityPolicy, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const tokenHash = typeof req.query.token_hash === 'string' ? req.query.token_hash : '';
  if (!tokenHash) return res.type('html').send(callbackHtml);
  const type = req.query.type === 'email' ? 'email' : 'magiclink';
  try {
    const { data, error } = await createSupabaseAuthClient().auth.verifyOtp({
      token_hash: tokenHash, type,
    });
    const identity = verifiedIdentity(data.user);
    if (error || !data.session || !identity) {
      return respondError(res, 401, 'UNAUTHENTICATED', 'Sign-in link invalid or expired.');
    }
    if (await isFounder(identity.email)) {
      return respondError(res, 403, 'FORBIDDEN', 'Use founder sign-in for this account.');
    }
    await establishMemberSession(req, res, identity);
    return res.redirect(303, '/member/');
  } catch {
    return respondError(res, 503, 'SESSION_UNAVAILABLE', 'Member session unavailable.');
  }
});

memberAuthRouter.post('/session', sessionThrottle, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const accessToken = typeof req.body?.access_token === 'string' ? req.body.access_token : '';
  const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';
  if (!accessToken || !refreshToken || accessToken.length > 16384 || refreshToken.length > 16384) {
    return respondError(res, 400, 'BAD_REQUEST', 'Session credentials are missing or malformed.');
  }
  try {
    const { data, error } = await createSupabaseAuthClient().auth.setSession({
      access_token: accessToken, refresh_token: refreshToken,
    });
    const identity = verifiedIdentity(data.user);
    if (error || !data.session || !identity) {
      return respondError(res, 401, 'UNAUTHENTICATED', 'Sign-in session invalid or expired.');
    }
    if (await isFounder(identity.email)) {
      return respondError(res, 403, 'FORBIDDEN', 'Use founder sign-in for this account.');
    }
    await establishMemberSession(req, res, identity);
    return respondSuccess(res, { member: identity }, 201);
  } catch {
    return respondError(res, 503, 'SESSION_UNAVAILABLE', 'Member session unavailable.');
  }
});

memberAuthRouter.get('/me', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const identity = await readMemberSession(req);
  if (!identity) return respondError(res, 401, 'UNAUTHENTICATED', 'Member sign-in required.');
  try {
    if (await isFounder(identity.email)) {
      return respondError(res, 403, 'FORBIDDEN', 'Founder account must use the founder workspace.');
    }
  } catch {
    return respondError(res, 503, 'AUTHORIZATION_UNAVAILABLE', 'Member identity check unavailable.');
  }
  // Deliberately no founder project/agent/receipt queries and no user seed data.
  return respondSuccess(res, { member: identity, workspace: { projects: [], agents: [], activity: [] } });
});

memberAuthRouter.post('/logout', async (req, res) => {
  const revoked = await revokeMemberSession(req);
  if (!revoked) return respondError(res, 503, 'SESSION_REVOCATION_FAILED', 'Member session could not be revoked.');
  if (!(await revokeFounderSession(req, 'member_logout'))) return respondError(res, 503, 'SESSION_REVOCATION_FAILED', 'Founder session could not be revoked.');
  clearFounderSession(res);
  clearMemberSession(res);
  return res.status(204).end();
});
