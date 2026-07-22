import type { Request, Response } from 'express';
import type { Session } from '@supabase/supabase-js';

const DEVELOPMENT_COOKIE_NAME = 'fcr_session';
const PRODUCTION_COOKIE_NAME = '__Host-fcr_session';
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface FounderCookieSession {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

function isHttpsDeployment(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.FOUNDER_API_URL?.startsWith('https://') === true;
}

// __Host- is only valid on Secure, Path=/, no-Domain cookies, so it must track
// the same HTTPS-deployment detection used for the Secure attribute itself.
function activeCookieName(): string {
  return isHttpsDeployment() ? PRODUCTION_COOKIE_NAME : DEVELOPMENT_COOKIE_NAME;
}

function encodeSession(session: FounderCookieSession): string {
  return Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
}

function decodeSession(value: string): FounderCookieSession | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<FounderCookieSession>;
    if (typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') return null;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      ...(typeof parsed.expiresAt === 'number' ? { expiresAt: parsed.expiresAt } : {}),
    };
  } catch {
    return null;
  }
}

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      // Ignore malformed cookie values rather than weakening auth handling.
    }
  }
  return cookies;
}

function cookieAttributes(maxAgeSeconds: number, secure: boolean): string {
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}; Priority=High${secure ? '; Secure' : ''}`;
}

function preventSessionCaching(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

export function readFounderSession(req: Request): FounderCookieSession | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  const encoded = cookies.get(PRODUCTION_COOKIE_NAME) ?? cookies.get(DEVELOPMENT_COOKIE_NAME);
  return encoded ? decodeSession(encoded) : null;
}

export function writeFounderSession(res: Response, session: Session): void {
  const value = encodeSession({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    ...(typeof session.expires_at === 'number' ? { expiresAt: session.expires_at } : {}),
  });
  const secure = isHttpsDeployment();
  preventSessionCaching(res);
  res.setHeader(
    'Set-Cookie',
    `${activeCookieName()}=${encodeURIComponent(value)}; ${cookieAttributes(COOKIE_MAX_AGE_SECONDS, secure)}`,
  );
}

export function clearFounderSession(res: Response): void {
  preventSessionCaching(res);
  res.setHeader('Set-Cookie', [
    `${PRODUCTION_COOKIE_NAME}=; ${cookieAttributes(0, true)}`,
    `${DEVELOPMENT_COOKIE_NAME}=; ${cookieAttributes(0, false)}`,
  ]);
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
}
