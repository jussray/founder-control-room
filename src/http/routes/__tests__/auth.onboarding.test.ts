import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSignInWithOtp,
  mockSetSession,
  mockVerifyOtp,
  mockGetUser,
  mockRefreshSession,
  supabaseMock,
} = vi.hoisted(() => ({
  mockSignInWithOtp: vi.fn(),
  mockSetSession: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockGetUser: vi.fn(),
  mockRefreshSession: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: {
    auth: {
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
import { authRouter } from '../auth.js';
import { onboardingRouter } from '../onboarding.js';

const EMAIL = 'sekretbip@gmail.com';
const ACCESS_TOKEN = 'access-token-value';
const REFRESH_TOKEN = 'refresh-token-value';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/', onboardingRouter);
  instance.use('/auth', authRouter);
  return instance;
}

function setAllowlist(allowed: boolean) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== 'founder_users') return {};
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

function browserCookie() {
  const value = Buffer.from(JSON.stringify({
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    expiresAt: 2_000_000_000,
  })).toString('base64url');
  return `fcr_session=${encodeURIComponent(value)}`;
}

describe('founder browser onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAllowlist(true);
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user', email: EMAIL } },
      error: null,
    });
  });

  it('serves a login surface without embedding the founder email', async () => {
    const response = await request(app()).get('/');
    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
    expect(response.text).toContain('Founder Control Room');
    expect(response.text).not.toContain(EMAIL);
    expect(response.text).toContain('type="module"');
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
    expect(response.body.message).toMatch(/If this email is on the founder allowlist/);
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('verifies fragment credentials and establishes one HttpOnly session cookie', async () => {
    mockSetSession.mockResolvedValue({
      data: { session: validSession(), user: { id: 'founder-user', email: EMAIL } },
      error: null,
    });

    const response = await request(app())
      .post('/auth/session')
      .send({ access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true, founder: { email: EMAIL } });
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('fcr_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain(ACCESS_TOKEN);
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
    expect(response.headers['set-cookie']?.[0]).toContain('Max-Age=0');
  });

  it('authenticates browser requests from the HttpOnly session cookie', async () => {
    const response = await request(app())
      .get('/auth/me')
      .set('Cookie', browserCookie());

    expect(response.status).toBe(200);
    expect(response.body.founder).toEqual({ email: EMAIL, userId: 'founder-user' });
    expect(mockGetUser).toHaveBeenCalledWith(ACCESS_TOKEN);
  });

  it('clears the browser session on logout', async () => {
    const response = await request(app()).post('/auth/logout');
    expect(response.status).toBe(204);
    expect(response.headers['set-cookie']?.[0]).toContain('Max-Age=0');
  });

  it('serves the fragment callback page when no custom token hash is present', async () => {
    const response = await request(app()).get('/auth/callback');
    expect(response.status).toBe(200);
    expect(response.text).toContain('/assets/auth-callback.js');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
