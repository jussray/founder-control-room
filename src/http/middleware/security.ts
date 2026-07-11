/**
 * Security middleware.
 *
 * ENVIRONMENT VARIABLES
 * ---------------------
 * FOUNDER_API_URL        (required in production)
 *   The public base URL of THIS backend server.
 *   Used only to construct the magic-link emailRedirectTo callback.
 *   Must resolve to this server's own /auth/callback endpoint.
 *   Example: https://api.control.example.com
 *
 * FOUNDER_ALLOWED_ORIGINS  (required in production)
 *   Comma-separated list of browser frontend origins allowed to make
 *   cross-origin requests to this API.
 *   Normalized via URL().origin so trailing slashes never cause mismatches.
 *   Example: https://control.example.com,https://staging.control.example.com
 *
 * These MUST be separate values. FOUNDER_API_URL is the backend URL.
 * FOUNDER_ALLOWED_ORIGINS is the frontend origin. They will differ in any
 * split-origin deployment. Conflating them causes either broken CORS or
 * broken magic-link callbacks.
 *
 * STARTUP VALIDATION
 * ------------------
 * In production (NODE_ENV=production), missing or malformed required env vars
 * will throw synchronously during module load and crash the process.
 * This is intentional: a misconfigured server should not silently start.
 */

import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import type { FounderRequest } from './requireFounder.js';

const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

// ---------------------------------------------------------------------------
// Startup validation
// ---------------------------------------------------------------------------

/**
 * Parse a comma-separated origins string into normalized origin strings.
 * URL().origin strips paths, normalizes scheme+host+port, removes trailing slash.
 * Throws if any entry is not a valid absolute URL.
 */
function parseOrigins(raw: string, varName: string): string[] {
  return raw.split(',').map((entry) => {
    const trimmed = entry.trim();
    try {
      return new URL(trimmed).origin;
    } catch {
      throw new Error(
        `${varName} contains an invalid URL: "${trimmed}". ` +
        'Each entry must be an absolute URL (e.g. https://control.example.com).',
      );
    }
  });
}

/**
 * Parse a single URL string, returning its origin.
 * Throws if the value is not a valid absolute URL.
 */
function parseOrigin(raw: string, varName: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(
      `${varName} is not a valid absolute URL: "${raw}". ` +
      'Example: https://api.control.example.com',
    );
  }
}

// ---------------------------------------------------------------------------
// FOUNDER_API_URL — backend callback base URL
// ---------------------------------------------------------------------------

const DEFAULT_API_URL = 'http://localhost:8787';

const rawApiUrl = process.env['FOUNDER_API_URL'];

if (!rawApiUrl) {
  if (IS_PRODUCTION) {
    throw new Error(
      'FOUNDER_API_URL is required in production. ' +
      'Set it to the public base URL of this backend server ' +
      '(e.g. https://api.control.example.com).',
    );
  }
}

/**
 * The public base URL of this backend server.
 * Used to construct magic-link emailRedirectTo.
 * Exported so auth.ts can import it instead of reading env directly.
 */
export const FOUNDER_API_URL: string = rawApiUrl
  ? parseOrigin(rawApiUrl, 'FOUNDER_API_URL')
  : DEFAULT_API_URL;

// ---------------------------------------------------------------------------
// FOUNDER_ALLOWED_ORIGINS — browser frontend origins
// ---------------------------------------------------------------------------

const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:8787';

const rawAllowedOrigins = process.env['FOUNDER_ALLOWED_ORIGINS'];

if (!rawAllowedOrigins) {
  if (IS_PRODUCTION) {
    throw new Error(
      'FOUNDER_ALLOWED_ORIGINS is required in production. ' +
      'Set it to a comma-separated list of allowed browser frontend origins ' +
      '(e.g. https://control.example.com).',
    );
  }
}

const ALLOWED_ORIGINS: string[] = parseOrigins(
  rawAllowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
  'FOUNDER_ALLOWED_ORIGINS',
);

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests (no Origin header) and known origins.
    // origin is already normalized by the browser; ALLOWED_ORIGINS are
    // normalized by parseOrigins above, so comparison is exact-string safe.
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
// Body size cap
// ---------------------------------------------------------------------------
export const BODY_LIMIT = '256kb';

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** 5 magic-link requests per 15 min per IP. */
export const rateLimitMagicLink = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many magic-link requests, please try again later.' },
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
// Centralized error handler — must be last in server.ts
// ---------------------------------------------------------------------------
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const message = err instanceof Error ? err.message : 'Internal server error';

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
