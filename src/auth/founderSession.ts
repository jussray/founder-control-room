import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient.js';

const COOKIE_NAME = '__Host-fcr_session';
const LEGACY_COOKIE_NAME = 'fcr_session';
const COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;
const COOKIE_FORMAT_VERSION = 'v1';
const SESSION_TABLE = 'founder_browser_sessions';
const SESSION_VERSION = 1;
const OPAQUE_TOKEN_BYTES = 32;
const OPAQUE_COOKIE_PATTERN = /^v1\.[A-Za-z0-9_-]{43}$/;

export interface FounderCookieSession {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  founderUserId: string;
  founderEmail: string;
  sessionIdHash: string;
  sessionVersion: number;
  sessionExpiresAt: string;
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

function opaqueCookieValue(req: Request): string | null {
  const value = parseCookieHeader(req.headers.cookie).get(COOKIE_NAME) ?? '';
  return OPAQUE_COOKIE_PATTERN.test(value) ? value : null;
}

function sessionIdHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function newOpaqueCookieValue(): string {
  return `${COOKIE_FORMAT_VERSION}.${randomBytes(OPAQUE_TOKEN_BYTES).toString('base64url')}`;
}

function assertSecureCookieDeployment(): void {
  const configuredUrl = process.env.FOUNDER_API_URL?.trim() ?? '';
  if (process.env.NODE_ENV === 'production' && configuredUrl && !configuredUrl.startsWith('https://')) {
    throw new Error('FOUNDER_API_URL must use https:// before __Host-fcr_session can be issued in production');
  }
}

function cookieAttributes(maxAgeSeconds: number): string {
  return `Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function preventSessionCaching(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function setSessionCookie(res: Response, value: string): void {
  preventSessionCaching(res);
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${encodeURIComponent(value)}; ${cookieAttributes(COOKIE_MAX_AGE_SECONDS)}`,
    `${LEGACY_COOKIE_NAME}=; ${cookieAttributes(0)}`,
  ]);
}

function normalizedSessionIdentity(session: Session): { userId: string; email: string } {
  const userId = session.user?.id?.trim() ?? '';
  const email = session.user?.email?.trim().toLowerCase() ?? '';
  if (!userId || !email) {
    throw new Error('Founder browser session requires a verified Supabase user identity');
  }
  return { userId, email };
}

export async function readFounderSession(req: Request): Promise<FounderCookieSession | null> {
  const value = opaqueCookieValue(req);
  if (!value) return null;

  const hash = sessionIdHash(value);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(SESSION_TABLE)
    .select('session_id_hash,founder_user_id,founder_email,access_token,refresh_token,auth_expires_at,expires_at,session_version,revoked_at')
    .eq('session_id_hash', hash)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const accessToken = typeof row.access_token === 'string' ? row.access_token : '';
  const refreshToken = typeof row.refresh_token === 'string' ? row.refresh_token : '';
  const founderUserId = typeof row.founder_user_id === 'string' ? row.founder_user_id : '';
  const founderEmail = typeof row.founder_email === 'string' ? row.founder_email.toLowerCase() : '';
  const sessionExpiresAt = typeof row.expires_at === 'string' ? row.expires_at : '';
  const sessionVersion = typeof row.session_version === 'number' ? row.session_version : 0;
  const authExpiresAt = typeof row.auth_expires_at === 'number' ? row.auth_expires_at : undefined;

  if (!accessToken || !refreshToken || !founderUserId || !founderEmail || !sessionExpiresAt) return null;
  if (sessionVersion !== SESSION_VERSION) return null;

  return {
    accessToken,
    refreshToken,
    ...(authExpiresAt !== undefined ? { expiresAt: authExpiresAt } : {}),
    founderUserId,
    founderEmail,
    sessionIdHash: hash,
    sessionVersion,
    sessionExpiresAt,
  };
}

export async function writeFounderSession(res: Response, session: Session): Promise<void> {
  assertSecureCookieDeployment();
  const identity = normalizedSessionIdentity(session);
  const value = newOpaqueCookieValue();
  const hash = sessionIdHash(value);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + COOKIE_MAX_AGE_SECONDS * 1000);

  const { error } = await supabase.from(SESSION_TABLE).insert({
    session_id_hash: hash,
    founder_user_id: identity.userId,
    founder_email: identity.email,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    auth_expires_at: typeof session.expires_at === 'number' ? session.expires_at : null,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    session_version: SESSION_VERSION,
  });

  if (error) {
    throw new Error('Unable to persist founder browser session');
  }

  setSessionCookie(res, value);
}

export async function revokeFounderSession(req: Request, reason = 'logout'): Promise<boolean> {
  const value = opaqueCookieValue(req);
  if (!value) return true;

  const revokedAt = new Date().toISOString();
  const { error } = await supabase
    .from(SESSION_TABLE)
    .update({ revoked_at: revokedAt, revoke_reason: reason })
    .eq('session_id_hash', sessionIdHash(value))
    .is('revoked_at', null);

  return !error;
}

export async function rotateFounderSession(req: Request, res: Response, session: Session): Promise<void> {
  const revoked = await revokeFounderSession(req, 'rotated');
  if (!revoked) {
    clearFounderSession(res);
    throw new Error('Unable to revoke prior founder browser session');
  }

  try {
    await writeFounderSession(res, session);
  } catch (error) {
    clearFounderSession(res);
    throw error;
  }
}

export function clearFounderSession(res: Response): void {
  preventSessionCaching(res);
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=; ${cookieAttributes(0)}`,
    `${LEGACY_COOKIE_NAME}=; ${cookieAttributes(0)}`,
  ]);
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
}
