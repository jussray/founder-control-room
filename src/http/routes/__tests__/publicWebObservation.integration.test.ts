import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockEnqueueReconcile, mockObservePublicWeb, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockEnqueueReconcile: vi.fn(),
  mockObservePublicWeb: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../events/outbox.js', () => ({ enqueueReconcile: mockEnqueueReconcile }));
vi.mock('../../../capabilities/publicWebObservation.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../capabilities/publicWebObservation.js')>();
  return {
    ...original,
    observePublicWeb: mockObservePublicWeb,
  };
});

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

function founderAllowlistBuilder() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function observation() {
  const evidence = `sha256:${'b'.repeat(64)}`;
  return {
    contract: 'fcr/public-web-observation@v1',
    provider: 'fcr-research-hub',
    adapterId: 'research-adapter',
    operation: 'search',
    authority: 'read_only',
    consequence: 'READ',
    mutationAllowed: false,
    providerAccepted: true,
    truthState: 'provider_observed_unverified',
    contentTrust: 'untrusted_web',
    observedAt: '2026-10-06T07:30:00.000Z',
    requestFingerprint: `sha256:${'a'.repeat(64)}`,
    sourceUrls: ['https://example.com/source'],
    resultCount: 1,
    data: { result: { title: 'Example' } },
    continuity: {
      predecessorFingerprint: null,
      predecessorProofCookie: null,
      evidenceFingerprint: evidence,
      proofCookie: `fcr-public-web:v1:${'b'.repeat(32)}`,
      transition: 'initial',
      authorityEffect: 'none',
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u1', email: FOUNDER_EMAIL } },
    error: null,
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderAllowlistBuilder();
    throw new Error(`Unexpected table: ${table}`);
  });
  mockObservePublicWeb.mockResolvedValue(observation());
});

describe('FCR public-web capability HTTP boundary', () => {
  it('lists the FCR-owned capability', async () => {
    const res = await request(buildApp())
      .get('/capabilities')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'public-web-observation-v1',
        runtime: 'dynamic',
      }),
    ]));
  });

  it('keeps the run founder-authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await request(buildApp())
      .post('/capabilities/public-web-observation-v1/runs')
      .send({ operation: 'search', query: 'anything' });

    expect(res.status).toBe(401);
    expect(mockObservePublicWeb).not.toHaveBeenCalled();
  });

  it('returns a no-store read-only receipt', async () => {
    const res = await request(buildApp())
      .post('/capabilities/public-web-observation-v1/runs')
      .set('Authorization', BEARER)
      .send({ operation: 'search', query: 'bounded query' });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.run).toMatchObject({
      capabilityId: 'public-web-observation-v1',
      state: 'completed',
      authority: 'read_only',
      consequence: 'READ',
      mutationAllowed: false,
      sharedRuntime: {
        contract: 'fcr/shared-capability-runtime-receipt@v1',
        state: 'PROVIDER_ACCEPTED',
        completionClaim: { allowed: false },
      },
      observation: {
        provider: 'fcr-research-hub',
        authority: 'read_only',
        mutationAllowed: false,
        continuity: { authorityEffect: 'none' },
      },
    });
    expect(mockEnqueueReconcile).not.toHaveBeenCalled();
  });

  it('rejects unsupported operations before research execution', async () => {
    const res = await request(buildApp())
      .post('/capabilities/public-web-observation-v1/runs')
      .set('Authorization', BEARER)
      .send({ operation: 'merge', query: 'main' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('public_web_invalid_request');
    expect(mockObservePublicWeb).not.toHaveBeenCalled();
  });
});
