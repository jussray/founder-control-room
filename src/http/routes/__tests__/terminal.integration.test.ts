import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock, mockEnqueue } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  mockEnqueue: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

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

interface DatabaseOptions {
  missionStatus?: string;
  missionHead?: string | null;
}

function successfulDatabase(options: DatabaseOptions = {}) {
  authSuccess();
  const evidenceInsert = vi.fn(() => ({
    select: () => ({
      single: () => Promise.resolve({ data: { id: 'evidence-uuid' }, error: null }),
    }),
  }));

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
                data: {
                  id: MISSION_ID,
                  project_id: PROJECT_ID,
                  status: options.missionStatus ?? 'sandboxed',
                  policy_snapshot: {
                    expectedHeadSha: options.missionHead === undefined ? HEAD : options.missionHead,
                  },
                },
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
      return { insert: evidenceInsert };
    }
    return {};
  });

  return { evidenceInsert };
}

function passingRun(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
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

  it('rejects a caller SHA that does not match the mission policy snapshot', async () => {
    successfulDatabase({ missionHead: 'b'.repeat(40) });
    const response = await request(app())
      .post('/terminal/untold-stories/run')
      .set('Authorization', BEARER)
      .send({ missionId: MISSION_ID, commandId: 'verify.playwright', expectedCommitSha: HEAD });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('MISSION_HEAD_MISMATCH');
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('does not allow dependency writes after a mission enters review', async () => {
    successfulDatabase({ missionStatus: 'in_review' });
    const response = await request(app())
      .post('/terminal/untold-stories/run')
      .set('Authorization', BEARER)
      .send({
        missionId: MISSION_ID,
        commandId: 'deps.install',
        expectedCommitSha: HEAD,
        confirmWrite: true,
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COMMAND_NOT_ALLOWED_IN_MISSION_STATE');
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('persists bounded exact-head evidence for a passing verification command', async () => {
    successfulDatabase();
    mockRun.mockResolvedValue(passingRun());

    const response = await request(app())
      .post('/terminal/untold-stories/run')
      .set('Authorization', BEARER)
      .send({ missionId: MISSION_ID, commandId: 'verify.playwright', expectedCommitSha: HEAD });

    expect(response.status).toBe(200);
    expect(response.body.proofEligible).toBe(true);
    expect(response.body.evidenceId).toBe('evidence-uuid');
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({
      projectSlug: 'untold-stories',
      commandId: 'verify.playwright',
      expectedCommitSha: HEAD,
    }));
    expect(mockEnqueue).toHaveBeenCalled();
  });

  it('marks truncated successful output as warning evidence rather than proof', async () => {
    const { evidenceInsert } = successfulDatabase();
    mockRun.mockResolvedValue(passingRun({ outputTruncated: true }));

    const response = await request(app())
      .post('/terminal/untold-stories/run')
      .set('Authorization', BEARER)
      .send({ missionId: MISSION_ID, commandId: 'verify.playwright', expectedCommitSha: HEAD });

    expect(response.status).toBe(200);
    expect(response.body.proofEligible).toBe(false);
    expect(evidenceInsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'warn' }));
  });

  it('records and returns a workspace head mismatch without producing passing evidence', async () => {
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
