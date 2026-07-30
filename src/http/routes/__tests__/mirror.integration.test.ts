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
import { MirrorProviderError } from '../../../mirror/openaiClient.js';
import type { MirrorModelResult } from '../../../mirror/types.js';
import { createMirrorRouter, type MirrorRouteDependencies } from '../mirror.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function modelResult(overrides: Partial<MirrorModelResult['output']> = {}): MirrorModelResult {
  return {
    output: {
      headline: 'I’m building my machines, not carrying everybody else',
      summary: 'I need my time aimed at the builds and people that move my life forward. The noise is expensive, and I’m done letting it run the day.',
      intentTags: ['money', 'build'],
      actionText: 'Reply to the strongest investor lead with one proof-backed sentence.',
      script: 'I shipped the proof path and can show you the exact build receipt.',
      timeEstimateMinutes: 7,
      goal: 'money',
      confidence: 0.82,
      toneGuardedScript: 'I shipped the proof path and can show you the exact build receipt.',
      containsExternalFactualClaims: true,
      factualClaims: ['The proof path shipped.'],
      ...overrides,
    },
    provenance: {
      provider: 'openai',
      model: 'test-model',
      responseId: 'resp_test_123',
      promptVersion: 'mirror-engine-test',
      storedByProvider: false,
    },
  };
}

function validPayload() {
  return {
    transcript: 'I need to stop pouring into everybody else and move my own machine.',
    relatedMemories: ['Founder Control Room is the command layer.'],
    timeEnergyContext: 'Tired, interrupted, about 10 minutes available.',
    recipientContext: 'Potential investor on LinkedIn.',
    voiceProfile: 'Direct, short, Philly founder voice. Keep “machine” and “bip” when natural.',
  };
}

function buildApp(overrides: MirrorRouteDependencies = {}) {
  const app = express();
  app.use(express.json());
  app.use('/mirror', createMirrorRouter({
    runMirror: vi.fn(async () => modelResult()),
    resolveProjectId: vi.fn(async () => 'project-1'),
    writeAuditEvent: vi.fn(async () => undefined),
    ...overrides,
  }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    return {};
  });
});

describe('POST /mirror/run', () => {
  it('rejects requests without a founder session before calling the model', async () => {
    const runMirror = vi.fn(async () => modelResult());
    const response = await request(buildApp({ runMirror }))
      .post('/mirror/run')
      .send(validPayload());

    expect(response.status).toBe(401);
    expect(runMirror).not.toHaveBeenCalled();
  });

  it('rejects malformed bounded input before calling the model', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });
    const runMirror = vi.fn(async () => modelResult());

    const response = await request(buildApp({ runMirror }))
      .post('/mirror/run')
      .set('Authorization', BEARER)
      .send({ ...validPayload(), transcript: '', relatedMemories: [''] });

    expect(response.status).toBe(400);
    expect(runMirror).not.toHaveBeenCalled();
  });

  it('returns one draft-only move and persists sanitized provenance', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });
    const writeAuditEvent = vi.fn(async () => undefined);
    const runMirror = vi.fn(async () => modelResult());

    const response = await request(buildApp({ runMirror, writeAuditEvent }))
      .post('/mirror/run')
      .set('Authorization', BEARER)
      .send(validPayload());

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      version: 'mirror-engine-v1',
      intentTags: ['money', 'build'],
      timeEstimateMinutes: 7,
      goal: 'money',
      distribution: {
        mode: 'draft_only',
        factCheckStatus: 'required_before_external_use',
        externalActionAllowed: false,
      },
      provenance: {
        provider: 'openai',
        model: 'test-model',
        responseId: 'resp_test_123',
        storedByProvider: false,
      },
    });
    expect(runMirror).toHaveBeenCalledWith(validPayload());
    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
    const audit = writeAuditEvent.mock.calls[0]?.[0];
    expect(audit).toMatchObject({
      projectId: 'project-1',
      founderUserId: 'founder-user-1',
      eventType: 'mirror_engine_completed',
      severity: 'info',
      metadata: {
        stage: 'completed',
        related_memory_count: 1,
        intent_tags: ['money', 'build'],
        fact_claim_count: 1,
        distribution_mode: 'draft_only',
      },
    });
    expect(JSON.stringify(audit)).not.toContain(validPayload().transcript);
    expect(JSON.stringify(audit)).not.toContain(validPayload().relatedMemories[0]);
  });

  it('records a sanitized provider failure and returns no draft', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });
    const writeAuditEvent = vi.fn(async () => undefined);
    const runMirror = vi.fn(async () => {
      throw new MirrorProviderError('provider detail must not leak', 'OPENAI_HTTP_ERROR', 429);
    });

    const response = await request(buildApp({ runMirror, writeAuditEvent }))
      .post('/mirror/run')
      .set('Authorization', BEARER)
      .send(validPayload());

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: 'Mirror Engine model provider failed',
      code: 'OPENAI_HTTP_ERROR',
    });
    expect(JSON.stringify(response.body)).not.toContain('provider detail');
    expect(writeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'mirror_engine_failed',
      severity: 'error',
      metadata: expect.objectContaining({ error_code: 'OPENAI_HTTP_ERROR' }),
    }));
  });

  it('fails closed when the completion audit cannot persist', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
      error: null,
    });
    const writeAuditEvent = vi.fn(async () => {
      throw new Error('audit unavailable');
    });

    const response = await request(buildApp({ writeAuditEvent }))
      .post('/mirror/run')
      .set('Authorization', BEARER)
      .send(validPayload());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Mirror Engine audit persistence failed',
      code: 'AUDIT_PERSISTENCE_FAILED',
    });
    expect(JSON.stringify(response.body)).not.toContain('I’m building');
  });
});