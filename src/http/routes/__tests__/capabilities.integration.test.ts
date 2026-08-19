import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockEnqueueReconcile, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockEnqueueReconcile: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../events/outbox.js', () => ({ enqueueReconcile: mockEnqueueReconcile }));

import express from 'express';
import request from 'supertest';
import { capabilitiesRouter } from '../capabilities.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/capabilities', capabilitiesRouter);
  return app;
}

function authorizeFounder() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u1', email: FOUNDER_EMAIL } },
    error: null,
  });
}

function founderAllowlistBuilder() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('GET /capabilities', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(buildApp()).get('/capabilities');
    expect(res.status).toBe(401);
  });

  it('returns reviewed capabilities only after founder authorization', async () => {
    authorizeFounder();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .get('/capabilities')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'project-health-refresh-v1', runtime: 'dynamic' }),
      expect.objectContaining({ id: 'webhook-verify-hmac-worker-v1' }),
    ]));
  });
});

describe('POST /capabilities/:capabilityId/runs', () => {
  it('enqueues a real ProjectController reconciliation for an active project', async () => {
    authorizeFounder();
    mockEnqueueReconcile.mockResolvedValue('run-1');
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'project-1', slug: 'founder-control-room', status: 'active' },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .post('/capabilities/project-health-refresh-v1/runs')
      .set('Authorization', BEARER)
      .send({ projectSlug: 'founder-control-room' });

    expect(res.status).toBe(202);
    expect(mockEnqueueReconcile).toHaveBeenCalledWith({
      projectId: 'project-1',
      controller: 'ProjectController',
      resourceId: null,
      reason: 'founder_triggered',
    });
    expect(res.body.run).toEqual(expect.objectContaining({
      id: 'run-1',
      capabilityId: 'project-health-refresh-v1',
      projectSlug: 'founder-control-room',
      state: 'queued',
      authority: 'read_only',
    }));
  });

  it('does not let template-only capabilities pretend to have a runtime', async () => {
    authorizeFounder();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .post('/capabilities/webhook-verify-hmac-worker-v1/runs')
      .set('Authorization', BEARER)
      .send({ projectSlug: 'founder-control-room' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('does not have a dynamic runtime');
    expect(mockEnqueueReconcile).not.toHaveBeenCalled();
  });

  it('fails closed for a paused project', async () => {
    authorizeFounder();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'project-1', slug: 'founder-control-room', status: 'paused' },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .post('/capabilities/project-health-refresh-v1/runs')
      .set('Authorization', BEARER)
      .send({ projectSlug: 'founder-control-room' });

    expect(res.status).toBe(409);
    expect(mockEnqueueReconcile).not.toHaveBeenCalled();
  });
});

describe('GET /capabilities/runs/:runId', () => {
  it('returns persisted provider observation for a completed dynamic run', async () => {
    authorizeFounder();
    const observation = {
      provider: 'github',
      resource_id: 'jussray/founder-control-room',
      observed_state: { defaultBranch: 'main', commitSha: 'abc123', verificationSignals: [] },
      observed_at: '2026-08-19T10:00:00.000Z',
    };

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      if (table === 'controller_outbox') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  id: 'run-1',
                  project_id: 'project-1',
                  controller: 'ProjectController',
                  resource_id: null,
                  reason: 'founder_triggered',
                  available_at: '2026-08-19T09:59:58.000Z',
                  claimed_at: '2026-08-19T09:59:59.000Z',
                  completed_at: '2026-08-19T10:00:01.000Z',
                  attempt_count: 0,
                  last_error: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'provider_observations') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: observation, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .get('/capabilities/runs/run-1')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.run).toEqual(expect.objectContaining({
      id: 'run-1',
      capabilityId: 'project-health-refresh-v1',
      state: 'completed',
      observation,
    }));
  });
});
