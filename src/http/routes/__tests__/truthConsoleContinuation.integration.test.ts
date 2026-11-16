import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, fromSpy, taskFilterSpy } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  fromSpy: vi.fn(),
  taskFilterSpy: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: fromSpy },
}));

import express from 'express';
import request from 'supertest';
import { truthConsoleRouter } from '../truthConsole.js';

const rows = [
  { id: 'canonical-proof', task_id: null, proof_cookie: 'proof', valid_until: '2099-01-01T00:00:00Z', invalidated_at: null },
  { id: 'unverified-task-pointer', task_id: 'task-1', proof_cookie: 'unverified', valid_until: null, invalidated_at: null },
];

function app() {
  const server = express();
  server.use('/truth-console', truthConsoleRouter);
  return server;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-1', email: 'founder@example.org' } },
    error: null,
  });
  fromSpy.mockImplementation((table: string) => {
    if (table === 'founder_users') {
      return { select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { email: 'founder@example.org' }, error: null }),
      }) }) };
    }
    if (table === 'continuity_records') {
      let excludesTaskPointers = false;
      const query = {
        select: () => query,
        is: (field: string, value: unknown) => {
          taskFilterSpy(field, value);
          if (field === 'task_id' && value === null) excludesTaskPointers = true;
          return query;
        },
        order: () => query,
        limit: async () => ({
          data: excludesTaskPointers ? rows.filter((row) => row.task_id === null) : rows,
          error: null,
        }),
      };
      return query;
    }
    throw new Error('unexpected table ' + table);
  });
});

describe('Truth Console continuity view', () => {
  it('does not report unverified task checkpoints as current proof', async () => {
    const response = await request(app()).get('/truth-console/continuity')
      .set('Authorization', 'Bearer synthetic-founder-token');
    expect(response.status).toBe(200);
    expect(taskFilterSpy).toHaveBeenCalledWith('task_id', null);
    expect(response.body.continuity.map((row: { id: string }) => row.id)).toEqual(['canonical-proof']);
    expect(JSON.stringify(response.body)).not.toContain('unverified-task-pointer');
    expect(JSON.stringify(response.body)).not.toContain('unverified');
  });
});
