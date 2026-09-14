import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../events/outbox.js', () => ({ enqueueReconcile: vi.fn() }));

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

function evidence(kind: string) {
  return {
    kind,
    state: 'VERIFIED',
    observedAt: '2026-09-13T23:54:00.000Z',
    evidenceRef: `evidence:${kind}:route`,
    staleAfterSeconds: 600,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderAllowlistBuilder();
    throw new Error(`Unexpected table: ${table}`);
  });
});

describe('WaterTruth shadow capability runtime', () => {
  it('appears in the founder-only capability workbench', async () => {
    authorizeFounder();

    const res = await request(buildApp())
      .get('/capabilities')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'watertruth-evidence-gated-authority-shadow-v1',
        runtime: 'dynamic',
      }),
    ]));
  });

  it('evaluates an operational adjustment in shadow without allowing a live mutation', async () => {
    authorizeFounder();

    const res = await request(buildApp())
      .post('/capabilities/watertruth-evidence-gated-authority-shadow-v1/runs')
      .set('Authorization', BEARER)
      .send({
        actionId: 'watertruth:route:1',
        actionClass: 'REVERSIBLE_OPERATIONAL_ADJUSTMENT',
        proposedAction: 'Evaluate a simulated 3% pump setpoint adjustment.',
        evaluatedAt: '2026-09-13T23:55:00.000Z',
        evidence: [
          evidence('telemetry_integrity'),
          evidence('calibration'),
          evidence('model_domain'),
          evidence('operator_approval'),
        ],
      });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.run).toEqual(expect.objectContaining({
      capabilityId: 'watertruth-evidence-gated-authority-shadow-v1',
      state: 'completed',
      authority: 'shadow_only',
      mutationAllowed: false,
      liveWaterControlAllowed: false,
      potabilityClaimAllowed: false,
    }));
    expect(res.body.run.receipt).toEqual(expect.objectContaining({
      evidenceDisposition: 'VERIFIED',
      shadowAuthority: 'SUPERVISED_ACTION',
      shadowDisposition: 'SUPERVISED_ACTION_ELIGIBLE',
      mutationAllowed: false,
      liveWaterControlAllowed: false,
      potabilityClaimAllowed: false,
    }));
  });

  it('rejects malformed action classes instead of widening runtime authority', async () => {
    authorizeFounder();

    const res = await request(buildApp())
      .post('/capabilities/watertruth-evidence-gated-authority-shadow-v1/runs')
      .set('Authorization', BEARER)
      .send({
        actionId: 'watertruth:route:bad',
        actionClass: 'LIVE_OVERRIDE',
        proposedAction: 'Unsupported live override.',
        evaluatedAt: '2026-09-13T23:55:00.000Z',
        evidence: [],
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'actionClass is unsupported',
      code: 'watertruth_invalid_request',
    });
  });

  it('keeps the WaterTruth runtime behind founder authorization', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await request(buildApp())
      .post('/capabilities/watertruth-evidence-gated-authority-shadow-v1/runs')
      .send({
        actionId: 'watertruth:route:unauthorized',
        actionClass: 'OBSERVATION',
        proposedAction: 'Observe only.',
        evaluatedAt: '2026-09-13T23:55:00.000Z',
        evidence: [evidence('telemetry_integrity')],
      });

    expect(res.status).toBe(401);
  });
});