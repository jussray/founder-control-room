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
import { authorityLevelsRouter } from '../authorityLevels.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

function buildApp() {
  const app = express();
  app.use('/authority-levels', authorityLevelsRouter);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /authority-levels', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(buildApp()).get('/authority-levels');
    expect(res.status).toBe(401);
  });

  it('returns L0 through L6', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: FOUNDER_EMAIL } }, error: null });
    supabaseMock.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }) }) }),
    }));

    const res = await request(buildApp()).get('/authority-levels').set('Authorization', BEARER);
    expect(res.status).toBe(200);
    expect(res.body.levels.map((l: { level: string }) => l.level)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
  });
});
