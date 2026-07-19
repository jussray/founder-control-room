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
import { commandBridgeRouter } from '../commandBridge.js';

const FOUNDER_EMAIL = 'founder@example.com';
const FOUNDER_USER_ID = 'user-uuid-001';
const BEARER = 'Bearer test-token';
const PROJECT_ID = 'project-uuid-001';
const PROJECT_SLUG = 'founder-control-room';
const MISSION_ID = 'mission-uuid-001';
const HEAD = 'a'.repeat(40);
const REQUEST_ID = 'request-uuid-001';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/command-bridge', commandBridgeRouter);
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

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    project_id: PROJECT_ID,
    mission_id: MISSION_ID,
    command_id: 'verify.typecheck',
    expected_commit_sha: HEAD,
    requesting_agent: 'codex',
    requested_by: FOUNDER_EMAIL,
    reason: 'Need proof gate for TypeScript changes.',
    rollback_plan: 'Revert the command card; no project mutation occurs before terminal run.',
    risk: 'verify',
    status: 'requested',
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    approved_by: null,
    approved_at: null,
    approval_note: null,
    terminal_run_id: null,
    created_at: '2026-07-19T19:30:00.000Z',
    updated_at: '2026-07-19T19:30:00.000Z',
    projects: { id: PROJECT_ID, slug: PROJECT_SLUG, name: 'Founder Control Room' },
    missions: { id: MISSION_ID, title: 'Ship Command Bridge', status: 'sandboxed' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Founder Command Bridge auth gate', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(buildApp()).get('/command-bridge');
    expect(res.status).toBe(401);
  });
});

describe('POST /command-bridge/requests', () => {
  it('rejects arbitrary command ids before creating a command card', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const res = await request(buildApp())
      .post('/command-bridge/requests')
      .set('Authorization', BEARER)
      .send({
        projectSlug: PROJECT_SLUG,
        missionId: MISSION_ID,
        commandId: 'bash',
        expectedCommitSha: HEAD,
        reason: 'Try arbitrary shell',
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_COMMAND');
  });

  it('creates a short-lived command card for an allowlisted verification command', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: PROJECT_ID, slug: PROJECT_SLUG, name: 'Founder Control Room', verification_enabled: true },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'missions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({
                  data: {
                    id: MISSION_ID,
                    project_id: PROJECT_ID,
                    title: 'Ship Command Bridge',
                    status: 'sandboxed',
                    policy_snapshot: { expectedHeadSha: HEAD },
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'command_bridge_requests') {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: requestRow(), error: null }),
            }),
          }),
        };
      }
      if (table === 'project_events') return { insert: () => Promise.resolve({ error: null }) };
      return {};
    });

    const res = await request(buildApp())
      .post('/command-bridge/requests')
      .set('Authorization', BEARER)
      .send({
        projectSlug: PROJECT_SLUG,
        missionId: MISSION_ID,
        commandId: 'verify.typecheck',
        expectedCommitSha: HEAD,
        requestingAgent: 'codex',
        reason: 'Need proof gate for TypeScript changes.',
        rollbackPlan: 'Let the card expire; no terminal run starts before approval.',
        durationMinutes: 15,
      });

    expect(res.status).toBe(201);
    expect(res.body.request.id).toBe(REQUEST_ID);
  });
});

describe('POST /command-bridge/requests/:requestId/approve', () => {
  it('approves a requested command card and returns the exact guarded terminal payload', async () => {
    authSuccess();
    const approved = requestRow({ status: 'approved', approved_by: FOUNDER_EMAIL, approved_at: new Date().toISOString() });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'command_bridge_requests') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: requestRow(), error: null }) }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: approved, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'project_events') return { insert: () => Promise.resolve({ error: null }) };
      return {};
    });

    const res = await request(buildApp())
      .post(`/command-bridge/requests/${REQUEST_ID}/approve`)
      .set('Authorization', BEARER)
      .send({ approvalNote: 'Run the proof gate.' });

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('approved');
    expect(res.body.execution).toMatchObject({
      endpoint: `/terminal/${PROJECT_SLUG}/run`,
      method: 'POST',
      body: {
        missionId: MISSION_ID,
        commandId: 'verify.typecheck',
        expectedCommitSha: HEAD,
      },
    });
  });
});
