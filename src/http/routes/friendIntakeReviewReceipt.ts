import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { DeterministicFriendIntakeResult } from '../../chief/firstSliceEngine.js';

const REVIEW_COOKIE = 'fcr_friend_intake_review';
const REVIEW_TOKEN_VERSION = 'v2';
const REVIEW_TTL_SECONDS = 5 * 60;
const SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_ID_HASH_PATTERN = /^[0-9a-f]{64}$/i;
const REVIEW_TOKEN_PATTERN = /^v2\.(\d{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

export interface SensitiveSaveReviewBinding {
  founderId: string;
  browserSessionIdHash: string;
  rawText: string;
  result: DeterministicFriendIntakeResult;
  engineVersion: string;
  moveGateWarningCode: string | null;
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

  return createHmac('sha256', masterKey)
    .update('fcr-friend-intake-sensitive-review-key/v2', 'utf8')
    .digest();
}

function canonicalReviewInput(
  binding: SensitiveSaveReviewBinding,
  nonce: string,
  expiresAt: number,
): string {
  return [
    'fcr-friend-intake-sensitive-save-review/v2',
    binding.founderId,
    binding.browserSessionIdHash.toLowerCase(),
    binding.rawText,
    binding.result.redactedSummary ?? '',
    [...binding.result.sensitiveCategories].sort().join(','),
    [...binding.result.intentTags].sort().join(','),
    binding.result.move.kind,
    binding.result.move.policy,
    binding.result.move.timeEstimateMinutes === null ? '' : String(binding.result.move.timeEstimateMinutes),
    binding.moveGateWarningCode ?? '',
    'blocked',
    binding.engineVersion,
    nonce,
    String(expiresAt),
  ].join('\n');
}

function signature(
  binding: SensitiveSaveReviewBinding,
  nonce: string,
  expiresAt: number,
): Buffer {
  return createHmac('sha256', signingKey())
    .update(canonicalReviewInput(binding, nonce, expiresAt), 'utf8')
    .digest();
}

export function issueSensitiveSaveReviewReceipt(
  binding: SensitiveSaveReviewBinding,
  nowSeconds = Math.floor(Date.now() / 1_000),
): string {
  if (!SESSION_ID_HASH_PATTERN.test(binding.browserSessionIdHash)) {
    throw new Error('Friend Intake review requires an exact founder browser-session identity hash');
  }
  const expiresAt = nowSeconds + REVIEW_TTL_SECONDS;
  const nonce = randomBytes(16).toString('base64url');
  const mac = signature(binding, nonce, expiresAt).toString('base64url');
  return `${REVIEW_TOKEN_VERSION}.${expiresAt}.${nonce}.${mac}`;
}

export function verifySensitiveSaveReviewReceipt(
  token: string | null,
  binding: SensitiveSaveReviewBinding,
  nowSeconds = Math.floor(Date.now() / 1_000),
): boolean {
  if (!token || !SESSION_ID_HASH_PATTERN.test(binding.browserSessionIdHash)) return false;
  const match = token.match(REVIEW_TOKEN_PATTERN);
  if (!match) return false;

  const expiresAt = Number(match[1]);
  const nonce = match[2];
  if (!Number.isSafeInteger(expiresAt)) return false;
  if (expiresAt < nowSeconds || expiresAt > nowSeconds + REVIEW_TTL_SECONDS) return false;

  try {
    const actual = Buffer.from(match[3], 'base64url');
    const expected = signature(binding, nonce, expiresAt);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function reviewReceiptDerivedUuid(
  token: string,
  purpose: 'intake' | 'timeline',
): string {
  if (!REVIEW_TOKEN_PATTERN.test(token)) {
    throw new Error('Friend Intake review receipt is malformed');
  }
  const digest = createHash('sha256')
    .update(`fcr-friend-intake-review-id/v1\n${purpose}\n${token}`, 'utf8')
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
