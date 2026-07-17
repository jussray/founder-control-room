import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUser = vi.fn();
vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));

const supabaseMock = { from: vi.fn() };
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

const mockEnqueue = vi.fn();
vi.mock('../../../events/outbox.js', () => ({ enqueueReconcile: mockEnqueue }));

import express from 'express';
import request from 'supertest';
import { createTerminalRouter } from '../terminal.js';
import { TerminalRunnerError } from '../../../terminal/types.js';

const BEARER = 'Bearer test-token';
const FOUNDER_EMAIL = 'founder@example.com';
const PROJECT_ID = 'project-uuid';
const MISSION_ID = 'mission-uuid';
const HEAD = 'a'.repeat(40);

const mockRun = vi.fn();
const mockCancel = vi.fn();
const fakeRunner = { run: mockRun, cancel: mockCancel };

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/terminal', createTerminalRouter(fakeRunner));
  return instance;
}

function authSuccess() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user', email: FOUNDER_EMAIL } },
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

interface UpdateChain extends PromiseLike<{ error: null }> {
  eq(): UpdateChain;
  lt(): Promise<{ error: null }>;
}

function updateChain(): UpdateChain {
  const resolved = Promise.resolve({ error: null });
  const chain = {} as UpdateChain;
  chain.eq = () => chain;
  chain.lt = () => resolved;
  chain.then = resolved.then.bind(resolved);
  return chain;
}

function successfulDatabase() {
  authSuccess();
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    if (table === 'projects') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { id: PROJECT_ID, slug: 'untold-stories', verification_enabled: true },
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
                data: { id: MISSION_ID, project_id: PROJECT_ID, status: 'sandboxed' },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'terminal_runs') {
      return {
        insert: () => Promise.resolve({ error: null }),
        update: () => updateChain(),
      };
    }
    if (table === 'evidence') {
      return {
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'evidence-uuid' }, error: null }),
          }),
        }),
      };
    }
    return {};
  });
}

describe('guarded terminal route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONTROL_ROOM_TERMINAL_ENABLED = 'true';
    process.env.CONTROL_ROOM_TERMINAL_ALLOW_REMOTE = 'true';
  });

  it('requires founder authentication', async () => {
    const response = await request(app())
      .post('/terminal/untold-stories/run')
      .send({ missionId: MISSION_ID, commandId: 'verify.playwright', expectedCommitSha: HEAD });
    expect(response.status).toBe(401);
  });

  it('fails closed when the terminal feature flag is disabled', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });
    process.env.CONTROL_ROOM_TERMINAL_ENABLED = 'false';

    const response = await request(app())
      .post('/terminal/untold-stories/run')
      .set('Authorization', BEARER)
      .send({ missionId: MISSION_ID, commandId: 'verify.playwright', expectedCommitSha: HEAD });
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('TERMINAL_DISABLED');
  });

  it('rejects arbitrary command IDs before any process starts', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const response = await request(app())
      .post('/terminal/untold-stories/run')
      .set('Authorization', BEARER)
      .send({ missionId: MISSION_ID, commandId: 'bash', expectedCommitSha: HEAD });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNKNOWN_COMMAND');
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('requires an explicit confirmation for write-risk commands', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const response = await request(app())
      .post('/terminal/untold-stories/run')
      .set('Authorization', BEARER)
      .send({ missionId: MISSION_ID, commandId: 'deps.install', expectedCommitSha: HEAD });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('WRITE_CONFIRMATION_REQUIRED');
  });

  it('persists bounded exact-head evidence for a passing command', async () => {
    successfulDatabase();
    mockRun.mockResolvedValue({
      runId: 'runtime-generated',
      projectSlug: 'untold-stories',
      commandId: 'verify.playwright',
      status: 'passed',
      observedCommitSha: HEAD,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      exitCode: 0,
      signal: null,
      stdout: 'passed',
      stderr: '',
      outputTruncated: false,
    });

    const response = await request(app())
      .post('/terminal/untold-stories/run')
      .set('Authorization', BEARER)
      .send({ missionId: MISSION_ID, commandId: 'verify.playwright', expectedCommitSha: HEAD });

    expect(response.status).toBe(200);
    expect(response.body.evidenceId).toBe('evidence-uuid');
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({
      projectSlug: 'untold-stories',
      commandId: 'verify.playwright',
      expectedCommitSha: HEAD,
    }));
    expect(mockEnqueue).toHaveBeenCalled();
  });

  it('records and returns a head mismatch without producing passing evidence', async () => {
    successfulDatabase();
    mockRun.mockRejectedValue(new TerminalRunnerError('HEAD_MISMATCH', 'branch moved'));

    const response = await request(app())
      .post('/terminal/untold-stories/run')
      .set('Authorization', BEARER)
      .send({ missionId: MISSION_ID, commandId: 'verify.playwright', expectedCommitSha: HEAD });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('HEAD_MISMATCH');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
