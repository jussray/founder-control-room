import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
  createSupabaseAuthClient: vi.fn(),
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import {
  requireFounder,
  requireWorkspaceUser,
  type FounderRequest,
} from '../requireFounder.js';

const BEARER = 'Bearer workspace-test-token';

function allowlistRow(role: 'platform_owner' | 'workspace_owner', workspaceId: string | null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: {
            email: 'founder@example.com',
            account_role: role,
            workspace_id: workspaceId,
          },
          error: null,
        }),
      }),
    }),
  };
}

function buildApp() {
  const app = express();
  app.get('/legacy', requireFounder, (req: FounderRequest, res) => res.json({ founder: req.founder }));
  app.get('/workspace', requireWorkspaceUser, (req: FounderRequest, res) => res.json({ founder: req.founder }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'founder@example.com' } },
    error: null,
  });
});

describe('workspace tenant authorization boundary', () => {
  it('blocks a workspace owner from every legacy requireFounder route', async () => {
    supabaseMock.from.mockImplementation(() => allowlistRow('workspace_owner', 'workspace-a'));

    const res = await request(buildApp()).get('/legacy').set('Authorization', BEARER);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('This route requires platform founder authority');
  });

  it('admits a workspace owner only through requireWorkspaceUser with bound workspace identity', async () => {
    supabaseMock.from.mockImplementation(() => allowlistRow('workspace_owner', 'workspace-a'));

    const res = await request(buildApp()).get('/workspace').set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.founder).toMatchObject({
      email: 'founder@example.com',
      userId: 'user-1',
      role: 'workspace_owner',
      workspaceId: 'workspace-a',
    });
  });

  it('rejects a workspace owner whose workspace assignment is missing', async () => {
    supabaseMock.from.mockImplementation(() => allowlistRow('workspace_owner', null));

    const res = await request(buildApp()).get('/workspace').set('Authorization', BEARER);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Founder workspace assignment is required');
  });

  it('preserves legacy platform-owner access', async () => {
    supabaseMock.from.mockImplementation(() => allowlistRow('platform_owner', 'workspace-platform'));

    const res = await request(buildApp()).get('/legacy').set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.founder.role).toBe('platform_owner');
  });
});
