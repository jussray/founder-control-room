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
import { pluginCenterRouter } from '../pluginCenter.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const PROJECT_ID = 'project-uuid-001';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/plugin-center', pluginCenterRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-1', email: FOUNDER_EMAIL } },
    error: null,
  });
});

describe('Plugin Center revoke idempotency', () => {
  it('returns the original revocation receipt without rewriting or re-auditing an already revoked grant', async () => {
    const update = vi.fn();
    const auditInsert = vi.fn();
    const firstRevokedAt = '2026-09-14T04:00:00.000Z';

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
            }),
          }),
        };
      }
      if (table === 'plugin_permission_grants') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'grant-1', project_id: PROJECT_ID, revoked_at: firstRevokedAt },
                error: null,
              }),
            }),
          }),
          update,
        };
      }
      if (table === 'project_events') return { insert: auditInsert };
      return {};
    });

    const res = await request(buildApp())
      .post('/plugin-center/grants/grant-1/revoke')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      grant: {
        id: 'grant-1',
        project_id: PROJECT_ID,
        revoked_at: firstRevokedAt,
      },
      alreadyRevoked: true,
    });
    expect(update).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });
});
