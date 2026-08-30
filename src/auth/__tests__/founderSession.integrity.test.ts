import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { Session } from '@supabase/supabase-js';

const { rows, failure, supabaseMock } = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  failure: { insert: false, update: false },
  supabaseMock: { from: vi.fn() },
}));

function browserSessionTable() {
  return {
    insert: async (value: Record<string, unknown>) => {
      if (failure.insert) return { data: null, error: { message: 'insert failed' } };
      rows.set(String(value.session_id_hash), { ...value, revoked_at: null, revoke_reason: null });
      return { data: null, error: null };
    },
    select: (..._args: unknown[]) => ({
      eq: (field: string, value: unknown) => ({
        is: (nullField: string, nullValue: unknown) => ({
          gt: (timeField: string, timeValue: unknown) => ({
            maybeSingle: async () => {
              if (field !== 'session_id_hash') return { data: null, error: null };
              const row = rows.get(String(value)) ?? null;
              if (!row) return { data: null, error: null };
              if (nullField === 'revoked_at' && nullValue === null && row.revoked_at != null) return { data: null, error: null };
              if (timeField === 'expires_at' && String(row.expires_at ?? '') <= String(timeValue)) return { data: null, error: null };
              return { data: row, error: null };
            },
          }),
        }),
      }),
    }),
    update: (payload: Record<string, unknown>) => ({
      eq: (field: string, value: unknown) => ({
        is: async (nullField: string, nullValue: unknown) => {
          if (failure.update) return { data: null, error: { message: 'update failed' } };
          if (field === 'session_id_hash') {
            const key = String(value);
            const row = rows.get(key);
            if (row && !(nullField === 'revoked_at' && nullValue === null && row.revoked_at != null)) {
              rows.set(key, { ...row, ...payload });
            }
          }
          return { data: null, error: null };
        },
      }),
    }),
  };
}

vi.mock('../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import {
  clearFounderSession,
  readFounderSession,
  revokeFounderSession,
  rotateFounderSession,
  writeFounderSession,
} from '../founderSession.js';

const ACCESS_TOKEN = 'access-token-from-supabase';
const REFRESH_TOKEN = 'refresh-token-from-supabase';
const EMAIL = 'founder@example.com';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64url');

function session(): Session {
  return {
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    expires_in: 3600,
    expires_at: 2_000_000_000,
    token_type: 'bearer',
    user: { id: USER_ID, email: EMAIL } as Session['user'],
  };
}

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

