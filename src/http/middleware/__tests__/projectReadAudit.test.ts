import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FounderRequest } from '../requireFounder.js';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}));

import { requireProjectReadAudit } from '../projectReadAudit.js';

type Row = Record<string, unknown>;

const WORKSPACE_A = 'workspace-a';
const WORKSPACE_B = 'workspace-b';
const FOUNDER_EMAIL = 'founder@example.com';
let failAuditInsert = false;
let downstreamPostReached = false;
let db: Record<string, Row[]>;

class FakeQuery {
  private mode: 'select' | 'insert' = 'select';
  private filters: Array<[string, unknown]> = [];
  private inserted: Row[] = [];
  private orderColumn: string | null = null;
  private ascending = true;

  constructor(private readonly tableName: string) {}

  select(_columns?: string) {
    return this;
  }

  insert(rows: Row | Row[]) {
    this.mode = 'insert';
    this.inserted = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderColumn = column;
    this.ascending = options.ascending !== false;
    return this;
  }

  maybeSingle() {
    return this.run(true, true);
  }

  single() {
    return this.run(true, false);
  }

  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
    return this.run(false, true).then(resolve, reject);
  }

  private async run(single: boolean, allowZero: boolean) {
    if (this.mode === 'insert') {
      if (this.tableName === 'project_events' && failAuditInsert) {
        return { data: null, error: { message: 'database unavailable' } };
      }
      const target = db[this.tableName] ?? (db[this.tableName] = []);
      const rows = this.inserted.map((row, index) => ({
        id: typeof row.id === 'string' ? row.id : `${this.tableName}-${target.length + index + 1}`,
        created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
        ...row,
      }));
      target.push(...rows);
      return single
        ? { data: rows[0] ?? null, error: rows.length || allowZero ? null : { message: 'No rows found' } }
        : { data: rows, error: null };
    }

    let rows = [...(db[this.tableName] ?? [])].filter((row) =>
      this.filters.every(([column, value]) => row[column] === value),
    );
    if (this.orderColumn) {
      const column = this.orderColumn;
      rows.sort((a, b) => {
        const left = String(a[column] ?? '');
        const right = String(b[column] ?? '');
        return (left < right ? -1 : left > right ? 1 : 0) * (this.ascending ? 1 : -1);
      });
    }

    if (!single) return { data: rows, error: null };
    if (rows.length === 0) {
      return allowZero ? { data: null, error: null } : { data: null, error: { message: 'No rows found' } };
    }
    return { data: rows[0], error: null };
  }
}

function createProbeApp() {
  const app = express();
  app.use(express.json());
  app.use('/projects', (req: FounderRequest, _res, next) => {
    req.founder = { email: FOUNDER_EMAIL, userId: 'founder-user-123' };
    next();
  }, requireProjectReadAudit);

  app.get('/projects', (_req, res) => {
    // Deliberately simulate the legacy service-role router returning its global
    // registry. The tenant middleware must filter this before releasing JSON.
    res.json({ projects: db.projects });
  });

  app.get('/projects/:slug', (req, res) => {
    const project = db.projects.find((row) => row.slug === req.params.slug);
    res.json({ project });
  });

  app.get('/projects/:slug/releases', (_req, res) => {
    res.json({ releases: [{ id: 'release-1' }] });
  });

  app.post('/projects', (_req, res) => {
    downstreamPostReached = true;
    res.status(500).json({ error: 'legacy handler should not create tenant projects' });
  });

  return app;
}

beforeEach(() => {
  failAuditInsert = false;
  downstreamPostReached = false;
  db = {
    workspace_members: [{
      workspace_id: WORKSPACE_A,
      email: FOUNDER_EMAIL,
      role: 'owner',
      status: 'active',
      created_at: '2026-09-07T00:00:00.000Z',
    }],
    projects: [
      { id: 'project-a1', workspace_id: WORKSPACE_A, slug: 'one', name: 'One' },
      { id: 'project-a2', workspace_id: WORKSPACE_A, slug: 'two', name: 'Two' },
      { id: 'project-b1', workspace_id: WORKSPACE_B, slug: 'foreign', name: 'Foreign' },
    ],
    project_events: [],
  };
  mockFrom.mockReset();
  mockFrom.mockImplementation((tableName: string) => new FakeQuery(tableName));
});

describe('requireProjectReadAudit workspace boundary', () => {
  it('filters a legacy global registry to the active workspace before releasing it', async () => {
    const response = await request(createProbeApp()).get('/projects');

    expect(response.status).toBe(200);
    expect(response.body.projects.map((project: Row) => project.id)).toEqual(['project-a1', 'project-a2']);
    expect(response.body.projects.some((project: Row) => project.id === 'project-b1')).toBe(false);
    expect(db.project_events.map((event) => event.project_id)).toEqual(['project-a1', 'project-a2']);
    expect(db.project_events.every((event) => event.event_type === 'project_registry_read')).toBe(true);
  });

  it('denies a project slug owned by another workspace before the legacy handler executes', async () => {
    const response = await request(createProbeApp()).get('/projects/foreign');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Project not found in the active workspace');
    expect(db.project_events).toHaveLength(0);
  });

  it('denies an explicit workspace selection that is not in the founder membership set', async () => {
    const response = await request(createProbeApp())
      .get('/projects')
      .set('x-fcr-workspace-id', WORKSPACE_B);

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/not available to this founder/i);
    expect(db.project_events).toHaveLength(0);
  });

  it('creates a project inside the active workspace without reaching the legacy global insert', async () => {
    const response = await request(createProbeApp())
      .post('/projects')
      .send({
        slug: 'new-project',
        name: 'New Project',
        repoIdentifier: 'founder/new-project',
      });

    expect(response.status).toBe(201);
    expect(downstreamPostReached).toBe(false);
    expect(response.body.project).toEqual(expect.objectContaining({
      workspace_id: WORKSPACE_A,
      slug: 'new-project',
      name: 'New Project',
    }));
    expect(db.projects.find((project) => project.slug === 'new-project')).toEqual(expect.objectContaining({
      workspace_id: WORKSPACE_A,
    }));
    expect(db.project_events.at(-1)).toEqual(expect.objectContaining({
      project_id: response.body.project.id,
      event_type: 'project_registered',
      metadata: expect.objectContaining({ workspaceId: WORKSPACE_A }),
    }));
  });

  it('keeps the existing read-audit fail-closed guarantee after tenant filtering', async () => {
    failAuditInsert = true;

    const response = await request(createProbeApp()).get('/projects/one/releases');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Project read audit persistence failed',
      code: 'AUDIT_PERSISTENCE_FAILED',
    });
  });
});
