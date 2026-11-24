import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
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
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SESSION_CREDENTIAL_ALGORITHM = 'aes-256-gcm';
const SESSION_CREDENTIAL_IV_BYTES = 12;
const SESSION_CREDENTIAL_TAG_BYTES = 16;
const SESSION_CREDENTIAL_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface FounderCookieSession {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  founderUserId: string;
  founderEmail: string;
  sessionIdHash: string;
  sessionVersion: number;
  sessionExpiresAt: string;
  continuityFingerprint: string;
}

interface SessionCredentialContext {
  sessionIdHash: string;
  founderUserId: string;
  founderEmail: string;
  issuedAt: string;
  expiresAt: string;
  sessionVersion: number;
}

interface EncryptedSessionCredentials {
  ciphertext: string;
  iv: string;
  authTag: string;
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

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sessionIdHash(value: string): string {
  return sha256(value);
}

function canonicalTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : '';
}

function sessionContinuityFingerprint(input: SessionCredentialContext): string {
  // This is a deterministic state-integrity fingerprint, not a browser/device
  // fingerprint. It deliberately excludes IP, ASN, country, JA4, user agent,
  // hardware entropy, storage identifiers, and other tracking surfaces.
  return sha256([
    'fcr-founder-browser-session/v1',
    input.sessionIdHash,
    input.founderUserId,
    input.founderEmail.trim().toLowerCase(),
    input.issuedAt,
    input.expiresAt,
    String(input.sessionVersion),
  ].join('\n'));
}

