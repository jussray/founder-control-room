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
const SESSION = {
  access_token: 'at',
  refresh_token: 'rt',
  expires_at: 123,
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

function setCookieHeader(res: ResponseWithHeaders): string {
  const cookie = res.headers['set-cookie'];
  expect(cookie).toBeDefined();
  return Array.isArray(cookie) ? cookie.join('; ') : String(cookie);
}

function expectSessionCookie(res: ResponseWithHeaders) {
  const cookie = setCookieHeader(res);
  expect(cookie).toContain('fcr_session=');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
}

function expectClearedSessionCookie(res: ResponseWithHeaders) {
  const cookie = setCookieHeader(res);
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
  it('requires an email', async () => {
    const res = await request(buildApp()).post('/auth/magic-link').send({});
    expect(res.status).toBe(400);
  });

  it('sends the same generic response for a non-allowlisted email without sending an OTP', async () => {
    supabaseMock.from.mockImplementation(() => founderUsersRow(false));
    const res = await request(buildApp()).post('/auth/magic-link').send({ email: 'stranger@example.com' });
    expect(res.status).toBe(202);
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('sends an OTP for an allowlisted email with the same generic response', async () => {
    supabaseMock.from.mockImplementation(() => founderUsersRow(true));
    const res = await request(buildApp()).post('/auth/magic-link').send({ email: FOUNDER_EMAIL });
    expect(res.status).toBe(202);
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
      data: { session: SESSION, user: { email: 'stranger@example.com' } },
      error: null,
    });
    supabaseMock.from.mockImplementation(() => founderUsersRow(false));

    const res = await request(buildApp()).get('/auth/callback').query({ token_hash: 'good' });
    expect(res.status).toBe(401);
    expectClearedSessionCookie(res);
  });

  it('sets an HttpOnly session cookie and redirects to the Control Room by default', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { session: SESSION, user: { email: FOUNDER_EMAIL } },
      error: null,
    });
    supabaseMock.from.mockImplementation(() => founderUsersRow(true));

    const res = await request(buildApp())
      .get('/auth/callback')
      .query({ token_hash: 'good' })
      .redirects(0);

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/');
    expectSessionCookie(res);
    expect(res.headers.location).not.toContain('access_token');
  });
});

describe('POST /auth/session', () => {
  it('rejects missing implicit-flow credentials and clears the browser session', async () => {
    const res = await request(buildApp()).post('/auth/session').send({});
    expect(res.status).toBe(400);
    expectClearedSessionCookie(res);
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('rejects invalid implicit-flow credentials and clears the browser session', async () => {
    mockSetSession.mockResolvedValue({ data: {}, error: { message: 'expired' } });
    const res = await request(buildApp())
      .post('/auth/session')
      .send({ access_token: 'bad-at', refresh_token: 'bad-rt' });

    expect(res.status).toBe(401);
    expectClearedSessionCookie(res);
  });

  it('converts valid implicit-flow credentials into an HttpOnly founder session', async () => {
    mockSetSession.mockResolvedValue({
      data: { session: SESSION, user: { email: FOUNDER_EMAIL } },
      error: null,
    });
    supabaseMock.from.mockImplementation(() => founderUsersRow(true));

    const res = await request(buildApp())
      .post('/auth/session')
      .send({ access_token: 'at', refresh_token: 'rt' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, founder: { email: FOUNDER_EMAIL } });
    expectSessionCookie(res);
  });
});
