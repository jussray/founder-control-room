import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock, eqCalls, insertedProjects } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
  eqCalls: [] as Array<[string, unknown]>,
  insertedProjects: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../middleware/requireFounder.js', () => ({
  requireWorkspaceUser: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.founder = {
      email: 'tenant@example.com',
      userId: 'tenant-user',
      role: 'workspace_owner',
      workspaceId: 'workspace-a',
    };
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import { workspaceProjectsRouter } from '../workspaceProjects.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/workspace/projects', workspaceProjectsRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  eqCalls.length = 0;
  insertedProjects.length = 0;
});

describe('workspace project registry', () => {
  it('always filters list reads by the authenticated workspace', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table !== 'projects') return {};
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              order: () => Promise.resolve({
                data: [{ id: 'project-a', workspace_id: 'workspace-a', slug: 'alpha', name: 'Alpha' }],
                error: null,
              }),
            };
          },
        }),
      };
    });

    const res = await request(buildApp()).get('/workspace/projects');

    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual(['workspace_id', 'workspace-a']);
    expect(res.body.projects).toHaveLength(1);
  });

  it('returns 404 when a slug does not exist inside the authenticated workspace', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table !== 'projects') return {};
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              eq: (nextColumn: string, nextValue: unknown) => {
                eqCalls.push([nextColumn, nextValue]);
                return { maybeSingle: () => Promise.resolve({ data: null, error: null }) };
              },
            };
          },
        }),
      };
    });

    const res = await request(buildApp()).get('/workspace/projects/other-founder-project');

    expect(res.status).toBe(404);
    expect(eqCalls).toEqual([
      ['workspace_id', 'workspace-a'],
      ['slug', 'other-founder-project'],
    ]);
  });

  it('writes the authenticated workspace id into every new project', async () => {
    let projectSelectCount = 0;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: () => {
            projectSelectCount += 1;
            return {
              eq: (column: string, value: unknown) => {
                eqCalls.push([column, value]);
                return {
                  eq: (nextColumn: string, nextValue: unknown) => {
                    eqCalls.push([nextColumn, nextValue]);
                    return { maybeSingle: () => Promise.resolve({ data: null, error: null }) };
                  },
                };
              },
            };
          },
          insert: (row: Record<string, unknown>) => {
            insertedProjects.push(row);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'new-project', ...row }, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'project_events') {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      return {};
    });

    const res = await request(buildApp())
      .post('/workspace/projects')
      .send({ slug: 'new-project', name: 'New Project', repoIdentifier: 'tenant/new-project' });

    expect(projectSelectCount).toBe(1);
    expect(res.status).toBe(201);
    expect(insertedProjects).toHaveLength(1);
    expect(insertedProjects[0]).toMatchObject({
      workspace_id: 'workspace-a',
      slug: 'new-project',
      repo_identifier: 'tenant/new-project',
    });
  });
});