function sessionCredentialKey(): Buffer {
  const encoded = process.env.FOUNDER_SESSION_ENCRYPTION_KEY?.trim() ?? '';
  if (!SESSION_CREDENTIAL_KEY_PATTERN.test(encoded)) {
    throw new Error('FOUNDER_SESSION_ENCRYPTION_KEY must be a 32-byte base64url key');
  }
  const key = Buffer.from(encoded, 'base64url');
  if (key.length !== 32) {
    throw new Error('FOUNDER_SESSION_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

function sessionCredentialAad(context: SessionCredentialContext): Buffer {
  return Buffer.from([
    'fcr-founder-browser-session-credentials/v1',
    context.sessionIdHash,
    context.founderUserId,
    context.founderEmail.trim().toLowerCase(),
    context.issuedAt,
    context.expiresAt,
    String(context.sessionVersion),
  ].join('\n'), 'utf8');
}

function encryptSessionCredentials(
  session: Session,
  context: SessionCredentialContext,
): EncryptedSessionCredentials {
  const iv = randomBytes(SESSION_CREDENTIAL_IV_BYTES);
  const cipher = createCipheriv(SESSION_CREDENTIAL_ALGORITHM, sessionCredentialKey(), iv, {
    authTagLength: SESSION_CREDENTIAL_TAG_BYTES,
  });
  cipher.setAAD(sessionCredentialAad(context));
  const plaintext = Buffer.from(JSON.stringify({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  }), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
  };
}

function decryptSessionCredentials(
  encrypted: EncryptedSessionCredentials,
  context: SessionCredentialContext,
): { accessToken: string; refreshToken: string } | null {
  try {
    const iv = Buffer.from(encrypted.iv, 'base64url');
    const authTag = Buffer.from(encrypted.authTag, 'base64url');
    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64url');
    if (iv.length !== SESSION_CREDENTIAL_IV_BYTES || authTag.length !== SESSION_CREDENTIAL_TAG_BYTES || ciphertext.length === 0) {
      return null;
    }
    const decipher = createDecipheriv(SESSION_CREDENTIAL_ALGORITHM, sessionCredentialKey(), iv, {
      authTagLength: SESSION_CREDENTIAL_TAG_BYTES,
    });
    decipher.setAAD(sessionCredentialAad(context));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(plaintext) as Record<string, unknown>;
    const accessToken = typeof parsed.accessToken === 'string' ? parsed.accessToken : '';
    const refreshToken = typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '';
    return accessToken && refreshToken ? { accessToken, refreshToken } : null;
  } catch {
    return null;
  }
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
    .select('session_id_hash,founder_user_id,founder_email,credential_ciphertext,credential_iv,credential_auth_tag,auth_expires_at,issued_at,expires_at,session_version,continuity_fingerprint,revoked_at')
    .eq('session_id_hash', hash)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const founderUserId = typeof row.founder_user_id === 'string' ? row.founder_user_id : '';
  const founderEmail = typeof row.founder_email === 'string' ? row.founder_email.toLowerCase() : '';
  const issuedAt = canonicalTimestamp(row.issued_at);
  const sessionExpiresAt = canonicalTimestamp(row.expires_at);
  const sessionVersion = typeof row.session_version === 'number' ? row.session_version : 0;
  const storedContinuityFingerprint = typeof row.continuity_fingerprint === 'string' ? row.continuity_fingerprint : '';
  const authExpiresAt = typeof row.auth_expires_at === 'number' ? row.auth_expires_at : undefined;
  const encrypted = {
    ciphertext: typeof row.credential_ciphertext === 'string' ? row.credential_ciphertext : '',
    iv: typeof row.credential_iv === 'string' ? row.credential_iv : '',
    authTag: typeof row.credential_auth_tag === 'string' ? row.credential_auth_tag : '',
  };

  if (!founderUserId || !founderEmail || !issuedAt || !sessionExpiresAt) return null;
  if (!encrypted.ciphertext || !encrypted.iv || !encrypted.authTag) return null;
  if (sessionVersion !== SESSION_VERSION) return null;
  if (!SHA256_PATTERN.test(storedContinuityFingerprint)) return null;

  const context: SessionCredentialContext = {
    sessionIdHash: hash,
    founderUserId,
    founderEmail,
    issuedAt,
    expiresAt: sessionExpiresAt,
    sessionVersion,
  };
  const expectedContinuityFingerprint = sessionContinuityFingerprint(context);
  if (storedContinuityFingerprint !== expectedContinuityFingerprint) return null;
  const credentials = decryptSessionCredentials(encrypted, context);
  if (!credentials) return null;

  return {
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    ...(authExpiresAt !== undefined ? { expiresAt: authExpiresAt } : {}),
    founderUserId,
    founderEmail,
    sessionIdHash: hash,
    sessionVersion,
    sessionExpiresAt,
    continuityFingerprint: expectedContinuityFingerprint,
  };
}

export async function writeFounderSession(res: Response, session: Session): Promise<void> {
  assertSecureCookieDeployment();
  const identity = normalizedSessionIdentity(session);
  const value = newOpaqueCookieValue();
  const hash = sessionIdHash(value);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + COOKIE_MAX_AGE_SECONDS * 1000);
  const issuedAtIso = issuedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const context: SessionCredentialContext = {
    sessionIdHash: hash,
    founderUserId: identity.userId,
    founderEmail: identity.email,
    issuedAt: issuedAtIso,
    expiresAt: expiresAtIso,
    sessionVersion: SESSION_VERSION,
  };
  const continuityFingerprint = sessionContinuityFingerprint(context);
  const encrypted = encryptSessionCredentials(session, context);

  const { error } = await supabase.from(SESSION_TABLE).insert({
    session_id_hash: hash,
    founder_user_id: identity.userId,
    founder_email: identity.email,
    credential_ciphertext: encrypted.ciphertext,
    credential_iv: encrypted.iv,
    credential_auth_tag: encrypted.authTag,
    auth_expires_at: typeof session.expires_at === 'number' ? session.expires_at : null,
    issued_at: issuedAtIso,
    expires_at: expiresAtIso,
    session_version: SESSION_VERSION,
    continuity_fingerprint: continuityFingerprint,
  });

  if (error) {
    throw new Error('Unable to persist founder browser session');
  }

  setSessionCookie(res, value);
}

async function revokeFounderSessionInternal(
  req: Request,
  reason: string,
  requireActiveMatch: boolean,
): Promise<boolean> {
  const value = opaqueCookieValue(req);
  if (!value) return true;

  const hash = sessionIdHash(value);
  const revokedAt = new Date().toISOString();
  const query = supabase
    .from(SESSION_TABLE)
    .update({ revoked_at: revokedAt, revoke_reason: reason })
    .eq('session_id_hash', hash)
    .is('revoked_at', null);

  if (!requireActiveMatch) {
    const { error } = await query;
    return !error;
  }

  const { data, error } = await query
    .select('session_id_hash')
    .maybeSingle();
  if (error || !data) return false;
  return (data as { session_id_hash?: unknown }).session_id_hash === hash;
}

export async function revokeFounderSession(req: Request, reason = 'logout'): Promise<boolean> {
  return revokeFounderSessionInternal(req, reason, false);
}

export async function rotateFounderSession(req: Request, res: Response, session: Session): Promise<void> {
  const revoked = await revokeFounderSessionInternal(req, 'rotated', true);
  if (!revoked) {
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
