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
const RUN_ID = '11111111-1111-4111-8111-111111111111';

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

function commandCard(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    project_id: PROJECT_ID,
    mission_id: MISSION_ID,
    command_id: 'verify.typecheck',
    expected_commit_sha: HEAD,
    requesting_agent: 'codex',
    requested_by: FOUNDER_EMAIL,
    reason: 'Need exact proof.',
    rollback_plan: 'Do not mark executed without a matching run receipt.',
    risk: 'verify',
    status: 'approved',
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    approved_by: FOUNDER_EMAIL,
    approved_at: new Date().toISOString(),
    approval_note: 'Approved.',
    terminal_run_id: null,
    created_at: '2026-08-20T20:00:00.000Z',
    updated_at: '2026-08-20T20:00:00.000Z',
    projects: { id: PROJECT_ID, slug: PROJECT_SLUG, name: 'Founder Control Room' },
    missions: { id: MISSION_ID, title: 'Receipt binding', status: 'sandboxed' },
    ...overrides,
  };
}

function terminalRun(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    project_id: PROJECT_ID,
    mission_id: MISSION_ID,
    command_id: 'verify.typecheck',
    expected_commit_sha: HEAD,
    observed_commit_sha: HEAD,
    status: 'passed',
    finished_at: '2026-08-20T20:01:00.000Z',
    ...overrides,
  };
}

function installDatabase(run: Record<string, unknown>) {
  const approved = commandCard();
  const executed = commandCard({
    status: 'executed',
    terminal_run_id: RUN_ID,
    updated_at: '2026-08-20T20:02:00.000Z',
  });
  const requestUpdate = vi.fn(() => ({
    eq: () => ({
      eq: () => ({
        select: () => ({
          maybeSingle: () => Promise.resolve({ data: executed, error: null }),
        }),
      }),
    }),
  }));

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'command_bridge_requests') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: approved, error: null }),
            }),
          }),
        }),
        update: requestUpdate,
      };
    }
    if (table === 'terminal_runs') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: run, error: null }),
          }),
        }),
      };
    }
    if (table === 'project_events') return { insert: () => Promise.resolve({ error: null }) };
    return {};
  });

  return { requestUpdate };
}

beforeEach(() => {
  vi.clearAllMocks();
  authSuccess();
});

describe('POST /command-bridge/requests/:requestId/mark-executed receipt binding', () => {
  it('accepts only a completed terminal run bound to the approved card and exact observed head', async () => {
    const { requestUpdate } = installDatabase(terminalRun());

    const res = await request(buildApp())
      .post(`/command-bridge/requests/${REQUEST_ID}/mark-executed`)
      .set('Authorization', BEARER)
      .send({ terminalRunId: RUN_ID });

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('executed');
    expect(res.body.request.terminalRunId).toBe(RUN_ID);
    expect(requestUpdate).toHaveBeenCalledTimes(1);
  });

  it('rejects a terminal run from a different mission before changing the card', async () => {
    const { requestUpdate } = installDatabase(terminalRun({ mission_id: 'other-mission' }));

    const res = await request(buildApp())
      .post(`/command-bridge/requests/${REQUEST_ID}/mark-executed`)
      .set('Authorization', BEARER)
      .send({ terminalRunId: RUN_ID });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TERMINAL_RUN_RECEIPT_MISMATCH');
    expect(requestUpdate).not.toHaveBeenCalled();
  });

  it('rejects a still-running receipt even when every identity field matches', async () => {
    const { requestUpdate } = installDatabase(terminalRun({ status: 'running', finished_at: null }));

    const res = await request(buildApp())
      .post(`/command-bridge/requests/${REQUEST_ID}/mark-executed`)
      .set('Authorization', BEARER)
      .send({ terminalRunId: RUN_ID });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TERMINAL_RUN_RECEIPT_MISMATCH');
    expect(requestUpdate).not.toHaveBeenCalled();
  });

  it('rejects a completed run that observed a different commit', async () => {
    const { requestUpdate } = installDatabase(terminalRun({ observed_commit_sha: 'b'.repeat(40) }));

    const res = await request(buildApp())
      .post(`/command-bridge/requests/${REQUEST_ID}/mark-executed`)
      .set('Authorization', BEARER)
      .send({ terminalRunId: RUN_ID });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TERMINAL_RUN_RECEIPT_MISMATCH');
    expect(requestUpdate).not.toHaveBeenCalled();
  });
});