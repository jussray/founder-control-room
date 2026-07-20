import type { RequestHandler } from 'express';
import { FOUNDER_API_URL } from './security.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie-authenticated browser mutations need a CSRF boundary. API clients that
 * send an explicit Bearer token remain supported because the token is not
 * attached automatically by the browser.
 *
 * The Founder Control Room UI is same-origin, so accepting a broader "same-site"
 * subdomain boundary would add risk without adding a real product capability.
 */
export const requireSameOriginBrowserMutation: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const authorization = req.get('Authorization');
  if (authorization?.startsWith('Bearer ')) {
    next();
    return;
  }

  const origin = req.get('Origin');
  const fetchSite = req.get('Sec-Fetch-Site');
  if (origin !== FOUNDER_API_URL || (fetchSite && fetchSite !== 'same-origin')) {
    res.status(403).json({ error: 'Same-origin browser request required' });
    return;
  }

  next();
};
