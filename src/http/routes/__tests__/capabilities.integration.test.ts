import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { capabilitiesRouter } from '../capabilities.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

function buildApp() {
  const app = express();
  app.use('/capabilities', capabilitiesRouter);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /capabilities', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(buildApp()).get('/capabilities');
    expect(res.status).toBe(401);
  });

  it('returns reviewed capabilities only after founder authorization', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: FOUNDER_EMAIL } },
      error: null,
    });
    supabaseMock.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { email: FOUNDER_EMAIL },
            error: null,
          }),
        }),
      }),
    }));

    const res = await request(buildApp())
      .get('/capabilities')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'webhook-verify-hmac-worker-v1' }),
    ]));
  });
});
