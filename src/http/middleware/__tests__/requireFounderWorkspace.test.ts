import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FounderRequest } from '../requireFounder.js';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mocks.getUser } },
  createSupabaseAuthClient: vi.fn(),
}));
vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: mocks.from },
}));

import { requireFounder } from '../requireFounder.js';

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;

class Query {
  private filters: Array<[string, unknown]> = [];
  private orderColumn: string | null = null;

  constructor(private readonly table: string) {}

  select(_columns?: string) { return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  order(column: string) { this.orderColumn = column; return this; }

  maybeSingle() {
    return this.run(true);
  }

  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
    return this.run(false).then(resolve, reject);
  }

  private async run(single: boolean) {
    let rows = [...(db[this.table] ?? [])].filter((row) =>
      this.filters.every(([column, value]) => row[column] === value),
    );
    if (this.orderColumn) {
      const column = this.orderColumn;
      rows.sort((left, right) => String(left[column] ?? '').localeCompare(String(right[column] ?? '')));
    }
    return { data: single ? rows[0] ?? null : rows, error: null };
  }
}

function app() {
  const instance = express();
  const router = express.Router();
  router.get('/:slug/verification', requireFounder, (req: FounderRequest, res) => {
    res.json({ ok: true, founder: req.founder, slug: req.params.slug });
  });
  instance.use('/projects', router);
  return instance;
}

beforeEach(() => {
  db = {
    founder_users: [{ email: 'founder@example.com' }],
    workspace_members: [{
      workspace_id: 'workspace-a',
      email: 'founder@example.com',
      role: 'owner',
      status: 'active',
      created_at: '2026-09-07T00:00:00.000Z',
    }],
    projects: [
      { id: 'project-a', workspace_id: 'workspace-a', slug: 'owned' },
      { id: 'project-b', workspace_id: 'workspace-b', slug: 'foreign' },
    ],
  };
  mocks.from.mockReset();
  mocks.from.mockImplementation((table: string) => new Query(table));
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'founder-user', email: 'founder@example.com' } },
    error: null,
  });
});

describe('requireFounder project workspace binding', () => {
  it('allows an allowlisted founder to reach a project in the active workspace', async () => {
    const response = await request(app())
      .get('/projects/owned/verification')
      .set('Authorization', 'Bearer founder-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      ok: true,
      slug: 'owned',
      founder: { email: 'founder@example.com', userId: 'founder-user' },
    }));
  });

  it('returns not-found for an allowlisted founder targeting another workspace project', async () => {
    const response = await request(app())
      .get('/projects/foreign/verification')
      .set('Authorization', 'Bearer founder-token');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Project not found in the active workspace' });
  });

  it('does not honor a caller-supplied foreign workspace selector', async () => {
    const response = await request(app())
      .get('/projects/foreign/verification')
      .set('Authorization', 'Bearer founder-token')
      .set('x-fcr-workspace-id', 'workspace-b');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Project not found in the active workspace' });
  });
});
