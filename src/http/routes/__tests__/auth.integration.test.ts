import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSignInWithOtp, mockVerifyOtp, mockSignOut, supabaseMock } = vi.hoisted(() => ({
  mockSignInWithOtp: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockSignOut: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: {
    auth: {
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: mockVerifyOtp,
      signOut: mockSignOut,
    },
  },
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { authRouter } from '../auth.js';

const FOUNDER_EMAIL = 'founder@example.com';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

function founderUsersRow(match: boolean) {
  return {
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: match ? { email: FOUNDER_EMAIL } : null, error: null }) }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSignInWithOtp.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue({ error: null });
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
    expect(mockSignInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: FOUNDER_EMAIL }));
  });
});

describe('GET /auth/callback', () => {
  it('requires token_hash', async () => {
    const res = await request(buildApp()).get('/auth/callback');
    expect(res.status).toBe(400);
  });

  it('returns 401 when verifyOtp fails', async () => {
    mockVerifyOtp.mockResolvedValue({ data: {}, error: { message: 'expired' } });
    const res = await request(buildApp()).get('/auth/callback').query({ token_hash: 'bad' });
    expect(res.status).toBe(401);
  });

  it('signs out and rejects a verified user who is not on the allowlist', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { session: { access_token: 'at', refresh_token: 'rt', expires_at: 123 }, user: { email: 'stranger@example.com' } },
      error: null,
    });
    supabaseMock.from.mockImplementation(() => founderUsersRow(false));

    const res = await request(buildApp()).get('/auth/callback').query({ token_hash: 'good' });
    expect(res.status).toBe(403);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('returns JSON when explicitly requested via ?format=json', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { session: { access_token: 'at', refresh_token: 'rt', expires_at: 123 }, user: { email: FOUNDER_EMAIL } },
      error: null,
    });
    supabaseMock.from.mockImplementation(() => founderUsersRow(true));

    const res = await request(buildApp()).get('/auth/callback').query({ token_hash: 'good', format: 'json' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      access_token: 'at',
      refresh_token: 'rt',
      expires_at: 123,
      founder: { email: FOUNDER_EMAIL },
    });
  });

  it('redirects to the frontend with the session in the URL fragment by default', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { session: { access_token: 'at', refresh_token: 'rt', expires_at: 123 }, user: { email: FOUNDER_EMAIL } },
      error: null,
    });
    supabaseMock.from.mockImplementation(() => founderUsersRow(true));

    const res = await request(buildApp())
      .get('/auth/callback')
      .query({ token_hash: 'good' })
      .redirects(0);

    expect(res.status).toBe(302);
    const location = res.headers.location;
    expect(location).toMatch(/^\/control-room\/#/);
    expect(location).toContain('access_token=at');
    // The Location header must never carry the token as a query string —
    // only in the fragment, which browsers never send back to any server.
    expect(location.split('#')[0]).toBe('/control-room/');
  });
});
