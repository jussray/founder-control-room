import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { founderOnboardingRouter } from '../founderOnboarding.js';

const FOUNDER_EMAIL = 'founder@example.com';
const WORKSPACE_ID = 'workspace-1';
const BEARER = 'Bearer test-token';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/onboarding', founderOnboardingRouter);
  return instance;
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: { email: FOUNDER_EMAIL },
          error: null,
        }),
      }),
    }),
  };
}

function workspaceMembersRow(memberships: Record<string, unknown>[] = [{
  workspace_id: WORKSPACE_ID,
  role: 'owner',
  created_at: '2026-09-07T00:00:00.000Z',
}]) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: memberships, error: null }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user', email: FOUNDER_EMAIL } },
    error: null,
  });
});

describe('GET /onboarding/state', () => {
  it('returns only the active workspace project graph plus the founder authority boundary', async () => {
    const projectFilters: Array<[string, unknown]> = [];

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'workspace_members') return workspaceMembersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: (field: string, value: unknown) => {
              projectFilters.push([field, value]);
              return {
                order: () => Promise.resolve({
                  data: [{
                    id: 'project-1',
                    workspace_id: WORKSPACE_ID,
                    slug: 'founder-control-room',
                    name: 'Founder Control Room',
                    repo_provider: 'github',
                    repo_identifier: 'jussray/founder-control-room',
                    status: 'active',
                    risk_level: 'high',
                  }],
                  error: null,
                }),
              };
            },
          }),
        };
      }
      if (table === 'project_connections') {
        return {
          select: () => ({
            in: () => ({
              order: () => Promise.resolve({
                data: [{
                  id: 'connection-1',
                  project_id: 'project-1',
                  connection_type: 'github',
                  label: 'primary',
                  status: 'disconnected',
                  authority_level: 'L5',
                  capabilities: ['inspect_repos'],
                }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const response = await request(app())
      .get('/onboarding/state')
      .set('Authorization', BEARER);

    expect(response.status).toBe(200);
    expect(projectFilters).toContainEqual(['workspace_id', WORKSPACE_ID]);
    expect(response.body.activeWorkspace).toEqual({ id: WORKSPACE_ID, role: 'owner' });
    expect(response.body.complete).toBe(true);
    expect(response.body.projects[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      slug: 'founder-control-room',
    });
    expect(response.body.projects[0].connections[0]).toMatchObject({
      type: 'github',
      status: 'disconnected',
      authorityLevel: 'L5',
    });
    expect(response.body.recommendedProviders.map((provider: { type: string }) => provider.type))
      .toContain('hubspot');
    expect(response.body.authorityBoundary).toEqual(expect.objectContaining({
      loginGrantsExecution: false,
      mergeRequiresSeparateApproval: true,
      deployRequiresSeparateApproval: true,
      connectionSlotsStoreCredentials: false,
      publicSignupEnabled: false,
    }));
  });

  it('refuses a workspace id that is not in the founder membership set', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'workspace_members') return workspaceMembersRow();
      return {};
    });

    const response = await request(app())
      .get('/onboarding/state')
      .set('Authorization', BEARER)
      .set('x-fcr-workspace-id', 'workspace-bob');

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/not available to this founder/i);
    expect(supabaseMock.from.mock.calls.some(([table]) => table === 'projects')).toBe(false);
  });
});

describe('POST /onboarding/bootstrap', () => {
  it('creates an idempotent project inside the active workspace and disconnected provider slots', async () => {
    const insertedConnections: Record<string, unknown>[] = [];
    const insertedProjects: Record<string, unknown>[] = [];
    const projectFilters: Array<[string, unknown]> = [];
    let eventRow: Record<string, unknown> | null = null;

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'workspace_members') return workspaceMembersRow();

      if (table === 'projects') {
        return {
          select: () => ({
            eq: (field: string, value: unknown) => {
              projectFilters.push([field, value]);
              return {
                eq: (nextField: string, nextValue: unknown) => {
                  projectFilters.push([nextField, nextValue]);
                  return {
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  };
                },
              };
            },
          }),
          insert: (row: Record<string, unknown>) => {
            insertedProjects.push(row);
            return {
              select: () => ({
                single: () => Promise.resolve({
                  data: { id: 'project-1', ...row },
                  error: null,
                }),
              }),
            };
          },
        };
      }

      if (table === 'project_connections') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
          insert: (rows: Record<string, unknown>[]) => {
            insertedConnections.push(...rows);
            return {
              select: () => Promise.resolve({
                data: rows.map((row, index) => ({ id: `connection-${index + 1}`, ...row })),
                error: null,
              }),
            };
          },
        };
      }

      if (table === 'project_events') {
        return {
          insert: (row: Record<string, unknown>) => {
            eventRow = row;
            return Promise.resolve({ error: null });
          },
        };
      }

      return {};
    });

    const response = await request(app())
      .post('/onboarding/bootstrap')
      .set('Authorization', BEARER)
      .send({
        project: {
          slug: 'founder-control-room',
          name: 'Founder Control Room',
          repoProvider: 'github',
          repoIdentifier: 'jussray/founder-control-room',
          stack: 'Cloudflare + Supabase',
          riskLevel: 'high',
        },
        providers: ['github', 'openai', 'hubspot', 'playwright'],
      });

    expect(response.status).toBe(201);
    expect(projectFilters).toEqual([
      ['workspace_id', WORKSPACE_ID],
      ['slug', 'founder-control-room'],
    ]);
    expect(insertedProjects[0]).toMatchObject({
      workspace_id: WORKSPACE_ID,
      slug: 'founder-control-room',
    });
    expect(insertedConnections.map((row) => row.connection_type)).toEqual([
      'github',
      'openai',
      'hubspot',
      'playwright',
    ]);
    expect(insertedConnections.every((row) => row.status === 'disconnected')).toBe(true);
    expect(insertedConnections.every((row) => row.secret_ref === null)).toBe(true);
    expect(JSON.stringify(insertedConnections)).not.toMatch(/api[_-]?key|access[_-]?token|bearer/i);
    expect(response.body.activeWorkspace).toEqual({ id: WORKSPACE_ID, role: 'owner' });
    expect(response.body.truth).toEqual({
      credentialsStored: false,
      providersConnected: false,
      mergeApproved: false,
      deploymentApproved: false,
      publicSignupEnabled: false,
    });
    expect(eventRow).toMatchObject({
      event_type: 'founder_onboarding_bootstrapped',
      metadata: expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        authorityGranted: false,
        credentialsStored: false,
      }),
    });
  });

  it('rejects undeclared providers before attempting a project mutation', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'workspace_members') return workspaceMembersRow();
      return {};
    });

    const response = await request(app())
      .post('/onboarding/bootstrap')
      .set('Authorization', BEARER)
      .send({
        project: { slug: 'test-project', name: 'Test Project' },
        providers: ['unknown-provider'],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/providers must be drawn from/);
  });
});
