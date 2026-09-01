import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearFounderSession: vi.fn(),
  readFounderSession: vi.fn(),
  revokeFounderSession: vi.fn(),
  rotateFounderSession: vi.fn(),
  writeFounderSession: vi.fn(),
  setSession: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  supabaseFrom: vi.fn(),
}));

vi.mock('../../../auth/founderSession.js', () => ({
  clearFounderSession: mocks.clearFounderSession,
  readFounderSession: mocks.readFounderSession,
  revokeFounderSession: mocks.revokeFounderSession,
  rotateFounderSession: mocks.rotateFounderSession,
  writeFounderSession: mocks.writeFounderSession,
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  createSupabaseAuthClient: () => ({
    auth: {
      setSession: mocks.setSession,
      verifyOtp: mocks.verifyOtp,
    },
  }),
  supabaseAuth: {
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
      signInWithOtp: mocks.signInWithOtp,
    },
  },
}));

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: mocks.supabaseFrom },
}));

import express from 'express';
import request from 'supertest';
import { authRouter } from '../auth.js';

const EMAIL = 'founder@example.com';
const USER = { id: 'founder-user', email: EMAIL };
const SESSION = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_at: 2_000_000_000,
  user: USER,
};
const COOKIE = `__Host-fcr_session=v1.${'A'.repeat(43)}`;

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/auth', authRouter);
  return instance;
}

function allowlist() {
  mocks.supabaseFrom.mockImplementation((table: string) => {
    if (table !== 'founder_users') throw new Error(`unexpected table: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { email: EMAIL }, error: null }),
        }),
      }),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  allowlist();
  mocks.revokeFounderSession.mockResolvedValue(true);
  mocks.rotateFounderSession.mockResolvedValue(undefined);
  mocks.writeFounderSession.mockResolvedValue(undefined);
  mocks.setSession.mockResolvedValue({ data: { session: SESSION, user: USER }, error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { session: SESSION, user: USER }, error: null });
});

describe('founder session rotation retry membrane', () => {
  it('does not erase the existing cookie when /auth/session rotation revocation fails', async () => {
    mocks.rotateFounderSession.mockRejectedValueOnce(new Error('Unable to revoke prior founder browser session'));

    const response = await request(app())
      .post('/auth/session')
      .set('Cookie', COOKIE)
      .send({ access_token: SESSION.access_token, refresh_token: SESSION.refresh_token });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SESSION_UNAVAILABLE');
    expect(mocks.clearFounderSession).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('routes OAuth replacement through the same strict single-use rotation membrane', async () => {
    mocks.rotateFounderSession.mockRejectedValueOnce(new Error('Unable to revoke prior founder browser session'));

    const response = await request(app())
      .get('/auth/callback')
      .set('Cookie', COOKIE)
      .query({ token_hash: 'verified-token' });

    expect(response.status).toBe(503);
    expect(mocks.rotateFounderSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ access_token: SESSION.access_token, refresh_token: SESSION.refresh_token }),
    );
    expect(mocks.revokeFounderSession).not.toHaveBeenCalled();
    expect(mocks.writeFounderSession).not.toHaveBeenCalled();
    expect(mocks.clearFounderSession).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
