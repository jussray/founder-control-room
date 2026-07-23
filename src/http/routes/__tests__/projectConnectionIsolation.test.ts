import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ProjectRow {
  id: string;
  slug: string;
}

interface ConnectionRow {
  id: string;
  project_id: string;
  connection_type: string;
  label: string;
  status: string;
  last_checked_at: string | null;
  updated_at: string | null;
}

const state = vi.hoisted(() => ({
  projects: [] as ProjectRow[],
  connections: [] as ConnectionRow[],
  events: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.founder = { email: 'founder@example.com', userId: 'founder-user-1' };
    next();
  },
}));

vi.mock('../../../providers/providerFactory.js', () => ({
  providerForProject: vi.fn(),
}));

vi.mock('../../../lib/supabaseClient.js', () => {
  type Filter = { field: string; value: unknown };

  class QueryBuilder {
    private readonly filters: Filter[] = [];
    private operation: 'select' | 'update' | 'insert' = 'select';
    private payload: unknown = null;

    constructor(private readonly table: string) {}

    select(_columns = '*') {
      return this;
    }

    eq(field: string, value: unknown) {
      this.filters.push({ field, value });
      return this;
    }

    order(_field: string, _options?: unknown) {
      return this;
    }

    update(payload: unknown) {
      this.operation = 'update';
      this.payload = payload;
      return this;
    }

    insert(payload: unknown) {
      this.operation = 'insert';
      this.payload = payload;
      return this;
    }

    maybeSingle() {
      const result = this.execute();
      const rows = Array.isArray(result.data) ? result.data : [];
      return Promise.resolve({ data: rows[0] ?? null, error: result.error });
    }

    single() {
      const result = this.execute();
      const rows = Array.isArray(result.data) ? result.data : [];
      return Promise.resolve({
        data: rows[0] ?? null,
        error: rows[0] ? result.error : { message: 'No row returned' },
      });
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }

    private matches(row: Record<string, unknown>) {
      return this.filters.every(filter => row[filter.field] === filter.value);
    }

    private execute(): { data: unknown; error: null } {
      if (this.table === 'projects') {
        return {
          data: state.projects.filter(row => this.matches(row as unknown as Record<string, unknown>)),
          error: null,
        };
      }

      if (this.table === 'project_connections') {
        if (this.operation === 'update') {
          const update = this.payload as Partial<ConnectionRow>;
          const updated: ConnectionRow[] = [];
          for (const connection of state.connections) {
            if (!this.matches(connection as unknown as Record<string, unknown>)) continue;
            Object.assign(connection, update);
            updated.push({ ...connection });
          }
          return { data: updated, error: null };
        }

        return {
          data: state.connections
            .filter(row => this.matches(row as unknown as Record<string, unknown>))
            .map(row => ({ ...row })),
          error: null,
        };
      }

      if (this.table === 'project_events' && this.operation === 'insert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        state.events.push(...rows as Array<Record<string, unknown>>);
        return { data: rows, error: null };
      }

      throw new Error(`Unexpected query against ${this.table}`);
    }
  }

  return {
    supabase: {
      from: (table: string) => new QueryBuilder(table),
    },
  };
});

import { projectsRouter } from '../projects.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/projects', projectsRouter);
  return app;
}

beforeEach(() => {
  state.projects.splice(0, state.projects.length,
    { id: 'project-alpha', slug: 'alpha' },
    { id: 'project-beta', slug: 'beta' },
  );
  state.connections.splice(0, state.connections.length,
    {
      id: 'connection-alpha',
      project_id: 'project-alpha',
      connection_type: 'figma',
      label: 'alpha-design',
      status: 'active',
      last_checked_at: null,
      updated_at: null,
    },
    {
      id: 'connection-beta',
      project_id: 'project-beta',
      connection_type: 'github',
      label: 'beta-repo',
      status: 'active',
      last_checked_at: null,
      updated_at: null,
    },
  );
  state.events.splice(0);
});

describe('project connection isolation', () => {
  it('lists only connections owned by the requested project', async () => {
    const alpha = await request(createApp()).get('/projects/alpha/connections');
    const beta = await request(createApp()).get('/projects/beta/connections');

    expect(alpha.status).toBe(200);
    expect(alpha.body.connections).toEqual([
      expect.objectContaining({
        id: 'connection-alpha',
        project_id: 'project-alpha',
      }),
    ]);
    expect(JSON.stringify(alpha.body)).not.toContain('connection-beta');

    expect(beta.status).toBe(200);
    expect(beta.body.connections).toEqual([
      expect.objectContaining({
        id: 'connection-beta',
        project_id: 'project-beta',
      }),
    ]);
    expect(JSON.stringify(beta.body)).not.toContain('connection-alpha');
  });

  it('rejects a project-A request that names project-B connection id', async () => {
    const before = structuredClone(state.connections);

    const response = await request(createApp())
      .post('/projects/alpha/connections/connection-beta/check')
      .send({ status: 'error' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'Connection not found for this project',
    });
    expect(state.connections).toEqual(before);
    expect(state.events).toEqual([]);
  });

  it('updates and audits only the connection owned by the route project', async () => {
    const response = await request(createApp())
      .post('/projects/alpha/connections/connection-alpha/check')
      .send({ status: 'disconnected' });

    expect(response.status).toBe(200);
    expect(response.body.connection).toEqual(expect.objectContaining({
      id: 'connection-alpha',
      project_id: 'project-alpha',
      status: 'disconnected',
    }));

    const alpha = state.connections.find(row => row.id === 'connection-alpha');
    const beta = state.connections.find(row => row.id === 'connection-beta');
    expect(alpha?.status).toBe('disconnected');
    expect(alpha?.last_checked_at).toEqual(expect.any(String));
    expect(beta).toEqual(expect.objectContaining({
      project_id: 'project-beta',
      status: 'active',
      last_checked_at: null,
    }));

    expect(state.events).toEqual([
      expect.objectContaining({
        project_id: 'project-alpha',
        event_type: 'project_connection_checked',
      }),
    ]);
  });
});
