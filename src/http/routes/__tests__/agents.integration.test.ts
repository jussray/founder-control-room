import { boundFounderRow } from './founderAuthFixture.js';
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
import { agentsRouter } from '../agents.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

function buildApp() {
  const app = express();
  app.use('/agents', agentsRouter);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /agents', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(buildApp()).get('/agents');
    expect(res.status).toBe(401);
  });

  it('returns the multitool registry mirroring GLOBAL_AI.md', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: FOUNDER_EMAIL, email_confirmed_at: '2026-11-15T00:00:00Z' } }, error: null });
    supabaseMock.from.mockImplementation(() => ({
      ...boundFounderRow(FOUNDER_EMAIL, 'u1'),
    }));

    const res = await request(buildApp()).get('/agents').set('Authorization', BEARER);
    expect(res.status).toBe(200);
    const ids = res.body.agents.map((a: { id: string }) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['claude-code', 'codex', 'perplexity', 'github', 'supabase']));
  });
});
