import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WA = '11111111-1111-4111-8111-111111111111';
const WB = '22222222-2222-4222-8222-222222222222';
const PA = '33333333-3333-4333-8333-333333333333';
const PB = '44444444-4444-4444-8444-444444444444';
const TA = '55555555-5555-4555-8555-555555555555';
const TB = '66666666-6666-4666-8666-666666666666';

const state = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), error: null as null | { message: string },
  rows: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: state.from, rpc: state.rpc },
}));
vi.mock('../../middleware/security.js', () => ({
  rateLimitFounderPermissions: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../middleware/requireFounder.js', () => ({
  requireWorkspaceUser: (req: {
    headers: Record<string, string>; founder?: Record<string, unknown>;
  }, res: { status: (v: number) => { json: (v: unknown) => unknown } },
  next: () => void) => {
    const actor = req.headers['x-test-actor'];
    if (actor === 'a') req.founder = { userId: A, workspaceId: WA };
    else if (actor === 'b') req.founder = { userId: B, workspaceId: WB };
    else if (actor === 'missing-workspace') req.founder = { userId: A, workspaceId: null };
    else return res.status(401).json({ error: 'Test authentication required' });
    next();
  },
}));

import { workspaceTasksRouter } from '../workspaceTasks.js';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/workspace', workspaceTasksRouter);
  return instance;
}
const as = (actor: string) => ({ 'x-test-actor': actor });

beforeEach(() => {
  vi.clearAllMocks();
  state.error = null;
  state.rpc.mockResolvedValue({ data: TA, error: null });
  state.rows = {
    projects: [
      { id: PA, workspace_id: WA },
      { id: PB, workspace_id: WB },
    ],
    fcr_workspace_tasks: [
      { id: TA, project_id: PA, workspace_id: WA, owner_user_id: A,
        state: 'paused', request_json: { query: 'letters' } },
      { id: TB, project_id: PB, workspace_id: WB, owner_user_id: B,
        state: 'paused', request_json: { query: 'numbers' } },
    ],
    fcr_workspace_task_runs: [
      { id: '77777777-7777-4777-8777-777777777777', task_id: TA, workspace_id: WA,
        owner_user_id: A, state: 'provider_observed_unverified' },
      { id: '88888888-8888-4888-8888-888888888888', task_id: TB, workspace_id: WB,
        owner_user_id: B, state: 'claimed' },
    ],
  };
  state.from.mockImplementation((table: string) => {
    if (!Object.hasOwn(state.rows, table)) throw new Error('Unexpected table');
    const filters: Array<[string, unknown]> = [];
    const selected = () => state.rows[table].filter(row =>
      filters.every(([field, value]) => row[field] === value));
    const chain = {
      select: () => chain,
      eq: (field: string, value: unknown) => {
        filters.push([field, value]);
        return chain;
      },
      order: () => chain,
      limit: async (n: number) => ({ data: selected().slice(0, n), error: state.error }),
      maybeSingle: async () => ({ data: selected()[0] ?? null, error: state.error }),
    };
    return chain;
  });
});

describe('workspace-native task API (data/authority boundary, not a live provider smoke)', () => {
  it('lists only the authenticated actor\'s own workspace tasks', async () => {
    const aa = await request(app()).get('/workspace/tasks').set(as('a'));
    const bb = await request(app()).get('/workspace/tasks').set(as('b'));
    expect(aa.status).toBe(200);
    expect(bb.status).toBe(200);
    expect(aa.body.tasks.map((t: { id: string }) => t.id)).toEqual([TA]);
    expect(bb.body.tasks.map((t: { id: string }) => t.id)).toEqual([TB]);
    expect(aa.body.executionAuthorized).toBe(false);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('creates only an inert task with the current actor identity', async () => {
    const response = await request(app()).post('/workspace/tasks').set(as('a')).send({
      projectId: PA, operation: 'search', query: ' forest letter tracing ',
      cadenceMinutes: 60,
    });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      taskId: TA, state: 'paused', grant: 'revoked',
      executionAuthorized: false, providerInvoked: false,
    });
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith(
      'create_fcr_workspace_task_draft',
      { p_workspace_id: WA, p_owner_user_id: A, p_project_id: PA,
        p_query: 'forest letter tracing', p_cadence_minutes: 60 },
    );
  });

  it('rejects a forged owner and any unrecognized task arguments', async () => {
    const response = await request(app()).post('/workspace/tasks').set(as('a')).send({
      projectId: PA, operation: 'search', query: 'letters', cadenceMinutes: 60,
      ownerUserId: B,
    });
    expect(response.status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('prevents cross-tenant project registration', async () => {
    const response = await request(app()).post('/workspace/tasks').set(as('a')).send({
      projectId: PB, operation: 'search', query: 'letters', cadenceMinutes: 60,
    });
    expect(response.status).toBe(404);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('rejects write-capability requests and sub-hourly schedules', async () => {
    for (const extra of [
      { operation: 'publish', query: 'post', cadenceMinutes: 60 },
      { operation: 'search', query: 'ok', cadenceMinutes: 5 },
      { operation: 'search', query: '', cadenceMinutes: 60 },
    ]) {
      const response = await request(app()).post('/workspace/tasks').set(as('a')).send({
        projectId: PA, ...extra,
      });
      expect(response.status).toBe(400);
    }
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('denies guessing another tenant\'s task receipt ID', async () => {
    const response = await request(app()).get(`/workspace/tasks/${TB}/runs`).set(as('a'));
    expect(response.status).toBe(404);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('exposes only the current owner\'s bounded non-verified run receipts', async () => {
    const response = await request(app()).get(`/workspace/tasks/${TA}/runs`).set(as('a'));
    expect(response.status).toBe(200);
    expect(response.body.runs).toHaveLength(1);
    expect(response.body.evidenceIsIndependentVerification).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain(TB);
  });

  it('fails closed on absent workspace or database errors', async () => {
    expect((await request(app()).get('/workspace/tasks').set(as('missing-workspace'))).status).toBe(503);
    state.error = { message: 'sensitive database details' };
    const response = await request(app()).get('/workspace/tasks').set(as('a'));
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('sensitive database details');
  });
});
