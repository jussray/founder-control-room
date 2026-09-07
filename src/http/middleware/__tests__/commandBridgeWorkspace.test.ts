import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FounderRequest } from '../requireFounder.js';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: { from: mocks.from } }));

import { requireCommandBridgeWorkspace } from '../commandBridgeWorkspace.js';

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;

class Query {
  private filters: Array<[string, unknown]> = [];
  private orderColumn: string | null = null;

  constructor(private readonly table: string) {}

  select(_columns?: string) { return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  order(column: string) { this.orderColumn = column; return this; }

  maybeSingle() { return this.run(true); }
  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
    return this.run(false).then(resolve, reject);
  }

  private async run(single: boolean) {
    let rows = [...(db[this.table] ?? [])].filter((row) =>
      this.filters.every(([column, value]) => row[column] === value),
    );
    if (this.orderColumn) {
      const column = this.orderColumn;
      rows.sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')));
    }
    return { data: single ? rows[0] ?? null : rows, error: null };
  }
}

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/command-bridge', (req: FounderRequest, _res, next) => {
    req.founder = { email: 'founder@example.com', userId: 'founder-user' };
    next();
  }, requireCommandBridgeWorkspace);

  instance.get('/command-bridge', (_req, res) => {
    res.json({
      contract: 'fcr/command-bridge@v1',
      summary: { total: 2, requested: 2, approved: 0, executed: 0, writeRisk: 1 },
      requests: [
        { id: 'owned-request', projectId: 'project-a', status: 'requested', risk: 'read' },
        { id: 'foreign-request', projectId: 'project-b', status: 'requested', risk: 'write' },
      ],
    });
  });
  instance.get('/command-bridge/:projectSlug/commands', (req, res) => res.json({ projectSlug: req.params.projectSlug }));
  instance.post('/command-bridge/requests', (req, res) => res.status(201).json({ projectSlug: req.body.projectSlug }));
  instance.post('/command-bridge/requests/:requestId/approve', (req, res) => res.json({ requestId: req.params.requestId }));
  return instance;
}

beforeEach(() => {
  db = {
    workspace_members: [{
      workspace_id: 'workspace-a',
      email: 'founder@example.com',
      status: 'active',
      role: 'owner',
      created_at: '2026-09-07T00:00:00.000Z',
    }],
    projects: [
      { id: 'project-a', workspace_id: 'workspace-a', slug: 'owned' },
      { id: 'project-b', workspace_id: 'workspace-b', slug: 'foreign' },
    ],
    command_bridge_requests: [
      { id: 'owned-request', project_id: 'project-a' },
      { id: 'foreign-request', project_id: 'project-b' },
    ],
  };
  mocks.from.mockReset();
  mocks.from.mockImplementation((table: string) => new Query(table));
});

describe('requireCommandBridgeWorkspace', () => {
  it('filters the global command-card registry and recomputes summary inside the active workspace', async () => {
    const response = await request(app()).get('/command-bridge');

    expect(response.status).toBe(200);
    expect(response.body.requests).toEqual([
      expect.objectContaining({ id: 'owned-request', projectId: 'project-a' }),
    ]);
    expect(response.body.summary).toEqual({ total: 1, requested: 1, approved: 0, executed: 0, writeRisk: 0 });
  });

  it('denies command discovery for a foreign project slug', async () => {
    const response = await request(app()).get('/command-bridge/foreign/commands');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Resource not found in the active workspace');
  });

  it('denies command-card creation when the project slug is carried in the request body', async () => {
    const response = await request(app())
      .post('/command-bridge/requests')
      .send({ projectSlug: 'foreign' });
    expect(response.status).toBe(404);
  });

  it('denies decision mutation when a command request id belongs to another workspace', async () => {
    const response = await request(app())
      .post('/command-bridge/requests/foreign-request/approve')
      .send({ approvalNote: 'no' });
    expect(response.status).toBe(404);
  });

  it('allows owned project and owned request resources through to existing handlers', async () => {
    const commands = await request(app()).get('/command-bridge/owned/commands');
    const create = await request(app()).post('/command-bridge/requests').send({ projectSlug: 'owned' });
    const approve = await request(app()).post('/command-bridge/requests/owned-request/approve').send({});

    expect(commands.status).toBe(200);
    expect(create.status).toBe(201);
    expect(approve.status).toBe(200);
  });
});
