import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock, mockControllerRun, mockAuditInsert } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  mockControllerRun: vi.fn(),
  mockAuditInsert: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

vi.mock('../../../controllers/ProjectController.js', () => ({
  ProjectController: class MockProjectController {
    run = mockControllerRun;
  },
}));

import express from 'express';
import request from 'supertest';
import { dashboardRouter } from '../dashboard.js';

const FOUNDER_EMAIL = 'founder@example.com';
const FOUNDER_USER_ID = 'user-uuid-001';
const BEARER = 'Bearer test-token';
const PROJECT_ID = 'project-uuid-001';
const PROJECT_SLUG = 'sekret-bip';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/dashboard', dashboardRouter);
  return app;
}

function authSuccess() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: FOUNDER_USER_ID, email: FOUNDER_EMAIL } },
    error: null,
  });
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

const CONVERGED_RESULT = {
  status: 'converged' as const,
  observedChanges: [],
  proposedActions: [],
  evidenceIds: [],
  requiresApproval: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockControllerRun.mockResolvedValue(CONVERGED_RESULT);
  mockAuditInsert.mockResolvedValue({ error: null });
});

describe('dashboard router auth gate', () => {
  it('rejects requests with no bearer token', async () => {
    const app = buildApp();
    const res = await request(app).get('/dashboard/tasks');
    expect(res.status).toBe(401);
  });

  it('rejects requests from a non-allowlisted email', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        };
      }
      return {};
    });

    const app = buildApp();
    const res = await request(app).get('/dashboard/tasks').set('Authorization', BEARER);
    expect(res.status).toBe(403);
  });
});

describe('GET /dashboard/tasks', () => {
  it('returns missions joined with project labels', async () => {
    authSuccess();
    const mission = {
      id: 'mission-1',
      project_id: PROJECT_ID,
      title: 'Ship the thing',
      description: null,
      status: 'in_review',
      risk_level: 'medium',
      builder_agent: 'claude-code',
      reviewer_agent: null,
      created_at: '2026-07-18T00:00:00.000Z',
      updated_at: '2026-07-18T01:00:00.000Z',
    };

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'missions') {
        return {
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [mission], error: null }),
            }),
          }),
        };
      }
      if (table === 'projects') {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [{ id: PROJECT_ID, slug: PROJECT_SLUG, name: "Se'kret Bip" }],
              error: null,
            }),
          }),
        };
      }
      return {};
    });

    const app = buildApp();
    const res = await request(app).get('/dashboard/tasks').set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].project).toEqual({ slug: PROJECT_SLUG, name: "Se'kret Bip" });
  });

  it('surfaces a query error as 500', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'missions') {
        return {
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: null, error: { message: 'db down' } }),
            }),
          }),
        };
      }
      return {};
    });

    const app = buildApp();
    const res = await request(app).get('/dashboard/tasks').set('Authorization', BEARER);
    expect(res.status).toBe(500);
  });
});

describe('GET /dashboard/activity', () => {
  it('returns project_events joined with project labels', async () => {
    authSuccess();
    const event = {
      id: 'event-1',
      project_id: PROJECT_ID,
      event_type: 'project_read',
      severity: 'info',
      screen: 'control-room-api',
      metadata: {},
      created_at: '2026-07-18T02:00:00.000Z',
    };

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'project_events') {
        return {
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [event], error: null }),
            }),
          }),
        };
      }
      if (table === 'projects') {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [{ id: PROJECT_ID, slug: PROJECT_SLUG, name: "Se'kret Bip" }],
              error: null,
            }),
          }),
        };
      }
      return {};
    });

    const app = buildApp();
    const res = await request(app).get('/dashboard/activity').set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.activity).toHaveLength(1);
    expect(res.body.activity[0].project).toEqual({ slug: PROJECT_SLUG, name: "Se'kret Bip" });
  });
});

describe('POST /dashboard/manual-analysis', () => {
  it('rejects a request with no projectSlug', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/manual-analysis')
      .set('Authorization', BEARER)
      .send({});
    expect(res.status).toBe(400);
    expect(mockControllerRun).not.toHaveBeenCalled();
  });

  it('returns 404 for an unregistered project slug', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        };
      }
      return {};
    });

    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/manual-analysis')
      .set('Authorization', BEARER)
      .send({ projectSlug: 'no-such-project' });
    expect(res.status).toBe(404);
    expect(mockControllerRun).not.toHaveBeenCalled();
  });

  it('runs ProjectController.run and audits the trigger on success', async () => {
    authSuccess();
    const insertCalls: unknown[] = [];

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: PROJECT_ID, slug: PROJECT_SLUG, name: "Se'kret Bip" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'project_events') {
        return {
          insert: (row: unknown) => {
            insertCalls.push(row);
            return mockAuditInsert();
          },
        };
      }
      return {};
    });

    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/manual-analysis')
      .set('Authorization', BEARER)
      .send({ projectSlug: PROJECT_SLUG });

    expect(res.status).toBe(200);
    expect(mockControllerRun).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      controller: 'ProjectController',
      reason: 'founder_triggered',
    });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      project_id: PROJECT_ID,
      event_type: 'manual_analysis_triggered',
      metadata: expect.objectContaining({ triggered_by: FOUNDER_EMAIL }),
    });
  });

  it('does not execute any GitHub mutation or accept an unauthenticated caller-supplied approval', async () => {
    // Regression guard for the bundle's unauthenticated execute-approved
    // pattern: manual-analysis must never take an "approval" payload or
    // call a GitHub execution path directly.
    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/manual-analysis')
      .send({ approval: { status: 'approved', action_type: 'merge_pr' } });
    expect(res.status).toBe(401);
  });
});
