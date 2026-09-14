import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock, eqCalls, insertedProjects, insertedEvents } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
  eqCalls: [] as Array<[string, unknown]>,
  insertedProjects: [] as Array<Record<string, unknown>>,
  insertedEvents: [] as Array<Record<string, unknown>>,
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

const composerInput = {
  name: 'New Project',
  slug: 'new-project',
  projectType: 'software_product',
  mission: 'Help one founder ship one verified outcome.',
  currentState: 'A repository exists but the first user path is not yet proved.',
  evidenceNotes: 'Require browser evidence before calling the first path complete.',
};

beforeEach(() => {
  vi.clearAllMocks();
  eqCalls.length = 0;
  insertedProjects.length = 0;
  insertedEvents.length = 0;
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

  it('returns a deterministic non-authorizing Chief recommendation for the exact project subject', async () => {
    const first = await request(buildApp()).post('/workspace/projects/recommendation').send(composerInput);
    const second = await request(buildApp()).post('/workspace/projects/recommendation').send(composerInput);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.recommendation.id).toMatch(/^chief-composer-v1:[a-f0-9]{24}$/);
    expect(second.body.recommendation.id).toBe(first.body.recommendation.id);
    expect(first.body.recommendation.title).toContain('Prove one real user path');
    expect(first.body.recommendation.authorityBoundary).toContain('creates no provider');
    expect(first.body.recommendation.authorityBoundary).toContain('execution authority');
  });

  it('requires founder approval of the current exact Chief recommendation', async () => {
    const recommendation = await request(buildApp()).post('/workspace/projects/recommendation').send(composerInput);

    const missingApproval = await request(buildApp())
      .post('/workspace/projects')
      .send({ ...composerInput, chiefRecommendationId: recommendation.body.recommendation.id });
    expect(missingApproval.status).toBe(400);
    expect(missingApproval.body.error).toContain('Founder approval');

    const stale = await request(buildApp())
      .post('/workspace/projects')
      .send({
        ...composerInput,
        mission: 'A changed mission must invalidate the old recommendation.',
        chiefRecommendationId: recommendation.body.recommendation.id,
        chiefApproval: true,
      });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toContain('stale');
  });

  it('writes workspace identity and the approved Chief Composer receipt into project evidence', async () => {
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
                single: () => Promise.resolve({ data: { id: 'new-project-id', ...row }, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'project_events') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedEvents.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    });

    const recommendation = await request(buildApp()).post('/workspace/projects/recommendation').send(composerInput);
    const res = await request(buildApp())
      .post('/workspace/projects')
      .send({
        ...composerInput,
        repoIdentifier: 'tenant/new-project',
        chiefRecommendationId: recommendation.body.recommendation.id,
        chiefApproval: true,
      });

    expect(projectSelectCount).toBe(1);
    expect(res.status).toBe(201);
    expect(insertedProjects).toHaveLength(1);
    expect(insertedProjects[0]).toMatchObject({
      workspace_id: 'workspace-a',
      slug: 'new-project',
      repo_identifier: 'tenant/new-project',
    });
    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0]).toMatchObject({
      project_id: 'new-project-id',
      event_type: 'workspace_project_registered',
      screen: 'chief-first-run-composer',
      metadata: {
        workspace_id: 'workspace-a',
        composer: {
          version: 'chief-composer-v1',
          project_type: 'software_product',
          mission: composerInput.mission,
          recommendation_id: recommendation.body.recommendation.id,
          founder_approved: true,
          approval_scope: 'workspace:workspace-a/project:new-project/create',
        },
      },
    });
    expect(res.body.chief.approved).toBe(true);
    expect(res.body.chief.recommendation.id).toBe(recommendation.body.recommendation.id);
  });
});
