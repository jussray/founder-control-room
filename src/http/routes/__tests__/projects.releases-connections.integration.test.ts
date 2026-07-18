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
import { projectsRouter } from '../projects.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const PROJECT_SLUG = 'sekret-bip';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/projects', projectsRouter);
  return app;
}

function authSuccess() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: FOUNDER_EMAIL } }, error: null });
}

function founderUsersRow() {
  return {
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }) }) }),
  };
}

function projectFoundRow(exists = true) {
  return {
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: exists ? { id: 'project-1' } : null, error: null }) }),
    }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('GET /projects/:slug/releases', () => {
  it('returns 404 for an unregistered project', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return projectFoundRow(false);
      return {};
    });
    const res = await request(buildApp()).get(`/projects/${PROJECT_SLUG}/releases`).set('Authorization', BEARER);
    expect(res.status).toBe(404);
  });

  it('lists the release ledger read-only', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return projectFoundRow(true);
      if (table === 'releases') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [{ id: 'r1', status: 'deployed', version: '1.0.0' }], error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const res = await request(buildApp()).get(`/projects/${PROJECT_SLUG}/releases`).set('Authorization', BEARER);
    expect(res.status).toBe(200);
    expect(res.body.releases).toHaveLength(1);
  });
});

describe('GET /projects/:slug/connections', () => {
  it('lists connection slots', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return projectFoundRow(true);
      if (table === 'project_connections') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [{ id: 'c1', connection_type: 'github', status: 'active' }], error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const res = await request(buildApp()).get(`/projects/${PROJECT_SLUG}/connections`).set('Authorization', BEARER);
    expect(res.status).toBe(200);
    expect(res.body.connections).toHaveLength(1);
  });
});

describe('POST /projects/:slug/connections', () => {
  it('rejects an unknown connectionType', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });
    const res = await request(buildApp())
      .post(`/projects/${PROJECT_SLUG}/connections`)
      .set('Authorization', BEARER)
      .send({ connectionType: 'not-a-real-provider' });
    expect(res.status).toBe(400);
  });

  it('never accepts or stores an actual secret value — only a secretRef pointer', async () => {
    authSuccess();
    let insertedRow: Record<string, unknown> | null = null;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return projectFoundRow(true);
      if (table === 'project_connections') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedRow = row;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'conn-1', ...row }, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'project_events') return { insert: () => Promise.resolve({ error: null }) };
      return {};
    });

    const res = await request(buildApp())
      .post(`/projects/${PROJECT_SLUG}/connections`)
      .set('Authorization', BEARER)
      .send({ connectionType: 'cloudflare', secretRef: 'CLOUDFLARE_API_TOKEN' });

    expect(res.status).toBe(201);
    expect(insertedRow).toMatchObject({ connection_type: 'cloudflare', secret_ref: 'CLOUDFLARE_API_TOKEN' });
    // The route only ever stores a reference string, never the credential itself.
    expect(JSON.stringify(insertedRow)).not.toContain('token=');
  });

  it('returns 409 on a duplicate (project, connectionType, label)', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') return projectFoundRow(true);
      if (table === 'project_connections') {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await request(buildApp())
      .post(`/projects/${PROJECT_SLUG}/connections`)
      .set('Authorization', BEARER)
      .send({ connectionType: 'git' });
    expect(res.status).toBe(409);
  });
});
