import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';

const COOKIE = '__Host-fcr_member_session';
const TABLE = 'fcr_member_browser_sessions';
const MAX_AGE = 8 * 60 * 60;
const OPAQUE = /^v1\.[A-Za-z0-9_-]{43}$/;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MemberIdentity { userId: string; email: string }

function cookieValue(req: Request): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== COOKIE) continue;
    try {
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      return OPAQUE.test(value) ? value : null;
    } catch { return null; }
  }
  return null;
}
function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function cachePrivate(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}
function cookieAttributes(age: number): string {
  return 'Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' + String(age);
}

export async function writeMemberSession(res: Response, identity: MemberIdentity): Promise<void> {
  const email = identity.email.trim().toLowerCase();
  if (!USER_ID.test(identity.userId) || !email || email.length > 254 || !email.includes('@')) {
    throw new Error('Verified member identity required');
  }
  if (process.env.NODE_ENV === 'production' &&
      !(process.env.FOUNDER_API_URL ?? '').startsWith('https://')) {
    throw new Error('HTTPS member session origin required');
  }
  const token = 'v1.' + randomBytes(32).toString('base64url');
  const now = Date.now();
  const { error } = await supabase.from(TABLE).insert({
    session_id_hash: hash(token),
    member_user_id: identity.userId,
    member_email: email,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + MAX_AGE * 1000).toISOString(),
  });
  if (error) throw new Error('Member session persistence unavailable');
  cachePrivate(res);
  res.append('Set-Cookie', COOKIE + '=' + token + '; ' + cookieAttributes(MAX_AGE));
}

export async function readMemberSession(req: Request): Promise<MemberIdentity | null> {
  const token = cookieValue(req);
  if (!token) return null;
  const { data, error } = await supabase.from(TABLE)
    .select('member_user_id,member_email')
    .eq('session_id_hash', hash(token))
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error || !data || typeof data.member_user_id !== 'string' ||
      typeof data.member_email !== 'string' || !USER_ID.test(data.member_user_id)) return null;
  const email = data.member_email.trim().toLowerCase();
  return email && email.length <= 254 ? { userId: data.member_user_id, email } : null;
}

export async function revokeMemberSession(req: Request): Promise<boolean> {
  const token = cookieValue(req);
  if (!token) return true;
  const { error } = await supabase.from(TABLE)
    .update({ revoked_at: new Date().toISOString(), revoke_reason: 'logout' })
    .eq('session_id_hash', hash(token))
    .is('revoked_at', null);
  return !error;
}

export function clearMemberSession(res: Response): void {
  cachePrivate(res);
  res.append('Set-Cookie', COOKIE + '=; ' + cookieAttributes(0));
}
