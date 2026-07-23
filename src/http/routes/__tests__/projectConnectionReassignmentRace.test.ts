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
  status: string;
  last_checked_at: string | null;
  updated_at: string | null;
}

const state = vi.hoisted(() => ({
  projects: [] as ProjectRow[],
  connections: [] as ConnectionRow[],
  events: [] as Array<Record<string, unknown>>,
  reassignAfterOwnershipCheck: false,
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
      const selected = rows[0] ? { ...rows[0] } : null;

      if (
        this.table === 'project_connections'
        && this.operation === 'select'
        && selected
        && state.reassignAfterOwnershipCheck
      ) {
        const live = state.connections.find(row => row.id === selected.id);
        if (live) live.project_id = 'project-beta';
        state.reassignAfterOwnershipCheck = false;
      }

      return Promise.resolve({ data: selected, error: result.error });
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
  state.connections.splice(0, state.connections.length, {
    id: 'connection-alpha',
    project_id: 'project-alpha',
    status: 'active',
    last_checked_at: null,
    updated_at: null,
  });
  state.events.splice(0);
  state.reassignAfterOwnershipCheck = false;
});

describe('project connection reassignment race', () => {
  it('does not update or audit a connection that leaves the route project after ownership validation', async () => {
    state.reassignAfterOwnershipCheck = true;

    const response = await request(createApp())
      .post('/projects/alpha/connections/connection-alpha/check')
      .send({ status: 'disconnected' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'No row returned' });
    expect(state.connections).toEqual([
      expect.objectContaining({
        id: 'connection-alpha',
        project_id: 'project-beta',
        status: 'active',
        last_checked_at: null,
      }),
    ]);
    expect(state.events).toEqual([]);
  });
});
