import type { RequestHandler } from 'express';
import { FOUNDER_API_URL } from './security.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const REMOTE_MCP_OAUTH_BOOTSTRAP_PATHS = new Set(['/mcp', '/mcp/read']);

/**
 * Cookie-authenticated browser mutations need a CSRF boundary. API clients that
 * send an explicit Bearer token remain supported because the token is not
 * attached automatically by the browser.
 *
 * OAuth-capable MCP clients (including ChatGPT app/plugin and Claude connector
 * adapters) need two exact unauthenticated bootstrap paths: canonical POST /mcp
 * and the exact-token compatibility POST /mcp/read. Canonical /mcp returns
 * the OAuth WWW-Authenticate challenge; non-legacy /mcp/read callers receive
 * a POST-preserving 307 to that matching canonical protected resource. Neither
 * endpoint uses browser cookies for tool authority, and both fail closed.
 *
 * The Founder Control Room UI is same-origin, so accepting a broader "same-site"
 * subdomain boundary would add risk without adding a real product capability.
 */
export const requireSameOriginBrowserMutation: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  if (
    req.method.toUpperCase() === 'POST'
    && REMOTE_MCP_OAUTH_BOOTSTRAP_PATHS.has(req.path)
  ) {
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
