import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock, observationUpsert, attestationInsert } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
  observationUpsert: vi.fn(),
  attestationInsert: vi.fn(),
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

function persistenceTables() {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderAllowlistBuilder();
    if (table === 'projects') return projectBuilder();
    if (table === 'founder_content_attestation_events') return { insert: attestationInsert };
    if (table === 'provider_observations') return { upsert: observationUpsert };
    throw new Error(`Unexpected table: ${table}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  observationUpsert.mockResolvedValue({ error: null });
  attestationInsert.mockResolvedValue({ error: null });
});

describe('FCR manual LinkedIn founder-content observations', () => {
  it('records immutable founder-attestation evidence before updating the latest non-authorizing view', async () => {
    authorizeFounder();
    persistenceTables();

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
      sourceEventId: expect.stringMatching(/^fcae:/),
      persistence: 'recorded',
      publicationTruth: 'USER_ATTESTED',
      providerVerified: false,
      metricsState: 'UNKNOWN',
      authorityGranted: false,
    }));

    expect(attestationInsert).toHaveBeenCalledTimes(1);
    const eventRow = attestationInsert.mock.calls[0][0];
    expect(eventRow).toEqual(expect.objectContaining({
      event_id: res.body.sourceEventId,
      project_id: 'project-1',
      founder_user_id: 'u1',
      provider: 'linkedin',
      resource_type: 'founder_content_post',
      resource_id: LINKEDIN_URN,
      observed_state: expect.objectContaining({
        publication: {
          state: 'USER_ATTESTED',
          providerVerified: false,
          publishedAt: '2026-08-28T03:00:00.000Z',
        },
      }),
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
      attestation_event_id: res.body.sourceEventId,
      observed_state: expect.objectContaining({
        kind: 'fcr/founder-content-provider-observation@v1',
        platform: 'linkedin',
        postUrn: LINKEDIN_URN,
        permalink: LINKEDIN_URL,
        metrics: { state: 'UNKNOWN' },
        contentHash: 'a'.repeat(64),
        source: 'manual_founder_attestation',
        attestation: expect.objectContaining({
          founderUserId: 'u1',
          observedAt: expect.any(String),
        }),
        authority: {
          publication: false,
          analyticsClaim: false,
          externalMutation: false,
        },
      }),
    }));
    expect(row.source_event_id).toBeNull();
    expect(JSON.stringify(row)).not.toContain('999999');
    expect(JSON.stringify(row)).not.toContain(FOUNDER_EMAIL);
  });

  it('preserves a distinct immutable event when the same LinkedIn post is corrected later', async () => {
    authorizeFounder();
    persistenceTables();

    const first = await request(buildApp())
      .post('/capabilities/founder-content/linkedin-observations')
      .set('Authorization', BEARER)
      .send({
        projectSlug: 'founder-control-room',
        post: LINKEDIN_URL,
        publicationAttested: true,
        publishedAt: '2026-08-28T03:00:00.000Z',
        contentHash: 'a'.repeat(64),
      });
    const corrected = await request(buildApp())
      .post('/capabilities/founder-content/linkedin-observations')
      .set('Authorization', BEARER)
      .send({
        projectSlug: 'founder-control-room',
        post: LINKEDIN_URL,
        publicationAttested: true,
        publishedAt: '2026-08-28T03:05:00.000Z',
        contentHash: 'b'.repeat(64),
      });

    expect(first.status).toBe(200);
    expect(corrected.status).toBe(200);
    expect(first.body.sourceEventId).not.toBe(corrected.body.sourceEventId);
    expect(attestationInsert).toHaveBeenCalledTimes(2);
    expect(observationUpsert).toHaveBeenCalledTimes(2);
    expect(attestationInsert.mock.calls[0][0].observed_state.contentHash).toBe('a'.repeat(64));
    expect(attestationInsert.mock.calls[1][0].observed_state.contentHash).toBe('b'.repeat(64));
    expect(observationUpsert.mock.calls[1][0].attestation_event_id).toBe(corrected.body.sourceEventId);
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
    expect(attestationInsert).not.toHaveBeenCalled();
    expect(observationUpsert).not.toHaveBeenCalled();
  });

  it('rejects non-RFC3339 and impossible calendar publication timestamps', async () => {
    authorizeFounder();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'founder_users') return founderAllowlistBuilder();
      throw new Error(`Unexpected table: ${table}`);
    });

    for (const publishedAt of [
      '08/09/2026',
      '2026-08-28T03:00:00',
      '2026-02-30T12:00:00Z',
      '2025-02-29T12:00:00+00:00',
      '2026-13-01T12:00:00Z',
      '2026-08-28T24:00:00Z',
    ]) {
      const res = await request(buildApp())
        .post('/capabilities/founder-content/linkedin-observations')
        .set('Authorization', BEARER)
        .send({
          projectSlug: 'founder-control-room',
          post: LINKEDIN_URL,
          publicationAttested: true,
          publishedAt,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('RFC3339');
    }
    expect(attestationInsert).not.toHaveBeenCalled();
    expect(observationUpsert).not.toHaveBeenCalled();
  });

  it('rejects materially future-dated publication attestations', async () => {
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
        post: LINKEDIN_URL,
        publicationAttested: true,
        publishedAt: '2099-01-01T00:00:00.000Z',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('future-dated');
    expect(attestationInsert).not.toHaveBeenCalled();
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
    expect(attestationInsert).not.toHaveBeenCalled();
    expect(observationUpsert).not.toHaveBeenCalled();
  });

  it('reads the exact FCR observation by canonical LinkedIn identity', async () => {
    authorizeFounder();
    const stored = {
      provider: 'linkedin',
      resource_type: 'founder_content_post',
      resource_id: LINKEDIN_URN,
      source_event_id: null,
      attestation_event_id: 'fcae:stored-event',
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
