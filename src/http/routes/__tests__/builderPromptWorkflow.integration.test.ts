import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({ supabaseAuth: { auth: { getUser: mockGetUser } } }));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { builderPromptWorkflowRouter } from '../builderPromptWorkflow.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/prompt-workflows', builderPromptWorkflowRouter);
  return app;
}

function authSuccess() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: FOUNDER_EMAIL } }, error: null });
  supabaseMock.from.mockImplementation((table: string) => table === 'founder_users' ? {
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }) }) }),
  } : {});
}

beforeEach(() => vi.clearAllMocks());

describe('builder prompt workflow route', () => {
  it('rejects unauthenticated selection', async () => {
    const res = await request(buildApp()).post('/prompt-workflows/select').send({ intent: 'focused-repair' });
    expect(res.status).toBe(401);
  });

  it('returns a bounded non-executing workflow stack to the founder', async () => {
    authSuccess();
    const res = await request(buildApp())
      .post('/prompt-workflows/select')
      .set('Authorization', BEARER)
      .send({ intent: 'investment-business' });
    expect(res.status).toBe(200);
    expect(res.body.selection).toMatchObject({
      contract: 'juss/builder-prompt-workflow-router@v1',
      intent: 'investment-business',
      modes: ['investor-redteam', 'money-path', '10truth'],
      authorityChanged: false,
      executionAuthorized: false,
    });
  });

  it('fails closed on unsupported intent', async () => {
    authSuccess();
    const res = await request(buildApp())
      .post('/prompt-workflows/select')
      .set('Authorization', BEARER)
      .send({ intent: 'do-whatever' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported builder prompt intent');
  });
});
