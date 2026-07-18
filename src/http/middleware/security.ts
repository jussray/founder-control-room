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

import type { Request, Response, NextFunction, RequestHandler } from 'express';
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

/** Parse a single URL string, returning its origin. */
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

const DEFAULT_API_URL = 'http://localhost:8787';
const rawApiUrl = process.env['FOUNDER_API_URL'];

if (!rawApiUrl && IS_PRODUCTION) {
  throw new Error(
    'FOUNDER_API_URL is required in production. ' +
    'Set it to the public base URL of this backend server ' +
    '(e.g. https://api.control.example.com).',
  );
}

/** Public base URL of this backend, used for magic-link callbacks. */
export const FOUNDER_API_URL: string = rawApiUrl
  ? parseOrigin(rawApiUrl, 'FOUNDER_API_URL')
  : DEFAULT_API_URL;

const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:8787';
const rawAllowedOrigins = process.env['FOUNDER_ALLOWED_ORIGINS'];

if (!rawAllowedOrigins && IS_PRODUCTION) {
  throw new Error(
    'FOUNDER_ALLOWED_ORIGINS is required in production. ' +
    'Set it to a comma-separated list of allowed browser frontend origins ' +
    '(e.g. https://control.example.com).',
  );
}

const ALLOWED_ORIGINS: string[] = parseOrigins(
  rawAllowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
  'FOUNDER_ALLOWED_ORIGINS',
);

function appendVary(res: Response, value: string): void {
  const current = res.getHeader('Vary');
  const values = new Set(
    String(current ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  values.add(value);
  res.setHeader('Vary', [...values].join(', '));
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

export const corsMiddleware: RequestHandler = (req, res, next): void => {
  const origin = req.get('Origin');

  // Server-to-server requests do not carry an Origin header.
  if (!origin) {
    next();
    return;
  }

  if (!ALLOWED_ORIGINS.includes(origin)) {
    next(new Error(`CORS: origin not allowed: ${origin}`));
    return;
  }

  appendVary(res, 'Origin');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
};

// ---------------------------------------------------------------------------
// Security response headers
// ---------------------------------------------------------------------------

export const helmetMiddleware: RequestHandler = (_req, res, next): void => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
};

// ---------------------------------------------------------------------------
// Body size cap
// ---------------------------------------------------------------------------
export const BODY_LIMIT = '256kb';

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

interface RateBucket {
  count: number;
  resetsAt: number;
}

function createRateLimiter(
  windowMs: number,
  max: number,
  message: { error: string },
): RequestHandler {
  const buckets = new Map<string, RateBucket>();

  return (req, res, next): void => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const existing = buckets.get(key);
    const bucket = !existing || existing.resetsAt <= now
      ? { count: 0, resetsAt: now + windowMs }
      : existing;

    bucket.count += 1;
    buckets.set(key, bucket);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetsAt / 1_000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetsAt - now) / 1_000))));
      res.status(429).json(message);
      return;
    }

    next();
  };
}

/** 5 magic-link requests per 15 min per process/IP. */
export const rateLimitMagicLink = createRateLimiter(
  15 * 60 * 1_000,
  5,
  { error: 'Too many magic-link requests, please try again later.' },
);

/** 60 requests per minute per process/IP for general API routes. */
export const rateLimitGeneral = createRateLimiter(
  60 * 1_000,
  60,
  { error: 'Rate limit exceeded.' },
);

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
