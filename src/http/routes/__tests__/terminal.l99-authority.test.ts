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

const BEARER = 'Bearer test-token';
const FOUNDER_EMAIL = 'founder@example.com';
const MISSION_ID = 'mission-uuid';
const HEAD = 'a'.repeat(40);
const mockRun = vi.fn();
const mockCancel = vi.fn();

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/terminal', createTerminalRouter({ run: mockRun, cancel: mockCancel }));
  return instance;
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

describe('legacy terminal L99 authority boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONTROL_ROOM_TERMINAL_ENABLED = 'true';
    process.env.CONTROL_ROOM_TERMINAL_ALLOW_REMOTE = 'true';
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user', email: FOUNDER_EMAIL } },
      error: null,
    });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });
  });

  it('does not treat confirmWrite as write execution authority', async () => {
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
    expect(response.body.code).toBe('L99_AUTHORITY_REQUIRED');
    expect(mockRun).not.toHaveBeenCalled();
  });
});
