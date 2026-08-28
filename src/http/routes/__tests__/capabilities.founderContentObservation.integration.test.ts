import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock, observationUpsert } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  observationUpsert: vi.fn(),
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
const LINKEDIN_URN = 'urn:li:share:1234567890';
const LINKEDIN_URL = `https://www.linkedin.com/feed/update/${LINKEDIN_URN}/`;

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

function projectBuilder() {
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

function observationReadBuilder(data: Record<string, unknown> | null) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data, error: null }),
            }),
          }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  observationUpsert.mockResolvedValue({ error: null });
});

describe('FCR manual LinkedIn founder-content observations', () => {
  it('records external publication as user-attested while refusing provider or metric authority', async () => {
    authorizeFounder();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      if (table === 'projects') return projectBuilder();
      if (table === 'provider_observations') return { upsert: observationUpsert };
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .post('/capabilities/founder-content/linkedin-observations')
      .set('Authorization', BEARER)
      .send({
        projectSlug: 'founder-control-room',
        post: LINKEDIN_URL,
        publicationAttested: true,
        publishedAt: '2026-08-28T03:00:00.000Z',
        contentHash: 'a'.repeat(64),
        providerVerified: true,
        metrics: { impressions: 999999, comments: 999999 },
      });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual(expect.objectContaining({
      persistence: 'recorded',
      publicationTruth: 'USER_ATTESTED',
      providerVerified: false,
      metricsState: 'UNKNOWN',
      authorityGranted: false,
    }));

    expect(observationUpsert).toHaveBeenCalledTimes(1);
    const [row, options] = observationUpsert.mock.calls[0];
    expect(options).toEqual({ onConflict: 'project_id,provider,resource_type,resource_id' });
    expect(row).toEqual(expect.objectContaining({
      project_id: 'project-1',
      provider: 'linkedin',
      resource_type: 'founder_content_post',
      resource_id: LINKEDIN_URN,
      source_event_id: null,
      observed_state: expect.objectContaining({
        kind: 'fcr/founder-content-provider-observation@v1',
        platform: 'linkedin',
        postUrn: LINKEDIN_URN,
        permalink: LINKEDIN_URL,
        publication: {
          state: 'USER_ATTESTED',
          providerVerified: false,
          publishedAt: '2026-08-28T03:00:00.000Z',
        },
        metrics: { state: 'UNKNOWN' },
        contentHash: 'a'.repeat(64),
        source: 'manual_founder_attestation',
        authority: {
          publication: false,
          analyticsClaim: false,
          externalMutation: false,
        },
      }),
    }));
    expect(JSON.stringify(row)).not.toContain('999999');
  });

  it('requires an explicit founder publication attestation and never persists an unasserted post', async () => {
    authorizeFounder();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .post('/capabilities/founder-content/linkedin-observations')
      .set('Authorization', BEARER)
      .send({ projectSlug: 'founder-control-room', post: LINKEDIN_URL });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('publicationAttested=true');
    expect(observationUpsert).not.toHaveBeenCalled();
  });

  it('rejects non-LinkedIn identities instead of accepting generic URLs as provider proof', async () => {
    authorizeFounder();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .post('/capabilities/founder-content/linkedin-observations')
      .set('Authorization', BEARER)
      .send({
        projectSlug: 'founder-control-room',
        post: 'https://example.com/feed/update/urn:li:share:1234567890/',
        publicationAttested: true,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('exact LinkedIn post URN');
    expect(observationUpsert).not.toHaveBeenCalled();
  });

  it('reads the exact FCR observation by canonical LinkedIn identity', async () => {
    authorizeFounder();
    const stored = {
      provider: 'linkedin',
      resource_type: 'founder_content_post',
      resource_id: LINKEDIN_URN,
      observed_state: {
        kind: 'fcr/founder-content-provider-observation@v1',
        publication: { state: 'USER_ATTESTED', providerVerified: false },
        metrics: { state: 'UNKNOWN' },
      },
      observed_at: '2026-08-28T03:30:00.000Z',
    };
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      if (table === 'projects') return projectBuilder();
      if (table === 'provider_observations') return observationReadBuilder(stored);
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await request(buildApp())
      .get('/capabilities/founder-content/linkedin-observations')
      .query({ projectSlug: 'founder-control-room', post: LINKEDIN_URN })
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.observation).toEqual(stored);
  });
});
