import type { Session } from '@supabase/supabase-js';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetUser,
  mockRefreshSession,
  mockSetSession,
  mockUpdateUser,
  mockGetSession,
  supabaseMock,
  browserSessions,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRefreshSession: vi.fn(),
  mockSetSession: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockGetSession: vi.fn(),
  supabaseMock: { from: vi.fn() },
  browserSessions: new Map<string, Record<string, unknown>>(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: {
    auth: {
      getUser: mockGetUser,
    },
  },
  createSupabaseAuthClient: () => ({
    auth: {
      refreshSession: mockRefreshSession,
      setSession: mockSetSession,
      updateUser: mockUpdateUser,
      getSession: mockGetSession,
    },
  }),
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { writeFounderSession } from '../../../auth/founderSession.js';
import { authRouter } from '../auth.js';

const EMAIL = 'founder@example.com';
const ACCESS_TOKEN = 'access-token-value';
const REFRESH_TOKEN = 'refresh-token-value';
const SESSION = {
  access_token: ACCESS_TOKEN,
  refresh_token: REFRESH_TOKEN,
  expires_at: 2_000_000_000,
  user: { id: '11111111-1111-4111-8111-111111111111', email: EMAIL },
};

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/auth', authRouter);
  return instance;
}

function browserSessionTable() {
  let operation: 'read' | 'update' = 'read';
  let updatePayload: Record<string, unknown> = {};
  let sessionHash = '';
  let requireUnrevoked = false;
  let expiresAfter = '';
  const chain: any = {
    select: () => chain,
    eq: (field: string, value: unknown) => {
      if (field === 'session_id_hash') sessionHash = String(value);
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
      browserSessions.set(String(value.session_id_hash), { ...value, revoked_at: null, revoke_reason: null });
      return { data: null, error: null };
    },
    update: (value: Record<string, unknown>) => {
      operation = 'update';
      updatePayload = value;
      return chain;
    },
    maybeSingle: async () => {
      const row = browserSessions.get(sessionHash) ?? null;
      if (!row) return { data: null, error: null };
      if (requireUnrevoked && row.revoked_at != null) return { data: null, error: null };
      if (expiresAfter && String(row.expires_at ?? '') <= expiresAfter) return { data: null, error: null };
      return { data: row, error: null };
    },
    then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
      if (operation === 'update') {
        const row = browserSessions.get(sessionHash);
        if (row && (!requireUnrevoked || row.revoked_at == null)) browserSessions.set(sessionHash, { ...row, ...updatePayload });
      }
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    },
  };
  return chain;
}

async function browserCookie() {
  let setCookie: unknown = '';
  const res = {
    setHeader(name: string, value: unknown) {
      if (name.toLowerCase() === 'set-cookie') setCookie = value;
      return res;
    },
  } as unknown as Response;
  await writeFounderSession(res, SESSION as unknown as Session);
  const cookies = Array.isArray(setCookie) ? setCookie.map(String) : [String(setCookie)];
  return (cookies[0] ?? '').split(';', 1)[0] ?? '';
}

describe('POST /auth/password provider failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserSessions.clear();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('FOUNDER_API_URL', 'https://control.example.com');
    mockGetUser.mockResolvedValue({
      data: { user: { id: SESSION.user.id, email: EMAIL } },
      error: null,
    });
    mockSetSession.mockResolvedValue({
      data: { session: SESSION, user: { id: SESSION.user.id, email: EMAIL } },
      error: null,
    });
    mockGetSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_browser_sessions') return browserSessionTable();
      if (table !== 'founder_users') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { email: EMAIL }, error: null }),
          }),
        }),
      };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a controlled envelope without leaking the Supabase provider message', async () => {
    const providerMessage = 'provider-internal database detail that must stay server-side';
    mockUpdateUser.mockResolvedValue({ error: { message: providerMessage } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await request(app())
      .post('/auth/password')
      .set('Cookie', await browserCookie())
      .send({
        password: 'correct horse battery staple',
        confirmPassword: 'correct horse battery staple',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'PASSWORD_UPDATE_FAILED',
        message: 'The password could not be updated.',
        details: [],
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(providerMessage);
    expect(warn).toHaveBeenCalledWith('Founder credential update failed:', providerMessage);

    warn.mockRestore();
  });
});
