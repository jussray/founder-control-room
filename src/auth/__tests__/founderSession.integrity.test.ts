import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { Session } from '@supabase/supabase-js';
import { readFounderSession, writeFounderSession } from '../founderSession.js';

const SIGNING_SECRET = 'founder-session-test-signing-secret-0123456789abcdef';

function mockResponse(): { res: Response; headers: Map<string, unknown> } {
  const headers = new Map<string, unknown>();
  const res = {
    setHeader: vi.fn((name: string, value: unknown) => {
      headers.set(name, value);
      return res;
    }),
  } as unknown as Response;
  return { res, headers };
}

function session(): Session {
  return {
    access_token: 'access-token-from-supabase',
    refresh_token: 'refresh-token-from-supabase',
    expires_in: 3600,
    expires_at: 1_800_000_000,
    token_type: 'bearer',
    user: {} as Session['user'],
  };
}

function cookieValue(setCookie: string): string {
  const pair = setCookie.split(';', 1)[0] ?? '';
  const separator = pair.indexOf('=');
  if (separator < 1) throw new Error('Set-Cookie did not contain a cookie pair');
  return decodeURIComponent(pair.slice(separator + 1));
}

function requestWithCookie(value: string): Request {
  return {
    headers: { cookie: `fcr_session=${encodeURIComponent(value)}` },
  } as Request;
}

describe('founder session cookie integrity', () => {
  beforeEach(() => {
    vi.stubEnv('FOUNDER_SESSION_SIGNING_SECRET', SIGNING_SECRET);
    vi.stubEnv('FOUNDER_API_URL', 'https://foundercontrolroom.org');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts only a server-signed founder session cookie', () => {
    const { res, headers } = mockResponse();
    writeFounderSession(res, session());

    const raw = headers.get('Set-Cookie');
    expect(typeof raw).toBe('string');
    const value = cookieValue(String(raw));
    expect(value.split('.')).toHaveLength(3);

    expect(readFounderSession(requestWithCookie(value))).toEqual({
      accessToken: 'access-token-from-supabase',
      refreshToken: 'refresh-token-from-supabase',
      expiresAt: 1_800_000_000,
    });
  });

  it('rejects the old unsigned base64 cookie shape an API client could fabricate', () => {
    const forged = Buffer.from(JSON.stringify({
      accessToken: 'real-bearer-token',
      refreshToken: 'attacker-controlled-placeholder',
    }), 'utf8').toString('base64url');

    expect(readFounderSession(requestWithCookie(forged))).toBeNull();
  });

  it('rejects a signed cookie when its payload is altered', () => {
    const { res, headers } = mockResponse();
    writeFounderSession(res, session());
    const value = cookieValue(String(headers.get('Set-Cookie')));
    const [version, payload, signature] = value.split('.');
    if (!version || !payload || !signature) throw new Error('signed cookie was malformed');

    const replacement = payload.endsWith('A') ? 'B' : 'A';
    const tamperedPayload = `${payload.slice(0, -1)}${replacement}`;
    expect(readFounderSession(requestWithCookie(`${version}.${tamperedPayload}.${signature}`))).toBeNull();
  });

  it('fails closed for HTTPS/production-like sessions when the signing secret is absent', () => {
    vi.stubEnv('FOUNDER_SESSION_SIGNING_SECRET', '');
    const { res } = mockResponse();

    expect(() => writeFounderSession(res, session())).toThrow(/FOUNDER_SESSION_SIGNING_SECRET/);
    expect(readFounderSession(requestWithCookie('v1.fake.fake'))).toBeNull();
  });
});
