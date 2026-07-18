import type { RequestHandler } from 'express';
import { hasFounderSessionCookie } from '../../auth/founderSession.js';
import { FOUNDER_API_URL } from './security.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Browser session cookies are ambient credentials. SameSite=Lax blocks the
 * common cross-site POST case, but this explicit Origin/Sec-Fetch-Site gate
 * protects every cookie-authenticated mutation and documents the authority
 * boundary in code. Bearer-token API clients remain stateless and unaffected.
 */
export const requireSameOriginForCookieMutation: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.headers.authorization?.startsWith('Bearer ')) return next();
  if (!hasFounderSessionCookie(req)) return next();

  const fetchSite = req.get('Sec-Fetch-Site');
  if (fetchSite === 'cross-site') {
    return res.status(403).json({ error: 'Cross-site cookie mutation rejected' });
  }

  const origin = req.get('Origin');
  const expectedOrigin = new URL(FOUNDER_API_URL).origin;
  if (!origin || origin !== expectedOrigin) {
    return res.status(403).json({ error: 'Cookie mutation origin not allowed' });
  }

  res.vary('Origin');
  res.vary('Cookie');
  return next();
};
