import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  setSession: vi.fn(),
  rpc: vi.fn(),
  rotateFounderSession: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: {
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
      signInWithOtp: mocks.signInWithOtp,
    },
  },
  createSupabaseAuthClient: () => ({
    auth: {
      verifyOtp: mocks.verifyOtp,
      setSession: mocks.setSession,
      updateUser: vi.fn(),
      getSession: vi.fn(),
    },
  }),
}));

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: vi.fn(),
  },
}));

vi.mock('../../../auth/founderSession.js', () => ({
  clearFounderSession: vi.fn(),
  readFounderSession: vi.fn(),
  revokeFounderSession: vi.fn(),
  rotateFounderSession: mocks.rotateFounderSession,
}));

vi.mock('../../middleware/security.js', () => ({
  FOUNDER_API_URL: 'https://control.example.com',
  rateLimitMagicLink: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireInteractiveFounder: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../onboarding.js', () => ({
  founderCallbackHtml: () => '<html>platform-callback</html>',
  workspaceFounderCallbackHtml: () => '<html>workspace-callback</html>',
}));

import { authRouter } from '../auth.js';

const EMAIL = 'new-founder@example.com';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_at: 2_000_000_000,
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: USER_ID, email: EMAIL },
};

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/auth', authRouter);
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signInWithOAuth.mockResolvedValue({
    data: { url: 'https://supabase.example/google' },
    error: null,
  });
  mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null });
  mocks.verifyOtp.mockResolvedValue({
    data: { session, user: session.user },
    error: null,
  });
  mocks.setSession.mockResolvedValue({
    data: { session, user: session.user },
    error: null,
  });
  mocks.rpc.mockResolvedValue({
    data: {
      email: EMAIL,
      user_id: USER_ID,
      workspace_id: WORKSPACE_ID,
      account_role: 'workspace_owner',
    },
    error: null,
  });
  mocks.rotateFounderSession.mockResolvedValue(undefined);
});

describe('customer Founder authentication', () => {
  it('starts Google auth against the customer callback, not the private Founder callback', async () => {
    const response = await request(app()).get('/auth/workspace/google');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('https://supabase.example/google');
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://control.example.com/auth/workspace/callback',
        skipBrowserRedirect: true,
      },
    });
  });

  it('sends a public customer magic link without requiring a pre-existing founder_users row', async () => {
    const response = await request(app())
      .post('/auth/workspace/magic-link')
      .send({ email: `  ${EMAIL.toUpperCase()}  ` });

    expect(response.status).toBe(202);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: EMAIL,
      options: {
        emailRedirectTo: 'https://control.example.com/auth/workspace/callback',
        shouldCreateUser: true,
      },
    });
  });

  it('provisions only workspace_owner membership after OTP verification and then establishes the opaque session', async () => {
    const response = await request(app())
      .get('/auth/workspace/callback?token_hash=verified-token');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/app/');
    expect(mocks.rpc).toHaveBeenCalledWith('provision_workspace_founder', {
      p_user_id: USER_ID,
      p_email: EMAIL,
    });
    expect(mocks.rotateFounderSession).toHaveBeenCalledTimes(1);
  });

  it('returns customer workspace identity from fragment-session handoff without granting platform authority', async () => {
    const response = await request(app())
      .post('/auth/workspace/session')
      .send({ access_token: 'access-token', refresh_token: 'refresh-token' });

    expect(response.status).toBe(201);
    expect(response.body.data.founder).toEqual({
      email: EMAIL,
      userId: USER_ID,
      role: 'workspace_owner',
      workspaceId: WORKSPACE_ID,
    });
    expect(response.body.data.founder.role).not.toBe('platform_owner');
  });

  it('fails closed when the verified identity is already reserved for platform authority', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'customer provisioning forbidden' },
    });

    const response = await request(app())
      .get('/auth/workspace/callback?token_hash=verified-token');

    expect(response.status).toBe(403);
    expect(mocks.rotateFounderSession).not.toHaveBeenCalled();
  });
});
