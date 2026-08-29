import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { Session } from '@supabase/supabase-js';

const { rows, failure, supabaseMock } = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  failure: { insert: false, update: false },
  supabaseMock: { from: vi.fn() },
}));

function browserSessionTable() {
  let operation: 'read' | 'update' = 'read';
  let updatePayload: Record<string, unknown> = {};
  let hash = '';
  let requireUnrevoked = false;
  let expiresAfter = '';

  const chain: any = {
    select: () => chain,
    eq: (field: string, value: unknown) => {
      if (field === 'session_id_hash') hash = String(value);
      return chain;
    },
    is: (field: string, value: unknown) => {
      if (field === 'revoked_at' && value === null) requireUnrevoked = true;
      return chain;
    },
    gt: (field: string, value: unknown) => {
      if (field === 'expires_at') expiresAfter = String(value);
      return chain;
    },
    insert: async (value: Record<string, unknown>) => {
      if (failure.insert) return { data: null, error: { message: 'insert failed' } };
      rows.set(String(value.session_id_hash), { ...value, revoked_at: null, revoke_reason: null });
      return { data: null, error: null };
    },
    update: (value: Record<string, unknown>) => {
      operation = 'update';
      updatePayload = value;
      return chain;
    },
    maybeSingle: async () => {
      const row = rows.get(hash) ?? null;
      if (!row) return { data: null, error: null };
      if (requireUnrevoked && row.revoked_at != null) return { data: null, error: null };
      if (expiresAfter && String(row.expires_at ?? '') <= expiresAfter) return { data: null, error: null };
      return { data: row, error: null };
    },
    then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
      if (operation !== 'update') return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      if (failure.update) return Promise.resolve({ data: null, error: { message: 'update failed' } }).then(resolve, reject);
      const row = rows.get(hash);
      if (row && (!requireUnrevoked || row.revoked_at == null)) rows.set(hash, { ...row, ...updatePayload });
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    },
  };
  return chain;
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('issues only an opaque __Host capability and stores credential state server-side', async () => {
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
    expect(row?.access_token).toBe(ACCESS_TOKEN);
    expect(row?.refresh_token).toBe(REFRESH_TOKEN);
    expect(row?.founder_user_id).toBe(USER_ID);
    expect(row?.founder_email).toBe(EMAIL);
  });

  it('resolves a valid opaque capability only through active server-side state', async () => {
    const { res, headers } = mockResponse();
    await writeFounderSession(res, session());

    const resolved = await readFounderSession(requestWithCookie(primaryCookiePair(headers)));
    expect(resolved).toEqual(expect.objectContaining({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      expiresAt: 2_000_000_000,
      founderUserId: USER_ID,
      founderEmail: EMAIL,
      sessionVersion: 1,
    }));
    expect(resolved?.sessionIdHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects the historical self-contained signed-cookie shape without consulting it as authority', async () => {
    const forged = 'v1.payload.signature';
    expect(await readFounderSession(requestWithCookie(`__Host-fcr_session=${forged}`))).toBeNull();
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

  it('rotates the opaque capability and leaves the prior capability revoked', async () => {
    const first = mockResponse();
    await writeFounderSession(first.res, session());
    const oldPair = primaryCookiePair(first.headers);
    const oldHash = [...rows.keys()][0] ?? '';

    const second = mockResponse();
    await rotateFounderSession(requestWithCookie(oldPair), second.res, session());
    const newPair = primaryCookiePair(second.headers);

    expect(newPair).not.toBe(oldPair);
    expect(rows.get(oldHash)?.revoked_at).toEqual(expect.any(String));
    expect(await readFounderSession(requestWithCookie(oldPair))).toBeNull();
    expect(await readFounderSession(requestWithCookie(newPair))).toEqual(expect.objectContaining({
      accessToken: ACCESS_TOKEN,
      sessionVersion: 1,
    }));
  });

  it('does not issue a browser cookie when authoritative session persistence fails', async () => {
    failure.insert = true;
    const { res, headers } = mockResponse();

    await expect(writeFounderSession(res, session())).rejects.toThrow(/persist founder browser session/);
    expect(headers.has('Set-Cookie')).toBe(false);
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
