import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({
  founders: new Set<string>(),
  sessions: new Map<string, Record<string, unknown>>(),
  magic: vi.fn(), verify: vi.fn(), setSession: vi.fn(),
  failInsert: false, failRevoke: false, failAllowlist: false,
}));
vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { signInWithOtp: state.magic } },
  createSupabaseAuthClient: () => ({ auth: {
    verifyOtp: state.verify, setSession: state.setSession,
  } }),
}));
vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: (table: string) => {
    if (table === 'founder_users') return {
      select: () => ({ eq: (_column: string, email: string) => ({
        maybeSingle: async () => ({
          data: state.founders.has(email) ? { email } : null,
          error: state.failAllowlist ? { message: 'unavailable' } : null,
        }),
      }) }),
    };
    if (table !== 'fcr_member_browser_sessions') throw Error('unexpected table ' + table);
    return {
      insert: async (row: Record<string, unknown>) => {
        if (state.failInsert) return { error: { message: 'db unavailable' } };
        state.sessions.set(String(row.session_id_hash), { ...row });
        return { error: null };
      },
      select: () => {
        let hash = ''; let expires = '';
        const query = {
          eq: (_column: string, value: string) => { hash = value; return query; },
          is: () => query,
          gt: (_column: string, value: string) => { expires = value; return query; },
          maybeSingle: async () => {
            const row = state.sessions.get(hash);
            return { data: row && !row.revoked_at && String(row.expires_at) > expires ? row : null, error: null };
          },
        };
        return query;
      },
      update: (values: Record<string, unknown>) => {
        let hash = '';
        const query = {
          eq: (_column: string, value: string) => { hash = value; return query; },
          is: async () => {
            if (state.failRevoke) return { error: { message: 'db unavailable' } };
            const row = state.sessions.get(hash);
            if (row) state.sessions.set(hash, { ...row, ...values });
            return { error: null };
          },
        };
        return query;
      },
    };
  } },
}));

import { memberAuthRouter } from '../memberAuth.js';
import { requireFounder } from '../../middleware/requireFounder.js';

