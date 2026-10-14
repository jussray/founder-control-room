import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { readFounderSession } from '../../auth/founderSession.js';
import { requireInteractiveFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const oauthConsentRouter = Router();

const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{8,256}$/;
const consentRateLimit = rateLimit({
  windowMs: 60 * 1_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OAuth consent requests. Please try again shortly.' },
});

type JsonRecord = Record<string, unknown>;

type ConsentAction = 'approve' | 'deny';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function authorizationId(req: Request): string | null {
  const value = typeof req.params.authorizationId === 'string'
    ? req.params.authorizationId.trim()
    : '';
  return AUTHORIZATION_ID.test(value) ? value : null;
}

function supabaseAuthBase(): string {
  const configured = process.env.SUPABASE_URL?.trim();
  if (!configured) throw new Error('SUPABASE_URL is not configured');
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('SUPABASE_URL must be a canonical https URL');
  }
  return `${url.origin}/auth/v1`;
}

function publishableKey(): string {
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY)?.trim();
  if (!key) throw new Error('Supabase publishable auth key is not configured');
  return key;
}

function upstreamMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback;
  for (const key of ['msg', 'message', 'error_description', 'error']) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500);
  }
  return fallback;
}

async function callSupabaseConsentApi(
  req: FounderRequest,
  authorizationIdValue: string,
  action?: ConsentAction,
): Promise<{ status: number; body: unknown }> {
  const founderSession = await readFounderSession(req);
  if (!founderSession) {
    return { status: 401, body: { error: 'Interactive founder session required' } };
  }

  const url = `${supabaseAuthBase()}/oauth/authorizations/${encodeURIComponent(authorizationIdValue)}${action ? '/consent' : ''}`;
  const response = await fetch(url, {
    method: action ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${founderSession.accessToken}`,
      apikey: publishableKey(),
      Accept: 'application/json',
      ...(action ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(action ? { body: JSON.stringify({ action }) } : {}),
  });

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function sendUpstream(res: Response, status: number, body: unknown): Response {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (status >= 200 && status < 300 && isRecord(body)) {
    return res.status(status).json(body);
  }

  const safeStatus = status >= 400 && status <= 599 ? status : 502;
  return res.status(safeStatus).json({
    error: upstreamMessage(body, 'OAuth authorization request could not be processed.'),
  });
}

oauthConsentRouter.get(
  '/authorizations/:authorizationId',
  consentRateLimit,
  requireInteractiveFounder,
  async (req: FounderRequest, res) => {
    const id = authorizationId(req);
    if (!id) return res.status(400).json({ error: 'Invalid authorization_id' });

    try {
      const upstream = await callSupabaseConsentApi(req, id);
      return sendUpstream(res, upstream.status, upstream.body);
    } catch (error) {
      console.error('OAuth consent detail proxy failed:', error instanceof Error ? error.message : String(error));
      return res.status(503).json({ error: 'OAuth consent service is temporarily unavailable.' });
    }
  },
);

oauthConsentRouter.post(
  '/authorizations/:authorizationId/consent',
  consentRateLimit,
  requireInteractiveFounder,
  async (req: FounderRequest, res) => {
    const id = authorizationId(req);
    if (!id) return res.status(400).json({ error: 'Invalid authorization_id' });
    const action = req.body?.action;
    if (action !== 'approve' && action !== 'deny') {
      return res.status(400).json({ error: 'action must be approve or deny' });
    }

    try {
      const upstream = await callSupabaseConsentApi(req, id, action);
      return sendUpstream(res, upstream.status, upstream.body);
    } catch (error) {
      console.error('OAuth consent decision proxy failed:', error instanceof Error ? error.message : String(error));
      return res.status(503).json({ error: 'OAuth consent service is temporarily unavailable.' });
    }
  },
);
