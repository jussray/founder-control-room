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
import { promptosRouter } from '../promptos.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/promptos', promptosRouter);
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

beforeEach(() => vi.clearAllMocks());

describe('promptos router auth gate', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(buildApp()).get('/promptos');
    expect(res.status).toBe(401);
  });
});

describe('GET /promptos', () => {
  it('lists templates', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'promptos_templates') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [{ id: 't1', name: 'L99' }], error: null }),
          }),
        };
      }
      return {};
    });
    const res = await request(buildApp()).get('/promptos').set('Authorization', BEARER);
    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
  });
});

describe('GET /promptos/:id', () => {
  it('returns 404 for an unknown template', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'promptos_templates') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
      }
      return {};
    });
    const res = await request(buildApp()).get('/promptos/no-such-id').set('Authorization', BEARER);
    expect(res.status).toBe(404);
  });

  it('returns a template with its version history', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'promptos_templates') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 't1', name: 'L99', current_version: 2 }, error: null }) }),
          }),
        };
      }
      if (table === 'promptos_template_versions') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [{ version: 2 }, { version: 1 }], error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const res = await request(buildApp()).get('/promptos/t1').set('Authorization', BEARER);
    expect(res.status).toBe(200);
    expect(res.body.versions).toHaveLength(2);
  });
});

describe('POST /promptos', () => {
  it('rejects a missing name or bodyTemplate', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      return {};
    });
    const res = await request(buildApp()).post('/promptos').set('Authorization', BEARER).send({ name: 'X' });
    expect(res.status).toBe(400);
  });

  it('creates a template at version 1, extracting [PLACEHOLDER] variables', async () => {
    authSuccess();
    let insertedVersion: unknown = null;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'promptos_templates') {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: () => Promise.resolve({
                data: { id: 'new-id', ...row },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'promptos_template_versions') {
        return {
          insert: (row: unknown) => {
            insertedVersion = row;
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    });

    const res = await request(buildApp())
      .post('/promptos')
      .set('Authorization', BEARER)
      .send({ name: 'Redteam', bodyTemplate: 'Attack [PREMISE] then attack [PLAN].' });

    expect(res.status).toBe(201);
    expect(res.body.template.variables).toEqual(['PREMISE', 'PLAN']);
    expect(res.body.template.current_version).toBe(1);
    expect(insertedVersion).toMatchObject({ template_id: 'new-id', version: 1 });
  });
});

describe('PATCH /promptos/:id', () => {
  it('rejects when no recognized field is provided', async () => {
    authSuccess();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'promptos_templates') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 't1', current_version: 1 }, error: null }) }) }) };
      }
      return {};
    });
    const res = await request(buildApp()).patch('/promptos/t1').set('Authorization', BEARER).send({});
    expect(res.status).toBe(400);
  });

  it('bumps current_version and appends a version row when bodyTemplate changes', async () => {
    authSuccess();
    let insertedVersion: unknown = null;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderUsersRow();
      if (table === 'promptos_templates') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 't1', current_version: 1 }, error: null }) }),
          }),
          update: (fields: Record<string, unknown>) => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: 't1', ...fields }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'promptos_template_versions') {
        return {
          insert: (row: unknown) => { insertedVersion = row; return Promise.resolve({ error: null }); },
        };
      }
      return {};
    });

    const res = await request(buildApp())
      .patch('/promptos/t1')
      .set('Authorization', BEARER)
      .send({ bodyTemplate: 'New body with [X].', changeNote: 'tightened wording' });

    expect(res.status).toBe(200);
    expect(res.body.template.current_version).toBe(2);
    expect(insertedVersion).toMatchObject({ template_id: 't1', version: 2, change_note: 'tightened wording' });
  });
});