const ID_A = '22222222-2222-4222-8222-222222222222';
const ID_B = '33333333-3333-4333-8333-333333333333';
const EMAIL_A = 'member-a@example.com';
const EMAIL_B = 'member-b@example.com';
const getIdentity = (email: string, id: string) => ({ id, email });
const session = (email: string, id: string) => ({
  data: { user: getIdentity(email, id), session: { access_token: 'access-token', refresh_token: 'refresh-token' } },
  error: null,
});
function app() {
  const api = express();
  api.use(express.json());
  api.use('/auth/member', memberAuthRouter);
  api.get('/founder-only', requireFounder, (_req, res) => res.json({ private: true }));
  return api;
}
function memberCookie(response: { headers: Record<string, string | string[] | undefined> }) {
  const header = response.headers['set-cookie'];
  const cookieList = Array.isArray(header) ? header : [String(header ?? '')];
  const cookie = cookieList.find((item) => item.startsWith('__Host-fcr_member_session='));
  expect(cookie).toBeDefined();
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  expect(cookie).not.toContain('access-token');
  expect(cookie).not.toContain('refresh-token');
  return String(cookie).split(';')[0];
}
beforeEach(() => {
  state.founders.clear(); state.sessions.clear();
  state.failInsert = false; state.failRevoke = false; state.failAllowlist = false;
  state.magic.mockReset().mockResolvedValue({ error: null });
  state.verify.mockReset().mockResolvedValue({ data: {}, error: null });
  state.setSession.mockReset().mockResolvedValue({ data: {}, error: null });
  vi.stubEnv('NODE_ENV', 'test');
});
describe('isolated member access', () => {
  it('provides a generic email response without giving founder accounts a member OTP', async () => {
    state.founders.add('founder@example.com');
    const founder = await request(app()).post('/auth/member/magic-link').send({ email: 'founder@example.com' });
    expect(founder.status).toBe(202);
    expect(state.magic).not.toHaveBeenCalled();
    const member = await request(app()).post('/auth/member/magic-link').send({ email: 'Member-A@Example.com' });
    expect(member.status).toBe(202);
    expect(member.body).toEqual(founder.body);
    expect(state.magic).toHaveBeenCalledWith({
      email: EMAIL_A, options: expect.objectContaining({ shouldCreateUser: true }),
    });
  });
  it('rejects unverified and founder credentials without issuing a member cookie', async () => {
    const invalid = await request(app()).post('/auth/member/session').send({ access_token: 'invalid', refresh_token: 'invalid' });
    expect(invalid.status).toBe(401);
    expect(invalid.headers['set-cookie']).toBeUndefined();
    state.founders.add('founder@example.com');
    state.setSession.mockResolvedValue(session('founder@example.com', ID_A));
    const founder = await request(app()).post('/auth/member/session').send({ access_token: 'token', refresh_token: 'token' });
    expect(founder.status).toBe(403);
    expect(founder.headers['set-cookie']).toBeUndefined();
  });
  it('creates a revocable opaque member cookie and returns only empty member state', async () => {
    state.setSession.mockResolvedValue(session(EMAIL_A, ID_A));
    const signedIn = await request(app()).post('/auth/member/session').send({ access_token: 'token', refresh_token: 'refresh' });
    expect(signedIn.status).toBe(201);
    const cookie = memberCookie(signedIn);
    expect(state.sessions.size).toBe(1);
    expect([...state.sessions.values()][0]).not.toHaveProperty('access_token');
    expect([...state.sessions.values()][0]).not.toHaveProperty('refresh_token');
    const mine = await request(app()).get('/auth/member/me').set('Cookie', cookie);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toEqual({
      member: { userId: ID_A, email: EMAIL_A }, workspace: { projects: [], agents: [], activity: [] },
    });
    expect(JSON.stringify(mine.body)).not.toContain('founder');
    const privateResponse = await request(app()).get('/founder-only').set('Cookie', cookie);
    expect(privateResponse.status).toBe(401);
    const stranger = await request(app()).get('/auth/member/me');
    expect(stranger.status).toBe(401);
  });
  it('keeps separate account identities isolated and denies reclassified founders', async () => {
    state.setSession.mockResolvedValueOnce(session(EMAIL_A, ID_A)).mockResolvedValueOnce(session(EMAIL_B, ID_B));
    const first = await request(app()).post('/auth/member/session').send({ access_token: 'a', refresh_token: 'a' });
    const second = await request(app()).post('/auth/member/session').send({ access_token: 'b', refresh_token: 'b' });
    const cookieA = memberCookie(first), cookieB = memberCookie(second);
    expect(cookieA).not.toBe(cookieB);
    const readA = await request(app()).get('/auth/member/me').set('Cookie', cookieA);
    const readB = await request(app()).get('/auth/member/me').set('Cookie', cookieB);
    expect(readA.body.data.member.email).toBe(EMAIL_A);
    expect(readB.body.data.member.email).toBe(EMAIL_B);
    state.founders.add(EMAIL_B);
    const denyB = await request(app()).get('/auth/member/me').set('Cookie', cookieB);
    expect(denyB.status).toBe(403);
  });
  it('never claims logout after failed revocation; revokes on success', async () => {
    state.setSession.mockResolvedValue(session(EMAIL_A, ID_A));
    const signedIn = await request(app()).post('/auth/member/session').send({ access_token: 'token', refresh_token: 'refresh' });
    const cookie = memberCookie(signedIn);
    state.failRevoke = true;
    const failed = await request(app()).post('/auth/member/logout').set('Cookie', cookie).send({});
    expect(failed.status).toBe(503);
    expect(failed.headers['set-cookie']).toBeUndefined();
    expect((await request(app()).get('/auth/member/me').set('Cookie', cookie)).status).toBe(200);
    state.failRevoke = false;
    const success = await request(app()).post('/auth/member/logout').set('Cookie', cookie).send({});
    expect(success.status).toBe(204);
    expect(String(success.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await request(app()).get('/auth/member/me').set('Cookie', cookie)).status).toBe(401);
  });
  it('verifies one-time token-hash callbacks before issuing a cookie', async () => {
    state.verify.mockResolvedValue(session(EMAIL_A, ID_A));
    const result = await request(app()).get('/auth/member/callback?token_hash=safe&type=magiclink').redirects(0);
    expect(result.status).toBe(303);
    expect(result.headers.location).toBe('/member/');
    memberCookie(result);
    const callback = await request(app()).get('/auth/member/callback');
    expect(callback.status).toBe(200);
    expect(callback.text).toContain('/auth/member/callback.js');
    expect(callback.text).not.toContain('access_token');
  });
  it('fails closed if membership storage or founder authorization is unavailable', async () => {
    state.setSession.mockResolvedValue(session(EMAIL_A, ID_A));
    state.failInsert = true;
    const failStore = await request(app()).post('/auth/member/session').send({ access_token: 'token', refresh_token: 'refresh' });
    expect(failStore.status).toBe(503);
    expect(String(failStore.headers['set-cookie'])).not.toContain('__Host-fcr_member_session=');
    state.failInsert = false;
    const valid = await request(app()).post('/auth/member/session').send({ access_token: 'token', refresh_token: 'refresh' });
    state.failAllowlist = true;
    const read = await request(app()).get('/auth/member/me').set('Cookie', memberCookie(valid));
    expect(read.status).toBe(503);
    expect(read.body.data).toBeUndefined();
  });
});
