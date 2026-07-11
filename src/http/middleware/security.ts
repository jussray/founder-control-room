/**
 * Security middleware.
 *
 * Applied globally in server.ts, before any route handler.
 *
 * What each piece does:
 *
 * helmet()
 *   Sets 11 security-related response headers in one call:
 *   Content-Security-Policy, X-Frame-Options, X-Content-Type-Options,
 *   Referrer-Policy, Strict-Transport-Security, etc.
 *   No config needed for an API-only server.
 *
 * cors()
 *   Restricts cross-origin requests to the known FOUNDER_APP_URL.
 *   In development (no FOUNDER_APP_URL set), allows localhost:3000 and
 *   localhost:8787 only. The wildcard is never used.
 *
 * express.json({ limit: '256kb' })
 *   Caps the request body so a large payload can't OOM the process.
 *   256kb is generous for any API payload this server will ever receive.
 *
 * rateLimitMagicLink
 *   Rate-limits POST /auth/magic-link to 5 requests per 15 minutes per IP.
 *   Without this, anyone who knows your email can spam Supabase OTP sends.
 *   Exported separately so server.ts can mount it only on the magic-link route.
 *
 * requestAudit
 *   Structured JSON access log for every request.
 *   Logs: method, path, status, duration, founder email if authenticated.
 *   Does not log request bodies (they may contain tokens).
 */

import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import type { FounderRequest } from './requireFounder.js';

// ---------------------------------------------------------------------------
// CORS origins
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS: string[] = (() => {
  const configured = process.env['FOUNDER_APP_URL'];
  if (configured) return [configured];
  // Development fallback — never allow wildcard
  return ['http://localhost:3000', 'http://localhost:8787'];
})();

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow server-to-server calls (no Origin header) and known origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin not allowed: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// ---------------------------------------------------------------------------
// Helmet (security response headers)
// ---------------------------------------------------------------------------
export const helmetMiddleware = helmet();

// ---------------------------------------------------------------------------
// Body size cap — applied in server.ts via express.json({ limit })
// ---------------------------------------------------------------------------
export const BODY_LIMIT = '256kb';

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** 5 magic-link requests per 15 min per IP. */
export const rateLimitMagicLink = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 5,
  standardHeaders: true,   // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { error: 'Too many magic-link requests, please try again later.' },
  // Use X-Forwarded-For if behind a proxy/load balancer
  keyGenerator: (req) => req.ip ?? req.socket.remoteAddress ?? 'unknown',
});

/** 60 requests per minute per IP for general API routes. */
export const rateLimitGeneral = rateLimit({
  windowMs: 60 * 1_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded.' },
  keyGenerator: (req) => req.ip ?? req.socket.remoteAddress ?? 'unknown',
});

// ---------------------------------------------------------------------------
// Request audit log
// ---------------------------------------------------------------------------
export function requestAudit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on('finish', () => {
    const founder = (req as FounderRequest).founder;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - start,
        ip: req.ip,
        ...(founder ? { founder: founder.email } : {}),
      }),
    );
  });

  next();
}

// ---------------------------------------------------------------------------
// Centralized error handler
// Must be registered last in server.ts (after all routes).
// ---------------------------------------------------------------------------
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const message = err instanceof Error ? err.message : 'Internal server error';

  // CORS errors surface here
  if (message.startsWith('CORS:')) {
    res.status(403).json({ error: message });
    return;
  }

  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );

  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
}
