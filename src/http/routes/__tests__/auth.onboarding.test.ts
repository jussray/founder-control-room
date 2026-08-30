import type { Session } from '@supabase/supabase-js';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSignInWithOAuth,
  mockSignInWithOtp,
  mockSetSession,
  mockVerifyOtp,
  mockGetUser,
  mockRefreshSession,
  supabaseMock,
  browserSessions,
} = vi.hoisted(() => ({
  mockSignInWithOAuth: vi.fn(),
  mockSignInWithOtp: vi.fn(),
  mockSetSession: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockGetUser: vi.fn(),
  mockRefreshSession: vi.fn(),
  supabaseMock: { from: vi.fn() },
  browserSessions: new Map<string, Record<string, unknown>>(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: {
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
      signInWithOtp: mockSignInWithOtp,
      getUser: mockGetUser,
    },
  },
  createSupabaseAuthClient: () => ({
    auth: {
      setSession: mockSetSession,
      verifyOtp: mockVerifyOtp,
      refreshSession: mockRefreshSession,
    },
  }),
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { writeFounderSession } from '../../../auth/founderSession.js';
import { authRouter } from '../auth.js';
import { onboardingRouter } from '../onboarding.js';

const EMAIL = 'sekretbip@gmail.com';
const ACCESS_TOKEN = 'access-token-value';
const REFRESH_TOKEN = 'refresh-token-value';
const FOUNDER_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64url');

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/', onboardingRouter);
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
        if (row && (!requireUnrevoked || row.revoked_at == null)) {
          browserSessions.set(sessionHash, { ...row, ...updatePayload });
        }
      }
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    },
  };
  return chain;
}

function setAllowlist(allowed: boolean) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_browser_sessions') return browserSessionTable();
    if (table !== 'founder_users') throw new Error(`unexpected table: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: allowed ? { email: EMAIL } : null,
            error: null,
          }),
        }),
      }),
    };
  });
}

function validSession() {
  return {
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    expires_at: 2_000_000_000,
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'founder-user', email: EMAIL },
  };
}

async function browserCookie() {
  let setCookie: unknown = '';
  const res = {
    setHeader(name: string, value: unknown) {
      if (name.toLowerCase() === 'set-cookie') setCookie = value;
      return res;
    },
  } as unknown as Response;
  await writeFounderSession(res, validSession() as unknown as Session);
  const cookies = Array.isArray(setCookie) ? setCookie.map(String) : [String(setCookie)];
  return (cookies[0] ?? '').split(';', 1)[0] ?? '';
}

describe('founder browser onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserSessions.clear();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('FOUNDER_API_URL', 'https://control.example.com');
    vi.stubEnv('FOUNDER_SESSION_ENCRYPTION_KEY', FOUNDER_SESSION_ENCRYPTION_KEY);
    setAllowlist(true);
    mockSignInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: 'https://supabase.example/authorize/google' },
      error: null,
    });
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user', email: EMAIL } },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves Google login and the full founder workspace onboarding surface without embedding the founder email', async () => {
    const response = await request(app()).get('/');
    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
    expect(response.text).toContain('Founder Control Room');
    expect(response.text).toContain('Continue with Google');
    expect(response.text).toContain('/auth/google');
    expect(response.text).toContain('GitHub Workspace');
    expect(response.text).toContain('Command Bridge');
    expect(response.text).toContain('HubSpot');
    expect(response.text).toContain('Playwright');
    expect(response.text).not.toContain(EMAIL);
    expect(response.text).toContain('type="module"');
  });

  it('starts Google OAuth through Supabase and returns a no-store redirect', async () => {
    const response = await request(app()).get('/auth/google');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('https://supabase.example/authorize/google');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: expect.stringMatching(/\/auth\/callback$/),
        skipBrowserRedirect: true,
      },
    });
  });

  it('returns a controlled error when Google OAuth cannot start', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: null },
      error: { message: 'provider disabled' },
    });

    const response = await request(app()).get('/auth/google');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('OAUTH_UNAVAILABLE');
    expect(response.body.error.message).toMatch(/temporarily unavailable/);
    expect(response.body.error.details).toEqual([]);
  });

  it('sends a first-login magic link only for the allowlisted email', async () => {
    const response = await request(app())
      .post('/auth/magic-link')
      .send({ email: `  ${EMAIL.toUpperCase()}  ` });

    expect(response.status).toBe(202);
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: EMAIL,
      options: expect.objectContaining({
        shouldCreateUser: true,
        emailRedirectTo: expect.stringMatching(/\/auth\/callback$/),
      }),
    });
  });

  it('returns the same generic magic-link response for an unapproved email', async () => {
    setAllowlist(false);
    const response = await request(app())
      .post('/auth/magic-link')
      .send({ email: 'not-founder@example.com' });

    expect(response.status).toBe(202);
    expect(response.body.data.message).toMatch(/If this email is on the founder allowlist/);
    expect(response.body.meta).toEqual({});
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('verifies fragment credentials and establishes one strict opaque secure HttpOnly session cookie', async () => {
    mockSetSession.mockResolvedValue({
      data: { session: validSession(), user: { id: 'founder-user', email: EMAIL } },
      error: null,
    });

    const response = await request(app())
      .post('/auth/session')
      .send({ access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: { founder: { email: EMAIL } },
      meta: {},
    });
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('__Host-fcr_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
    expect(cookie).not.toContain(ACCESS_TOKEN);
    expect(cookie).not.toContain(REFRESH_TOKEN);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(browserSessions.size).toBe(1);
  });

  it('rejects a valid Supabase session when the email is not allowlisted', async () => {
    setAllowlist(false);
    mockSetSession.mockResolvedValue({
      data: { session: validSession(), user: { id: 'outsider', email: 'outsider@example.com' } },
      error: null,
    });

    const response = await request(app())
      .post('/auth/session')
      .send({ access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.headers['set-cookie']?.[0]).toContain('Max-Age=0');
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('authenticates browser requests by resolving the opaque capability server-side', async () => {
    const response = await request(app())
      .get('/auth/me')
      .set('Cookie', await browserCookie());

    expect(response.status).toBe(200);
    expect(response.body.data.founder).toEqual({ email: EMAIL, userId: 'founder-user' });
    expect(response.body.meta).toEqual({});
    expect(mockGetUser).toHaveBeenCalledWith(ACCESS_TOKEN);
  });

  it('clears the browser session on logout', async () => {
    const response = await request(app()).post('/auth/logout');
    expect(response.status).toBe(204);
    expect(response.headers['set-cookie']?.[0]).toContain('Max-Age=0');
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('serves the fragment callback page when no custom token hash is present', async () => {
    const response = await request(app()).get('/auth/callback');
    expect(response.status).toBe(200);
    expect(response.text).toContain('/assets/auth-callback.js');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
