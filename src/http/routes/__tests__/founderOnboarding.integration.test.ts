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

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user', email: FOUNDER_EMAIL } },
    error: null,
  });
});

describe('GET /onboarding/state', () => {
  it('returns real project and connection state plus the founder authority boundary', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            order: () => Promise.resolve({
              data: [{
                id: 'project-1',
                slug: 'founder-control-room',
                name: 'Founder Control Room',
                repo_provider: 'github',
                repo_identifier: 'jussray/founder-control-room',
                status: 'active',
                risk_level: 'high',
              }],
              error: null,
            }),
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
    expect(response.body.complete).toBe(true);
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
    }));
  });
});

describe('POST /onboarding/bootstrap', () => {
  it('creates an idempotent project foundation and disconnected provider slots without credentials or execution authority', async () => {
    const insertedConnections: Record<string, unknown>[] = [];
    let eventRow: Record<string, unknown> | null = null;

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();

      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: () => Promise.resolve({
                data: { id: 'project-1', ...row },
                error: null,
              }),
            }),
          }),
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
    expect(insertedConnections.map((row) => row.connection_type)).toEqual([
      'github',
      'openai',
      'hubspot',
      'playwright',
    ]);
    expect(insertedConnections.every((row) => row.status === 'disconnected')).toBe(true);
    expect(insertedConnections.every((row) => row.secret_ref === null)).toBe(true);
    expect(JSON.stringify(insertedConnections)).not.toMatch(/api[_-]?key|access[_-]?token|bearer/i);
    expect(response.body.truth).toEqual({
      credentialsStored: false,
      providersConnected: false,
      mergeApproved: false,
      deploymentApproved: false,
    });
    expect(eventRow).toMatchObject({
      event_type: 'founder_onboarding_bootstrapped',
      metadata: expect.objectContaining({
        authorityGranted: false,
        credentialsStored: false,
      }),
    });
  });

  it('rejects undeclared providers before attempting a workspace mutation', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
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
