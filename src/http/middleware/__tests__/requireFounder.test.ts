import type { Session } from '@supabase/supabase-js';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FounderRequest } from '../requireFounder.js';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  refreshSession: vi.fn(),
  createAuthClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: {
    auth: { getUser: mocks.getUser },
  },
  createSupabaseAuthClient: mocks.createAuthClient,
}));

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: mocks.from },
}));

import { requireFounder } from '../requireFounder.js';

const allowlistChain = {
  select: mocks.select,
  eq: mocks.eq,
  maybeSingle: mocks.maybeSingle,
};

function founderCookie(
  accessToken = 'cookie-access-token',
  refreshToken = 'cookie-refresh-token',
): string {
  const encoded = Buffer.from(
    JSON.stringify({ accessToken, refreshToken }),
    'utf8',
  ).toString('base64url');
  return `fcr_session=${encoded}`;
}

function refreshedSession(): Session {
  return {
    access_token: 'refreshed-access-token',
    refresh_token: 'refreshed-refresh-token',
    expires_in: 3_600,
    expires_at: Math.floor(Date.now() / 1_000) + 3_600,
    token_type: 'bearer',
    user: {
      id: 'founder-user-1',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-07-23T00:00:00.000Z',
      email: 'founder@example.com',
    },
  };
}

function createProbeApp() {
  const app = express();
  app.get('/protected', requireFounder, (req: FounderRequest, res) => {
    res.json({ founder: req.founder });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.from.mockImplementation((table: string) => {
    if (table !== 'founder_users') throw new Error(`Unexpected table ${table}`);
    return allowlistChain;
  });
  mocks.select.mockReturnValue(allowlistChain);
  mocks.eq.mockReturnValue(allowlistChain);
  mocks.maybeSingle.mockResolvedValue({
    data: { email: 'founder@example.com' },
    error: null,
  });

  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'founder-user-1',
        email: '  FOUNDER@EXAMPLE.COM ',
      },
    },
    error: null,
  });
  mocks.refreshSession.mockResolvedValue({
    data: { session: null, user: null },
    error: { message: 'refresh unavailable' },
  });
  mocks.createAuthClient.mockReturnValue({
    auth: { refreshSession: mocks.refreshSession },
  });
});

describe('requireFounder', () => {
  it('requires a bearer token or founder cookie', async () => {
    const response = await request(createProbeApp()).get('/protected');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Founder session required' });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects a malformed founder cookie without provider calls', async () => {
    const response = await request(createProbeApp())
      .get('/protected')
      .set('Cookie', 'fcr_session=not-valid-base64-json');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Founder session required' });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('normalizes an authenticated allowlisted founder identity', async () => {
    const response = await request(createProbeApp())
      .get('/protected')
      .set('Authorization', 'Bearer founder-access-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      founder: {
        email: 'founder@example.com',
        userId: 'founder-user-1',
      },
    });
    expect(mocks.getUser).toHaveBeenCalledWith('founder-access-token');
    expect(mocks.eq).toHaveBeenCalledWith('email', 'founder@example.com');
    expect(mocks.createAuthClient).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('does not refresh an invalid explicit bearer session through a cookie', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid bearer' },
    });

    const response = await request(createProbeApp())
      .get('/protected')
      .set('Authorization', 'Bearer invalid-bearer')
      .set('Cookie', founderCookie());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Invalid or expired founder session',
    });
    expect(mocks.createAuthClient).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('denies an authenticated identity that is not allowlisted', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await request(createProbeApp())
      .get('/protected')
      .set('Authorization', 'Bearer authenticated-nonfounder');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Not on the founder allowlist' });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('fails closed when the founder allowlist cannot be checked', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    });

    const response = await request(createProbeApp())
      .get('/protected')
      .set('Authorization', 'Bearer founder-access-token');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Founder allowlist check failed' });
  });

  it('refreshes an expired cookie and writes it only after founder authorization', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'expired access token' },
    });
    const session = refreshedSession();
    mocks.refreshSession.mockResolvedValue({
      data: { session, user: session.user },
      error: null,
    });

    const response = await request(createProbeApp())
      .get('/protected')
      .set('Cookie', founderCookie());

    expect(response.status).toBe(200);
    expect(mocks.refreshSession).toHaveBeenCalledWith({
      refresh_token: 'cookie-refresh-token',
    });
    expect(mocks.eq).toHaveBeenCalledWith('email', 'founder@example.com');
    expect(response.headers['set-cookie']?.[0]).toContain('fcr_session=');
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('does not renew a refreshed cookie for an authenticated nonfounder', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'expired access token' },
    });
    const session = refreshedSession();
    mocks.refreshSession.mockResolvedValue({
      data: { session, user: session.user },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await request(createProbeApp())
      .get('/protected')
      .set('Cookie', founderCookie());

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Not on the founder allowlist' });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a refreshed provider identity without a stable user id', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'expired access token' },
    });
    const session = refreshedSession();
    mocks.refreshSession.mockResolvedValue({
      data: {
        session,
        user: { email: 'founder@example.com' },
      },
      error: null,
    });

    const response = await request(createProbeApp())
      .get('/protected')
      .set('Cookie', founderCookie());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Invalid or expired founder session',
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects an initial provider identity without a stable user id', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'founder@example.com' } },
      error: null,
    });

    const response = await request(createProbeApp())
      .get('/protected')
      .set('Authorization', 'Bearer malformed-provider-user');

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
