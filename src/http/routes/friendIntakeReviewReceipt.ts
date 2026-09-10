import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { DeterministicFriendIntakeResult } from '../../chief/firstSliceEngine.js';

const REVIEW_COOKIE = 'fcr_friend_intake_review';
const REVIEW_TOKEN_VERSION = 'v1';
const REVIEW_TTL_SECONDS = 5 * 60;
const SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REVIEW_TOKEN_PATTERN = /^v1\.(\d{10})\.([A-Za-z0-9_-]{43})$/;

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
      // Ignore malformed cookie values and fail closed during verification.
    }
  }
  return cookies;
}

function signingKey(): Buffer {
  const encoded = process.env.FOUNDER_SESSION_ENCRYPTION_KEY?.trim() ?? '';
  if (!SESSION_KEY_PATTERN.test(encoded)) {
    throw new Error('FOUNDER_SESSION_ENCRYPTION_KEY must be a 32-byte base64url key');
  }
  const masterKey = Buffer.from(encoded, 'base64url');
  if (masterKey.length !== 32) {
    throw new Error('FOUNDER_SESSION_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }

  // Key separation: the founder-session master key is never used directly as
  // the review MAC key. This deterministic subkey is scoped to Friend Intake.
  return createHmac('sha256', masterKey)
    .update('fcr-friend-intake-sensitive-review-key/v1', 'utf8')
    .digest();
}

function canonicalReviewInput(
  founderId: string,
  rawText: string,
  result: DeterministicFriendIntakeResult,
  expiresAt: number,
): string {
  return [
    'fcr-friend-intake-sensitive-save-review/v1',
    founderId,
    rawText,
    result.redactedSummary ?? '',
    [...result.sensitiveCategories].sort().join(','),
    [...result.intentTags].sort().join(','),
    String(expiresAt),
  ].join('\n');
}

function signature(
  founderId: string,
  rawText: string,
  result: DeterministicFriendIntakeResult,
  expiresAt: number,
): Buffer {
  return createHmac('sha256', signingKey())
    .update(canonicalReviewInput(founderId, rawText, result, expiresAt), 'utf8')
    .digest();
}

export function issueSensitiveSaveReviewReceipt(
  founderId: string,
  rawText: string,
  result: DeterministicFriendIntakeResult,
  nowSeconds = Math.floor(Date.now() / 1_000),
): string {
  const expiresAt = nowSeconds + REVIEW_TTL_SECONDS;
  const mac = signature(founderId, rawText, result, expiresAt).toString('base64url');
  return `${REVIEW_TOKEN_VERSION}.${expiresAt}.${mac}`;
}

export function verifySensitiveSaveReviewReceipt(
  token: string | null,
  founderId: string,
  rawText: string,
  result: DeterministicFriendIntakeResult,
  nowSeconds = Math.floor(Date.now() / 1_000),
): boolean {
  if (!token) return false;
  const match = token.match(REVIEW_TOKEN_PATTERN);
  if (!match) return false;

  const expiresAt = Number(match[1]);
  if (!Number.isSafeInteger(expiresAt)) return false;
  if (expiresAt < nowSeconds || expiresAt > nowSeconds + REVIEW_TTL_SECONDS) return false;

  try {
    const actual = Buffer.from(match[2], 'base64url');
    const expected = signature(founderId, rawText, result, expiresAt);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function readSensitiveSaveReviewReceipt(req: Request): string | null {
  const value = parseCookieHeader(req.headers.cookie).get(REVIEW_COOKIE) ?? '';
  return REVIEW_TOKEN_PATTERN.test(value) ? value : null;
}

function cookieAttributes(maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'test' ? '' : '; Secure';
  return `Path=/friend-intake; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function setSensitiveSaveReviewReceipt(res: Response, token: string): void {
  res.append('Set-Cookie', `${REVIEW_COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes(REVIEW_TTL_SECONDS)}`);
}

export function clearSensitiveSaveReviewReceipt(res: Response): void {
  res.append('Set-Cookie', `${REVIEW_COOKIE}=; ${cookieAttributes(0)}`);
}
