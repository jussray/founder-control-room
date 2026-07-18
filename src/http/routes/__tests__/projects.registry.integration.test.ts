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

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/projects', projectsRouter);
  return app;
}

function authSuccess() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: FOUNDER_EMAIL } },
    error: null,
  });
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /projects', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(buildApp()).get('/projects');
    expect(res.status).toBe(401);
  });

  it('lists registered projects', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [{ id: 'p1', slug: 'sekret-bip', name: "Se'kret Bip" }], error: null }),
          }),
        };
      }
      return {};
    });

    const res = await request(buildApp()).get('/projects').set('Authorization', BEARER);
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
  });
});

describe('POST /projects', () => {
  it('rejects a missing slug or name', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const res = await request(buildApp())
      .post('/projects')
      .set('Authorization', BEARER)
      .send({ name: 'No Slug' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid slug', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const res = await request(buildApp())
      .post('/projects')
      .set('Authorization', BEARER)
      .send({ slug: 'Not Valid!', name: 'X' });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate slug', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'existing' }, error: null }) }),
          }),
        };
      }
      return {};
    });

    const res = await request(buildApp())
      .post('/projects')
      .set('Authorization', BEARER)
      .send({ slug: 'sekret-bip', name: 'Dup' });
    expect(res.status).toBe(409);
  });

  it('registers a new project and audits it', async () => {
    authSuccess();
    const insertCalls: unknown[] = [];
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({
                data: { id: 'new-project', slug: 'new-thing', name: 'New Thing' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'project_events') {
        return { insert: (row: unknown) => { insertCalls.push(row); return Promise.resolve({ error: null }); } };
      }
      return {};
    });

    const res = await request(buildApp())
      .post('/projects')
      .set('Authorization', BEARER)
      .send({ slug: 'new-thing', name: 'New Thing' });

    expect(res.status).toBe(201);
    expect(res.body.project.slug).toBe('new-thing');
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({ event_type: 'project_registered' });
  });
});

describe('POST /projects/:slug/missions', () => {
  it('rejects a missing title', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });

    const res = await request(buildApp())
      .post('/projects/sekret-bip/missions')
      .set('Authorization', BEARER)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unregistered project', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        };
      }
      return {};
    });

    const res = await request(buildApp())
      .post('/projects/no-such-project/missions')
      .set('Authorization', BEARER)
      .send({ title: 'Do the thing' });
    expect(res.status).toBe(404);
  });

  it('creates a proposed mission and audits it', async () => {
    authSuccess();
    const insertCalls: unknown[] = [];
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'project-1' }, error: null }) }),
          }),
        };
      }
      if (table === 'missions') {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({
                data: { id: 'mission-1', project_id: 'project-1', title: 'Do the thing', status: 'proposed' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'project_events') {
        return { insert: (row: unknown) => { insertCalls.push(row); return Promise.resolve({ error: null }); } };
      }
      return {};
    });

    const res = await request(buildApp())
      .post('/projects/sekret-bip/missions')
      .set('Authorization', BEARER)
      .send({ title: 'Do the thing' });

    expect(res.status).toBe(201);
    expect(res.body.mission.status).toBe('proposed');
    expect(insertCalls[0]).toMatchObject({ event_type: 'mission_created' });
  });
});
