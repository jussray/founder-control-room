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
const DYNAMIC_RESOURCE_PREFIX = 'capability:project-health-refresh-v1:invocation:';

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

function projectBuilder(status = 'active') {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: { id: 'project-1', slug: 'founder-control-room', status },
          error: null,
        }),
      }),
    }),
  };
}

function outboxBuilder(data: Record<string, unknown>) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data, error: null }),
      }),
    }),
  };
}

function reconciliationRunBuilder(data: Record<string, unknown> | null) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

function observationBuilder(data: Record<string, unknown> | null) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data, error: null }),
          }),
        }),
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
  it('enqueues repeatable ProjectController work with a unique durable invocation identity', async () => {
    authorizeFounder();
    mockEnqueueReconcile
      .mockResolvedValueOnce('run-1')
      .mockResolvedValueOnce('run-2');
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      if (table === 'projects') return projectBuilder();
      throw new Error(`Unexpected table: ${table}`);
    });

    const first = await request(buildApp())
      .post('/capabilities/project-health-refresh-v1/runs')
      .set('Authorization', BEARER)
      .send({ projectSlug: 'founder-control-room' });
    const second = await request(buildApp())
      .post('/capabilities/project-health-refresh-v1/runs')
      .set('Authorization', BEARER)
      .send({ projectSlug: 'founder-control-room' });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(mockEnqueueReconcile).toHaveBeenCalledTimes(2);

    const firstEntry = mockEnqueueReconcile.mock.calls[0]?.[0];
    const secondEntry = mockEnqueueReconcile.mock.calls[1]?.[0];
    expect(firstEntry).toEqual(expect.objectContaining({
      projectId: 'project-1',
      controller: 'ProjectController',
      reason: 'founder_triggered',
      resourceId: expect.stringMatching(/^capability:project-health-refresh-v1:invocation:[0-9a-f-]{36}$/),
    }));
    expect(secondEntry).toEqual(expect.objectContaining({
      resourceId: expect.stringMatching(/^capability:project-health-refresh-v1:invocation:[0-9a-f-]{36}$/),
    }));
    expect(firstEntry.resourceId).not.toBe(secondEntry.resourceId);
    expect(first.body.run).toEqual(expect.objectContaining({
      id: 'run-1',
      capabilityId: 'project-health-refresh-v1',
      projectSlug: 'founder-control-room',
      state: 'queued',
      authority: 'read_only',
    }));
  });

  it('rejects empty input without enqueueing work', async () => {
    authorizeFounder();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .post('/capabilities/project-health-refresh-v1/runs')
      .set('Authorization', BEARER);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('projectSlug is required');
    expect(mockEnqueueReconcile).not.toHaveBeenCalled();
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
      if (table === 'projects') return projectBuilder('paused');
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
  it('returns result and provider observation only when both match the exact invocation outcome', async () => {
    authorizeFounder();
    const resourceId = `${DYNAMIC_RESOURCE_PREFIX}run-1`;
    const runResult = {
      status: 'converged',
      observed_changes: [{
        resourceType: 'repository',
        resourceId: 'jussray/founder-control-room',
        field: 'commitSha',
        previousValue: null,
        newValue: 'abc123',
      }],
      proposed_actions: [],
      requires_approval: false,
      message: 'Observed jussray/founder-control-room@abc123',
      started_at: '2026-08-19T09:59:59.000Z',
      completed_at: '2026-08-19T10:00:01.000Z',
    };
    const observation = {
      provider: 'github',
      resource_id: 'jussray/founder-control-room',
      observed_state: { defaultBranch: 'main', commitSha: 'abc123', verificationSignals: [] },
      observed_at: '2026-08-19T10:00:00.000Z',
    };

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      if (table === 'controller_outbox') {
        return outboxBuilder({
          id: 'run-1',
          project_id: 'project-1',
          controller: 'ProjectController',
          resource_id: resourceId,
          reason: 'founder_triggered',
          available_at: '2026-08-19T09:59:58.000Z',
          claimed_at: null,
          completed_at: '2026-08-19T10:00:01.000Z',
          attempt_count: 0,
          last_error: null,
        });
      }
      if (table === 'reconciliation_runs') return reconciliationRunBuilder(runResult);
      if (table === 'provider_observations') return observationBuilder(observation);
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
      result: runResult,
      observation,
      observationState: 'matched',
    }));
  });

  it('does not cross-wire a newer provider observation into an older automation run', async () => {
    authorizeFounder();
    const resourceId = `${DYNAMIC_RESOURCE_PREFIX}run-older`;
    const runResult = {
      status: 'converged',
      observed_changes: [{
        resourceType: 'repository',
        resourceId: 'jussray/founder-control-room',
        field: 'commitSha',
        previousValue: null,
        newValue: 'abc123',
      }],
      proposed_actions: [],
      requires_approval: false,
      message: 'Observed old head',
      started_at: '2026-08-19T09:59:59.000Z',
      completed_at: '2026-08-19T10:00:01.000Z',
    };

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      if (table === 'controller_outbox') {
        return outboxBuilder({
          id: 'run-older',
          project_id: 'project-1',
          controller: 'ProjectController',
          resource_id: resourceId,
          reason: 'founder_triggered',
          available_at: '2026-08-19T09:59:58.000Z',
          claimed_at: null,
          completed_at: '2026-08-19T10:00:01.000Z',
          attempt_count: 0,
          last_error: null,
        });
      }
      if (table === 'reconciliation_runs') return reconciliationRunBuilder(runResult);
      if (table === 'provider_observations') {
        return observationBuilder({
          provider: 'github',
          resource_id: 'jussray/founder-control-room',
          observed_state: { defaultBranch: 'main', commitSha: 'newer456', verificationSignals: [] },
          observed_at: '2026-08-19T10:05:00.000Z',
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .get('/capabilities/runs/run-older')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.run.state).toBe('completed');
    expect(res.body.run.result).toEqual(runResult);
    expect(res.body.run.observation).toBeNull();
    expect(res.body.run.observationState).toBe('superseded');
  });

  it('reports completed work without a durable execution result as unverified', async () => {
    authorizeFounder();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      if (table === 'controller_outbox') {
        return outboxBuilder({
          id: 'run-no-audit',
          project_id: 'project-1',
          controller: 'ProjectController',
          resource_id: `${DYNAMIC_RESOURCE_PREFIX}run-no-audit`,
          reason: 'founder_triggered',
          available_at: '2026-08-19T09:59:58.000Z',
          claimed_at: null,
          completed_at: '2026-08-19T10:00:01.000Z',
          attempt_count: 0,
          last_error: null,
        });
      }
      if (table === 'reconciliation_runs') return reconciliationRunBuilder(null);
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .get('/capabilities/runs/run-no-audit')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.run).toEqual(expect.objectContaining({
      state: 'completed_unverified',
      result: null,
      observation: null,
      observationState: null,
    }));
  });

  it('reports terminally abandoned work as failed without returning stale observation data', async () => {
    authorizeFounder();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      if (table === 'controller_outbox') {
        return outboxBuilder({
          id: 'failed-run',
          project_id: 'project-1',
          controller: 'ProjectController',
          resource_id: `${DYNAMIC_RESOURCE_PREFIX}failed-run`,
          reason: 'founder_triggered',
          available_at: '2026-08-19T09:59:58.000Z',
          claimed_at: null,
          completed_at: '2026-08-19T10:00:01.000Z',
          attempt_count: 5,
          last_error: 'Terminal reconciliation failure after 5 attempt(s)',
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .get('/capabilities/runs/failed-run')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.run).toEqual(expect.objectContaining({
      id: 'failed-run',
      capabilityId: 'project-health-refresh-v1',
      state: 'failed',
      attemptCount: 5,
      hasRetryError: true,
      result: null,
      observation: null,
    }));
  });

  it('refuses to relabel unrelated reconciliation work as a capability run', async () => {
    authorizeFounder();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      if (table === 'controller_outbox') {
        return outboxBuilder({
          id: 'other-run',
          project_id: 'project-1',
          controller: 'ProjectController',
          resource_id: 'repository:jussray/founder-control-room',
          reason: 'founder_triggered',
          available_at: '2026-08-19T09:59:58.000Z',
          claimed_at: null,
          completed_at: null,
          attempt_count: 0,
          last_error: null,
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .get('/capabilities/runs/other-run')
      .set('Authorization', BEARER);

    expect(res.status).toBe(404);
  });
});