function setCookies(headers: Map<string, unknown>): string[] {
  const raw = headers.get('Set-Cookie');
  expect(raw).toBeDefined();
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

function primaryCookiePair(headers: Map<string, unknown>): string {
  const primary = setCookies(headers)[0] ?? '';
  return primary.split(';', 1)[0] ?? '';
}

function requestWithCookie(pair: string): Request {
  return { headers: { cookie: pair } } as Request;
}

describe('opaque founder browser session integrity', () => {
  beforeEach(() => {
    rows.clear();
    failure.insert = false;
    failure.update = false;
    supabaseMock.from.mockReset();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table !== 'founder_browser_sessions') throw new Error(`unexpected table: ${table}`);
      return browserSessionTable();
    });
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('FOUNDER_API_URL', 'https://foundercontrolroom.org');
    vi.stubEnv('FOUNDER_SESSION_ENCRYPTION_KEY', ENCRYPTION_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('issues only an opaque __Host capability and encrypts credential state at rest', async () => {
    const { res, headers } = mockResponse();
    await writeFounderSession(res, session());
    const cookies = setCookies(headers);
    const primary = cookies[0] ?? '';
    expect(primary).toMatch(/^__Host-fcr_session=v1\.[A-Za-z0-9_-]{43};/);
    expect(primary).toContain('Path=/');
    expect(primary).toContain('Secure');
    expect(primary).toContain('HttpOnly');
    expect(primary).toContain('SameSite=Strict');
    expect(primary).toContain('Max-Age=28800');
    expect(primary).not.toContain(ACCESS_TOKEN);
    expect(primary).not.toContain(REFRESH_TOKEN);
    expect(cookies[1]).toContain('fcr_session=;');
    expect(cookies[1]).toContain('Max-Age=0');
    expect(rows.size).toBe(1);
    const [hash, row] = [...rows.entries()][0] ?? [];
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('v1.');
    expect(row?.access_token).toBeUndefined();
    expect(row?.refresh_token).toBeUndefined();
    expect(row?.credential_ciphertext).toEqual(expect.any(String));
    expect(row?.credential_iv).toEqual(expect.any(String));
    expect(row?.credential_auth_tag).toEqual(expect.any(String));
    expect(String(row?.credential_ciphertext)).not.toContain(ACCESS_TOKEN);
    expect(String(row?.credential_ciphertext)).not.toContain(REFRESH_TOKEN);
    expect(row?.founder_user_id).toBe(USER_ID);
    expect(row?.founder_email).toBe(EMAIL);
    expect(row?.continuity_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('resolves a valid opaque capability only through active fingerprint-bound encrypted server-side state', async () => {
    const { res, headers } = mockResponse();
    await writeFounderSession(res, session());
    const resolved = await readFounderSession(requestWithCookie(primaryCookiePair(headers)));
    expect(resolved).toEqual(expect.objectContaining({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN, expiresAt: 2_000_000_000, founderUserId: USER_ID, founderEmail: EMAIL, sessionVersion: 1 }));
    expect(resolved?.sessionIdHash).toMatch(/^[0-9a-f]{64}$/);
    expect(resolved?.continuityFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('survives equivalent database timestamp serialization without changing the bound instant', async () => {
    const { res, headers } = mockResponse();
    await writeFounderSession(res, session());
    const [hash, row] = [...rows.entries()][0] ?? [];
    expect(hash).toBeTruthy();
    const issuedAt = String(row?.issued_at ?? '');
    const expiresAt = String(row?.expires_at ?? '');
    expect(issuedAt).toMatch(/Z$/);
    expect(expiresAt).toMatch(/Z$/);
    rows.set(String(hash), {
      ...row,
      issued_at: issuedAt.replace(/Z$/, '+00:00'),
      expires_at: expiresAt.replace(/Z$/, '+00:00'),
    });

    const resolved = await readFounderSession(requestWithCookie(primaryCookiePair(headers)));
    expect(resolved).toEqual(expect.objectContaining({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      founderUserId: USER_ID,
      founderEmail: EMAIL,
      sessionExpiresAt: new Date(expiresAt).toISOString(),
    }));
  });

  it('fails closed when server-side session state no longer matches its continuity fingerprint', async () => {
    const { res, headers } = mockResponse();
    await writeFounderSession(res, session());
    const [hash, row] = [...rows.entries()][0] ?? [];
    expect(hash).toBeTruthy();
    rows.set(String(hash), { ...row, founder_email: 'tampered@example.com' });
    expect(await readFounderSession(requestWithCookie(primaryCookiePair(headers)))).toBeNull();
  });

  it('fails closed when encrypted credential state is tampered', async () => {
    const { res, headers } = mockResponse();
    await writeFounderSession(res, session());
    const [hash, row] = [...rows.entries()][0] ?? [];
    expect(hash).toBeTruthy();
    rows.set(String(hash), { ...row, credential_ciphertext: `${String(row?.credential_ciphertext ?? '')}A` });
    expect(await readFounderSession(requestWithCookie(primaryCookiePair(headers)))).toBeNull();
  });

  it('fails closed when the server encryption key is unavailable', async () => {
    vi.stubEnv('FOUNDER_SESSION_ENCRYPTION_KEY', '');
    const { res, headers } = mockResponse();
    await expect(writeFounderSession(res, session())).rejects.toThrow(/FOUNDER_SESSION_ENCRYPTION_KEY/);
    expect(headers.has('Set-Cookie')).toBe(false);
    expect(rows.size).toBe(0);
  });

  it('rejects the historical self-contained signed-cookie shape without consulting it as authority', async () => {
    expect(await readFounderSession(requestWithCookie('__Host-fcr_session=v1.payload.signature'))).toBeNull();
    expect(rows.size).toBe(0);
  });

  it('revokes a server-side session so replay of the same cookie fails closed', async () => {
    const { res, headers } = mockResponse();
    await writeFounderSession(res, session());
    const req = requestWithCookie(primaryCookiePair(headers));
    expect(await revokeFounderSession(req, 'logout')).toBe(true);
    expect(await readFounderSession(req)).toBeNull();
    expect([...rows.values()][0]?.revoke_reason).toBe('logout');
  });

  it('rotates both the opaque capability and its continuity fingerprint', async () => {
    const first = mockResponse();
    await writeFounderSession(first.res, session());
    const oldPair = primaryCookiePair(first.headers);
    const [oldHash, oldRow] = [...rows.entries()][0] ?? [];
    const oldFingerprint = String(oldRow?.continuity_fingerprint ?? '');
    const second = mockResponse();
    await rotateFounderSession(requestWithCookie(oldPair), second.res, session());
    const newPair = primaryCookiePair(second.headers);
    expect(newPair).not.toBe(oldPair);
    expect(rows.get(String(oldHash))?.revoked_at).toEqual(expect.any(String));
    expect(await readFounderSession(requestWithCookie(oldPair))).toBeNull();
    const resolved = await readFounderSession(requestWithCookie(newPair));
    expect(resolved).toEqual(expect.objectContaining({ accessToken: ACCESS_TOKEN, sessionVersion: 1 }));
    expect(resolved?.continuityFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(resolved?.continuityFingerprint).not.toBe(oldFingerprint);
  });

  it('does not issue a browser cookie when authoritative session persistence fails', async () => {
    failure.insert = true;
    const { res, headers } = mockResponse();
    await expect(writeFounderSession(res, session())).rejects.toThrow(/persist founder browser session/);
    expect(headers.has('Set-Cookie')).toBe(false);
  });

  it('preserves the old browser capability so rotation revocation failure can be retried', async () => {
    const first = mockResponse();
    await writeFounderSession(first.res, session());
    const oldPair = primaryCookiePair(first.headers);
    const oldReq = requestWithCookie(oldPair);

    failure.update = true;
    const failedRotation = mockResponse();
    await expect(rotateFounderSession(oldReq, failedRotation.res, session())).rejects.toThrow(/revoke prior founder browser session/);
    expect(failedRotation.headers.has('Set-Cookie')).toBe(false);
    expect(await readFounderSession(oldReq)).toEqual(expect.objectContaining({ accessToken: ACCESS_TOKEN }));

    failure.update = false;
    const retriedRotation = mockResponse();
    await expect(rotateFounderSession(oldReq, retriedRotation.res, session())).resolves.toBeUndefined();
    const newPair = primaryCookiePair(retriedRotation.headers);
    expect(newPair).not.toBe(oldPair);
    expect(await readFounderSession(oldReq)).toBeNull();
    expect(await readFounderSession(requestWithCookie(newPair))).toEqual(expect.objectContaining({ accessToken: ACCESS_TOKEN }));
  });

  it('clears both the opaque cookie and the legacy token-container cookie', () => {
    const { res, headers } = mockResponse();
    clearFounderSession(res);
    const cookies = setCookies(headers);
    expect(cookies[0]).toContain('__Host-fcr_session=;');
    expect(cookies[0]).toContain('Max-Age=0');
    expect(cookies[1]).toContain('fcr_session=;');
  });
});
