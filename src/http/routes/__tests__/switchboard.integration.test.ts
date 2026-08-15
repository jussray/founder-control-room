import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock, readSwitchboard, setFounderDesiredState, readSwitchHistory } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  readSwitchboard: vi.fn(),
  setFounderDesiredState: vi.fn(),
  readSwitchHistory: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../switchboard/store.js', () => ({
  readSwitchboard,
  setFounderDesiredState,
  readSwitchHistory,
  SwitchboardError: class SwitchboardError extends Error {
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
    code: string;
  },
}));

import { SwitchboardError } from '../../../switchboard/store.js';
import { switchboardRouter } from '../switchboard.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/switchboard', switchboardRouter);
  return app;
}

function authorizeFounder() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u1', email: FOUNDER_EMAIL } },
    error: null,
  });
  supabaseMock.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  }));
}

beforeEach(() => vi.clearAllMocks());

describe('Founder Switchboard API', () => {
  it('rejects unauthenticated switch reads', async () => {
    const response = await request(buildApp()).get('/switchboard');
    expect(response.status).toBe(401);
  });

  it('returns switch state only after founder authorization', async () => {
    authorizeFounder();
    readSwitchboard.mockResolvedValue([{ id: 'fcr-privileged-execution-master', desiredState: 'on' }]);

    const response = await request(buildApp())
      .get('/switchboard')
      .set('Authorization', BEARER);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.switches).toEqual([
      expect.objectContaining({ id: 'fcr-privileged-execution-master', desiredState: 'on' }),
    ]);
    expect(response.body.semantics.observe_only).toMatch(/not mutated/i);
  });

  it('binds a state change to the authenticated founder identity', async () => {
    authorizeFounder();
    setFounderDesiredState.mockResolvedValue({
      id: 'fcr-privileged-execution-master',
      desiredState: 'off',
      controlMode: 'enforced',
    });

    const response = await request(buildApp())
      .patch('/switchboard/fcr-privileged-execution-master')
      .set('Authorization', BEARER)
      .send({ desiredState: 'off', reason: 'Pause autonomous execution.' });

    expect(response.status).toBe(200);
    expect(setFounderDesiredState).toHaveBeenCalledWith({
      switchId: 'fcr-privileged-execution-master',
      desiredState: 'off',
      reason: 'Pause autonomous execution.',
      actorEmail: FOUNDER_EMAIL,
    });
    expect(response.body.switch.desiredState).toBe('off');
  });

  it('rejects malformed desired state before any write', async () => {
    authorizeFounder();
    const response = await request(buildApp())
      .patch('/switchboard/fcr-privileged-execution-master')
      .set('Authorization', BEARER)
      .send({ desiredState: 'maybe' });

    expect(response.status).toBe(400);
    expect(setFounderDesiredState).not.toHaveBeenCalled();
  });

  it('surfaces locked-off activation as a conflict instead of bypassing it', async () => {
    authorizeFounder();
    setFounderDesiredState.mockRejectedValue(
      new SwitchboardError('locked_off', 'Store release is locked OFF.'),
    );

    const response = await request(buildApp())
      .patch('/switchboard/sekret-store-release')
      .set('Authorization', BEARER)
      .send({ desiredState: 'on' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('locked_off');
  });

  it('returns immutable switch history through the founder gate', async () => {
    authorizeFounder();
    readSwitchHistory.mockResolvedValue([
      { previous_state: 'on', desired_state: 'off', actor_email: FOUNDER_EMAIL },
    ]);

    const response = await request(buildApp())
      .get('/switchboard/fcr-privileged-execution-master/history')
      .set('Authorization', BEARER);

    expect(response.status).toBe(200);
    expect(response.body.history[0]).toMatchObject({ previous_state: 'on', desired_state: 'off' });
  });
});
