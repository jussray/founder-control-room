import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSignInWithOtp, mockSetSession, mockVerifyOtp, supabaseMock, browserSessionState } = vi.hoisted(() => ({
  mockSignInWithOtp: vi.fn(),
  mockSetSession: vi.fn(),
  mockVerifyOtp: vi.fn(),
  supabaseMock: { from: vi.fn() },
  browserSessionState: { revocationError: false },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  createSupabaseAuthClient: () => ({ auth: { setSession: mockSetSession, verifyOtp: mockVerifyOtp } }),
  supabaseAuth: { auth: { signInWithOtp: mockSignInWithOtp } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { authRouter } from '../auth.js';

const FOUNDER_EMAIL = 'founder@example.com';
const FOUNDER_USER_ID = '11111111-1111-4111-8111-111111111111';
const FOUNDER_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64url');
const VALID_OPAQUE_COOKIE = `v1.${'A'.repeat(43)}`;
const VERIFIED_USER = { id: FOUNDER_USER_ID, email: FOUNDER_EMAIL };
const SESSION = {
  access_token: 'supabase-access-token-value',
  refresh_token: 'supabase-refresh-token-value',
  expires_at: 123,
};

type ResponseWithHeaders = { headers: Record<string, string | string[] | undefined> };
function buildApp() { const app = express(); app.use(express.json()); app.use('/auth', authRouter); return app; }
function founderUsersRow(match: boolean) { return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: match ? { email: FOUNDER_EMAIL } : null, error: null }) }) }) }; }
function browserSessionTable() {
  return {
    insert: () => Promise.resolve({ data: null, error: null }),
    update: () => ({
      eq: () => ({
        is: () => Promise.resolve({
          data: null,
          error: browserSessionState.revocationError ? { message: 'session revocation unavailable' } : null,
        }),
      }),
    }),
  };
}
function setAllowlist(match: boolean) { supabaseMock.from.mockImplementation((table: string) => { if (table === 'founder_users') return founderUsersRow(match); if (table === 'founder_browser_sessions') return browserSessionTable(); throw new Error(`unexpected table: ${table}`); }); }
function setCookieHeader(res: ResponseWithHeaders): string { const cookie = res.headers['set-cookie']; expect(cookie).toBeDefined(); return Array.isArray(cookie) ? cookie.join('; ') : String(cookie); }
function expectSessionCookie(res: ResponseWithHeaders) { const cookie = setCookieHeader(res); expect(cookie).toContain('__Host-fcr_session='); expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=Strict'); expect(cookie).not.toContain(SESSION.access_token); expect(cookie).not.toContain(SESSION.refresh_token); }
function expectClearedSessionCookie(res: ResponseWithHeaders) { const cookie = setCookieHeader(res); expect(cookie).toContain('__Host-fcr_session=;'); expect(cookie).toContain('fcr_session=;'); expect(cookie).toContain('Max-Age=0'); expect(cookie).toContain('HttpOnly'); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('FOUNDER_SESSION_ENCRYPTION_KEY', FOUNDER_SESSION_ENCRYPTION_KEY);
  browserSessionState.revocationError = false;
  mockSignInWithOtp.mockResolvedValue({ error: null });
  mockSetSession.mockResolvedValue({ data: {}, error: null });
  mockVerifyOtp.mockResolvedValue({ data: {}, error: null });
});

describe('POST /auth/magic-link', () => {
  it('requires an email with the standard error envelope', async () => { const res = await request(buildApp()).post('/auth/magic-link').send({}); expect(res.status).toBe(400); expect(res.body).toEqual({ success: false, error: { code: 'BAD_REQUEST', message: 'A valid email is required.', details: [] } }); });
  it('sends the same generic response for a non-allowlisted email without sending an OTP', async () => { setAllowlist(false); const res = await request(buildApp()).post('/auth/magic-link').send({ email: 'stranger@example.com' }); expect(res.status).toBe(202); expect(res.body.success).toBe(true); expect(mockSignInWithOtp).not.toHaveBeenCalled(); });
  it('sends an OTP for an allowlisted email with the same generic response', async () => { setAllowlist(true); const res = await request(buildApp()).post('/auth/magic-link').send({ email: FOUNDER_EMAIL }); expect(res.status).toBe(202); expect(res.body.success).toBe(true); expect(mockSignInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: FOUNDER_EMAIL, options: expect.objectContaining({ shouldCreateUser: true }) })); });
});

