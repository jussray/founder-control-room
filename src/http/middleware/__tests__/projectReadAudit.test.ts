import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FounderRequest } from '../requireFounder.js';

const {
  mockFrom,
  mockInsert,
  mockSelect,
  mockEq,
  mockMaybeSingle,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockMaybeSingle: vi.fn(),
}));

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}));

import { requireProjectReadAudit } from '../projectReadAudit.js';

function createProbeApp() {
  const app = express();
  app.use(express.json());
  app.use('/projects', (req: FounderRequest, _res, next) => {
    req.founder = { email: 'founder@example.com', userId: 'founder-user-123' };
    next();
  }, requireProjectReadAudit);

  app.get('/projects', (_req, res) => {
    res.json({
      projects: [
        { id: 'project-1', slug: 'one' },
        { id: 'project-2', slug: 'two' },
      ],
    });
  });

  app.get('/projects/:slug', (req, res) => {
    res.json({ project: { id: 'project-1', slug: req.params.slug } });
  });

  app.get('/projects/:slug/releases', (_req, res) => {
    res.json({ releases: [{ id: 'release-1' }] });
  });

  app.get('/projects/:slug/connections', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.post('/projects', (_req, res) => {
    res.status(201).json({ project: { id: 'project-created' } });
  });

  return app;
}

beforeEach(() => {
  vi.clearAllMocks();

  const lookupChain = {
    select: mockSelect,
    eq: mockEq,
    maybeSingle: mockMaybeSingle,
  };

  mockFrom.mockImplementation((table: string) => {
    if (table === 'project_events') return { insert: mockInsert };
    if (table === 'projects') return lookupChain;
    throw new Error(`Unexpected table ${table}`);
  });
  mockSelect.mockReturnValue(lookupChain);
  mockEq.mockReturnValue(lookupChain);
  mockMaybeSingle.mockResolvedValue({ data: { id: 'project-lookup' }, error: null });
  mockInsert.mockResolvedValue({ error: null });
});

describe('requireProjectReadAudit', () => {
  it('audits every project returned by the registry before releasing the response', async () => {
    const response = await request(createProbeApp()).get('/projects');

    expect(response.status).toBe(200);
    expect(response.body.projects).toHaveLength(2);
    expect(mockInsert).toHaveBeenCalledTimes(1);

    const rows = mockInsert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows).toEqual([
      expect.objectContaining({
        project_id: 'project-1',
        event_type: 'project_registry_read',
        metadata: expect.objectContaining({
          route: 'GET /projects',
          actor: 'founder',
          founder_user_id: 'founder-user-123',
          result_project_count: 2,
        }),
      }),
      expect.objectContaining({
        project_id: 'project-2',
        event_type: 'project_registry_read',
      }),
    ]);
  });

  it('uses a project id already present in a project-detail response', async () => {
    const response = await request(createProbeApp()).get('/projects/one');

    expect(response.status).toBe(200);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        project_id: 'project-1',
        event_type: 'project_read',
        metadata: expect.objectContaining({ route: 'GET /projects/:slug' }),
      }),
    ]);
  });

  it('resolves the project id for project-specific list responses', async () => {
    const response = await request(createProbeApp()).get('/projects/one/releases');

    expect(response.status).toBe(200);
    expect(mockSelect).toHaveBeenCalledWith('id');
    expect(mockEq).toHaveBeenCalledWith('slug', 'one');
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        project_id: 'project-lookup',
        event_type: 'project_releases_read',
        metadata: expect.objectContaining({
          route: 'GET /projects/:slug/releases',
        }),
      }),
    ]);
  });

  it('returns an audit-specific 500 instead of leaking a successful response when persistence fails', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'database unavailable' } });

    const response = await request(createProbeApp()).get('/projects/one');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Project read audit persistence failed',
      code: 'AUDIT_PERSISTENCE_FAILED',
    });
    expect(response.body.project).toBeUndefined();
  });

  it('fails closed when a project-specific response cannot be tied to a registered project', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await request(createProbeApp()).get('/projects/one/releases');

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('AUDIT_PERSISTENCE_FAILED');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not rewrite existing error responses', async () => {
    const response = await request(createProbeApp()).get('/projects/one/connections');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not audit non-GET methods', async () => {
    const response = await request(createProbeApp())
      .post('/projects')
      .send({ slug: 'new-project' });

    expect(response.status).toBe(201);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
