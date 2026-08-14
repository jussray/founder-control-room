import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetUser,
  mockRefreshSession,
  mockSetSession,
  mockUpdateUser,
  mockGetSession,
  supabaseMock,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRefreshSession: vi.fn(),
  mockSetSession: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockGetSession: vi.fn(),
  supabaseMock: { from: vi.fn() },
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
import { authRouter } from '../auth.js';

const EMAIL = 'founder@example.com';
const ACCESS_TOKEN = 'access-token-value';
const REFRESH_TOKEN = 'refresh-token-value';
const SESSION = {
  access_token: ACCESS_TOKEN,
  refresh_token: REFRESH_TOKEN,
  expires_at: 2_000_000_000,
  user: { id: 'founder-user', email: EMAIL },
};

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/auth', authRouter);
  return instance;
}

function browserCookie() {
  const value = Buffer.from(JSON.stringify({
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    expiresAt: 2_000_000_000,
  })).toString('base64url');
  return `fcr_session=${encodeURIComponent(value)}`;
}

describe('POST /auth/password provider failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user', email: EMAIL } },
      error: null,
    });
    mockSetSession.mockResolvedValue({
      data: { session: SESSION, user: { id: 'founder-user', email: EMAIL } },
      error: null,
    });
    mockGetSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table !== 'founder_users') return {};
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { email: EMAIL }, error: null }),
          }),
        }),
      };
    });
  });

  it('returns a controlled envelope without leaking the Supabase provider message', async () => {
    const providerMessage = 'provider-internal database detail that must stay server-side';
    mockUpdateUser.mockResolvedValue({ error: { message: providerMessage } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await request(app())
      .post('/auth/password')
      .set('Cookie', browserCookie())
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
