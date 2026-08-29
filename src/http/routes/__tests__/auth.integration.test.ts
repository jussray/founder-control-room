import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSignInWithOtp,
  mockSetSession,
  mockVerifyOtp,
  supabaseMock,
} = vi.hoisted(() => ({
  mockSignInWithOtp: vi.fn(),
  mockSetSession: vi.fn(),
  mockVerifyOtp: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  createSupabaseAuthClient: () => ({
    auth: {
      setSession: mockSetSession,
      verifyOtp: mockVerifyOtp,
    },
  }),
  supabaseAuth: {
    auth: {
      signInWithOtp: mockSignInWithOtp,
    },
  },
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { authRouter } from '../auth.js';

const FOUNDER_EMAIL = 'founder@example.com';
const FOUNDER_USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION = {
  access_token: 'at',
  refresh_token: 'rt',
  expires_at: 123,
  user: { id: FOUNDER_USER_ID, email: FOUNDER_EMAIL },
};

type ResponseWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

function founderUsersRow(match: boolean) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: match ? { email: FOUNDER_EMAIL } : null, error: null }),
      }),
    }),
  };
}

function browserSessionTable() {
  return {
    insert: () => Promise.resolve({ data: null, error: null }),
  };
}

function setAllowlist(match: boolean) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow(match);
    if (table === 'founder_browser_sessions') return browserSessionTable();
    throw new Error(`unexpected table: ${table}`);
  });
}

function setCookieHeader(res: ResponseWithHeaders): string {
  const cookie = res.headers['set-cookie'];
  expect(cookie).toBeDefined();
  return Array.isArray(cookie) ? cookie.join('; ') : String(cookie);
}

function expectSessionCookie(res: ResponseWithHeaders) {
  const cookie = setCookieHeader(res);
  expect(cookie).toContain('__Host-fcr_session=');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('SameSite=Strict');
  expect(cookie).not.toContain(SESSION.access_token);
  expect(cookie).not.toContain(SESSION.refresh_token);
}

function expectClearedSessionCookie(res: ResponseWithHeaders) {
  const cookie = setCookieHeader(res);
  expect(cookie).toContain('__Host-fcr_session=;');
  expect(cookie).toContain('fcr_session=;');
  expect(cookie).toContain('Max-Age=0');
  expect(cookie).toContain('HttpOnly');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSignInWithOtp.mockResolvedValue({ error: null });
  mockSetSession.mockResolvedValue({ data: {}, error: null });
  mockVerifyOtp.mockResolvedValue({ data: {}, error: null });
});

describe('POST /auth/magic-link', () => {
  it('requires an email with the standard error envelope', async () => {
    const res = await request(buildApp()).post('/auth/magic-link').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'A valid email is required.',
        details: [],
      },
    });
  });

  it('sends the same generic response for a non-allowlisted email without sending an OTP', async () => {
    setAllowlist(false);
    const res = await request(buildApp()).post('/auth/magic-link').send({ email: 'stranger@example.com' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      success: true,
      data: {
        message: 'If this email is on the founder allowlist, a secure login link has been sent.',
      },
      meta: {},
    });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('sends an OTP for an allowlisted email with the same generic response', async () => {
    setAllowlist(true);
    const res = await request(buildApp()).post('/auth/magic-link').send({ email: FOUNDER_EMAIL });
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toMatch(/secure login link has been sent/);
    expect(res.body.meta).toEqual({});
    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: FOUNDER_EMAIL,
        options: expect.objectContaining({ shouldCreateUser: true }),
      }),
    );
  });
});

describe('GET /auth/callback', () => {
  it('serves the same-origin callback page when token_hash is absent', async () => {
    const res = await request(buildApp()).get('/auth/callback');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.text).toContain('Completing founder login');
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('clears any session and returns the callback page when verifyOtp fails', async () => {
    mockVerifyOtp.mockResolvedValue({ data: {}, error: { message: 'expired' } });
    const res = await request(buildApp()).get('/auth/callback').query({ token_hash: 'bad' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('Completing founder login');
    expectClearedSessionCookie(res);
  });

  it('clears any session and rejects a verified user who is not on the allowlist', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { session: SESSION, user: { id: FOUNDER_USER_ID, email: 'stranger@example.com' } },
      error: null,
    });
    setAllowlist(false);

    const res = await request(buildApp()).get('/auth/callback').query({ token_hash: 'good' });
    expect(res.status).toBe(401);
    expectClearedSessionCookie(res);
  });

  it('sets an opaque HttpOnly session cookie and redirects to the Control Room dashboard with a session handoff', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { session: SESSION, user: { id: FOUNDER_USER_ID, email: FOUNDER_EMAIL } },
      error: null,
    });
    setAllowlist(true);

    const res = await request(buildApp())
      .get('/auth/callback')
      .query({ token_hash: 'good' })
      .redirects(0);

    expect(res.status).toBe(303);
    expectSessionCookie(res);

    const location = String(res.headers.location);
    expect(location.startsWith('/control-room/#')).toBe(true);
    const fragment = new URLSearchParams(location.split('#')[1]);
    expect(fragment.get('access_token')).toBe(SESSION.access_token);
    expect(fragment.get('refresh_token')).toBe(SESSION.refresh_token);
    expect(fragment.get('expires_at')).toBe(String(SESSION.expires_at));
    expect(fragment.get('email')).toBe(FOUNDER_EMAIL);
  });
});

describe('POST /auth/session', () => {
  it('rejects missing implicit-flow credentials and clears the browser session', async () => {
    const res = await request(buildApp()).post('/auth/session').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.details).toEqual([]);
    expectClearedSessionCookie(res);
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('rejects invalid implicit-flow credentials and clears the browser session', async () => {
    mockSetSession.mockResolvedValue({ data: {}, error: { message: 'expired' } });
    const res = await request(buildApp())
      .post('/auth/session')
      .send({ access_token: 'bad-at', refresh_token: 'bad-rt' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.details).toEqual([]);
    expectClearedSessionCookie(res);
  });

  it('converts valid implicit-flow credentials into an opaque founder browser capability', async () => {
    mockSetSession.mockResolvedValue({
      data: { session: SESSION, user: { id: FOUNDER_USER_ID, email: FOUNDER_EMAIL } },
      error: null,
    });
    setAllowlist(true);

    const res = await request(buildApp())
      .post('/auth/session')
      .send({ access_token: 'at', refresh_token: 'rt' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: { founder: { email: FOUNDER_EMAIL } },
      meta: {},
    });
    expectSessionCookie(res);
  });
});
