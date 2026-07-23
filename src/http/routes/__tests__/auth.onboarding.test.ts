import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSignInWithOAuth,
  mockSignInWithOtp,
  mockSetSession,
  mockVerifyOtp,
  mockGetUser,
  mockRefreshSession,
  supabaseMock,
} = vi.hoisted(() => ({
  mockSignInWithOAuth: vi.fn(),
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
    process.env.NODE_ENV = 'test';
    process.env.FOUNDER_API_URL = 'https://control.example.com';
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
    expect(response.body.error).toMatch(/temporarily unavailable/);
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

  it('verifies fragment credentials and establishes one strict secure HttpOnly session cookie', async () => {
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
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
    expect(cookie).not.toContain(ACCESS_TOKEN);
    expect(response.headers['cache-control']).toBe('private, no-store');
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
    expect(response.headers['cache-control']).toBe('private, no-store');
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
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('serves the fragment callback page when no custom token hash is present', async () => {
    const response = await request(app()).get('/auth/callback');
    expect(response.status).toBe(200);
    expect(response.text).toContain('/assets/auth-callback.js');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