describe('GET /auth/callback', () => {
  it('serves the same-origin callback page when token_hash is absent', async () => { const res = await request(buildApp()).get('/auth/callback'); expect(res.status).toBe(200); expect(res.headers['cache-control']).toContain('no-store'); expect(mockVerifyOtp).not.toHaveBeenCalled(); });
  it('clears any session and returns the callback page when verifyOtp fails', async () => { mockVerifyOtp.mockResolvedValue({ data: {}, error: { message: 'expired' } }); const res = await request(buildApp()).get('/auth/callback').query({ token_hash: 'bad' }); expect(res.status).toBe(401); expectClearedSessionCookie(res); });
  it('clears any session and rejects a verified user who is not on the allowlist', async () => { mockVerifyOtp.mockResolvedValue({ data: { session: SESSION, user: { id: FOUNDER_USER_ID, email: 'stranger@example.com' } }, error: null }); setAllowlist(false); const res = await request(buildApp()).get('/auth/callback').query({ token_hash: 'good' }); expect(res.status).toBe(401); expectClearedSessionCookie(res); });
  it('persists only the opaque browser capability and redirects without credential fragments', async () => { mockVerifyOtp.mockResolvedValue({ data: { session: SESSION, user: VERIFIED_USER }, error: null }); setAllowlist(true); const res = await request(buildApp()).get('/auth/callback').query({ token_hash: 'good' }).redirects(0); expect(res.status).toBe(303); expectSessionCookie(res); const location = String(res.headers.location); expect(location).toBe('/'); expect(location).not.toContain('#'); expect(location).not.toContain('access_token'); expect(location).not.toContain('refresh_token'); expect(location).not.toContain(SESSION.access_token); expect(location).not.toContain(SESSION.refresh_token); });
});

describe('POST /auth/session', () => {
  it('rejects missing implicit-flow credentials and clears the browser session', async () => { const res = await request(buildApp()).post('/auth/session').send({}); expect(res.status).toBe(400); expectClearedSessionCookie(res); expect(mockSetSession).not.toHaveBeenCalled(); });
  it('rejects invalid implicit-flow credentials and clears the browser session', async () => { mockSetSession.mockResolvedValue({ data: {}, error: { message: 'expired' } }); const res = await request(buildApp()).post('/auth/session').send({ access_token: 'bad-at', refresh_token: 'bad-rt' }); expect(res.status).toBe(401); expectClearedSessionCookie(res); });
  it('binds the separately verified user into an opaque founder browser capability', async () => { mockSetSession.mockResolvedValue({ data: { session: SESSION, user: VERIFIED_USER }, error: null }); setAllowlist(true); const res = await request(buildApp()).post('/auth/session').send({ access_token: SESSION.access_token, refresh_token: SESSION.refresh_token }); expect(res.status).toBe(201); expect(res.body).toEqual({ success: true, data: { founder: { email: FOUNDER_EMAIL } }, meta: {} }); expectSessionCookie(res); });
});

describe('POST /auth/logout', () => {
  it('preserves the browser capability when server-side revocation fails so logout can be retried', async () => {
    setAllowlist(true);
    browserSessionState.revocationError = true;
    const res = await request(buildApp())
      .post('/auth/logout')
      .set('Cookie', `__Host-fcr_session=${VALID_OPAQUE_COOKIE}`);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'SESSION_REVOCATION_FAILED',
        message: 'Founder browser session could not be revoked.',
        details: [],
      },
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('clears the browser capability only after server-side revocation succeeds', async () => {
    setAllowlist(true);
    const res = await request(buildApp())
      .post('/auth/logout')
      .set('Cookie', `__Host-fcr_session=${VALID_OPAQUE_COOKIE}`);
    expect(res.status).toBe(204);
    expectClearedSessionCookie(res);
  });
});
