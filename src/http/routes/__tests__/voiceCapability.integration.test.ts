import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockObservePublicWeb, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockObservePublicWeb: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../capabilities/publicWebObservation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../capabilities/publicWebObservation.js')>();
  return { ...actual, observePublicWeb: mockObservePublicWeb };
});

import express from 'express';
import request from 'supertest';
import { PublicWebObservationError } from '../../../capabilities/publicWebObservation.js';
import { capabilitiesRouter } from '../capabilities.js';

function app() {
  const server = express();
  server.use(express.json());
  server.use('/capabilities', capabilitiesRouter);
  return server;
}

function allowFounder() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-1', email: 'founder@example.com' } },
    error: null,
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== 'founder_users') throw new Error(`Unexpected table: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { email: 'founder@example.com' },
            error: null,
          }),
        }),
      }),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('voice execution through the authenticated capability route', () => {
  it('executes one actual read-only provider adapter and proves only acceptance', async () => {
    allowFounder();
    mockObservePublicWeb.mockResolvedValue({
      provider: 'fcr-research-hub',
      providerAccepted: true,
      truthState: 'provider_observed_unverified',
      requestFingerprint: `sha256:${'a'.repeat(64)}`,
      resultCount: 1,
      continuity: {
        evidenceFingerprint: `sha256:${'b'.repeat(64)}`,
        proofCookie: 'fcr-public-web:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        transition: 'initial',
        authorityEffect: 'none',
      },
      data: { results: [{ url: 'https://example.org' }] },
    });

    const response = await request(app())
      .post('/capabilities/public-web-observation-v1/runs')
      .set('Authorization', 'Bearer test-token')
      .send({ operation: 'search', surface: 'voice', query: 'official source' });

    expect(response.status).toBe(200);
    expect(mockObservePublicWeb).toHaveBeenCalledTimes(1);
    expect(response.body.run.execution).toMatchObject({
      contract: 'fcr/shared-tool-call-attempt@v1',
      surface: 'voice',
      state: 'PROVIDER_ACCEPTED',
      providerCallReturned: true,
      verifiedOutcome: false,
    });
    expect(response.body.run.sharedRuntime.completionClaim.allowed).toBe(false);
    expect(response.body.run.presentation.channel).toBe('speech_and_text');
  });

  it('describes unavailable tools aloud without pretending to execute', async () => {
    allowFounder();
    mockObservePublicWeb.mockRejectedValue(
      new PublicWebObservationError('public_web_unavailable', 'No governed search adapter is available.'),
    );

    const response = await request(app())
      .post('/capabilities/public-web-observation-v1/runs')
      .set('Authorization', 'Bearer test-token')
      .send({ operation: 'search', surface: 'voice', query: 'official source' });

    expect(response.status).toBe(503);
    expect(mockObservePublicWeb).toHaveBeenCalledTimes(1);
    expect(response.body.execution.state).toBe('NOT_STARTED');
    expect(response.body.execution.retryAuthorized).toBe(false);
    expect(response.body.presentation.summary).toContain('not callable');
    expect(response.body.run).toBeUndefined();
  });

  it('holds ambiguous provider attempts for reconciliation instead of retrying', async () => {
    allowFounder();
    mockObservePublicWeb.mockRejectedValue(
      new PublicWebObservationError('public_web_upstream_failure', 'Governed observation failed.'),
    );

    const response = await request(app())
      .post('/capabilities/public-web-observation-v1/runs')
      .set('Authorization', 'Bearer test-token')
      .send({ operation: 'search', surface: 'voice', query: 'official source' });

    expect(response.status).toBe(502);
    expect(response.body.execution.state).toBe('UNCONFIRMED');
    expect(response.body.execution.verifiedOutcome).toBe(false);
    expect(response.body.execution.retryAuthorized).toBe(false);
    expect(response.body.run).toBeUndefined();
  });

  it('cannot bypass founder authentication by asking through voice', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await request(app())
      .post('/capabilities/public-web-observation-v1/runs')
      .send({ operation: 'search', surface: 'voice', query: 'official source' });

    expect(response.status).toBe(401);
    expect(mockObservePublicWeb).not.toHaveBeenCalled();
  });
});
