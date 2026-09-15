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
const INTENT = '/ultrathink Decide the smallest safe shared-runtime change.';

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
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /capabilities/ultrathink-shared-reasoning-v1/runs', () => {
  it('requires current founder authentication', async () => {
    const res = await request(buildApp())
      .post('/capabilities/ultrathink-shared-reasoning-v1/runs')
      .send({ surface: 'text', intent: INTENT });

    expect(res.status).toBe(401);
  });

  it('resolves text then voice through one semantic continuity chain without enqueueing execution', async () => {
    authorizeFounder();

    const text = await request(buildApp())
      .post('/capabilities/ultrathink-shared-reasoning-v1/runs')
      .set('Authorization', BEARER)
      .send({ surface: 'text', intent: INTENT });

    expect(text.status).toBe(200);
    expect(text.headers['cache-control']).toBe('no-store');
    expect(text.body.run).toMatchObject({
      capabilityId: 'ultrathink-shared-reasoning-v1',
      state: 'completed',
      authority: 'reason_only',
      consequence: 'READ',
      mutationAllowed: false,
      providerExecution: false,
      sharedRuntime: {
        command: '/ultrathink',
        surface: 'text',
        state: 'RESOLVED',
        reasoning: {
          mode: 'reason_only',
          providerExecution: false,
          mutationAllowed: false,
        },
        continuity: { transition: 'initial', authorityEffect: 'none' },
        completionClaim: { allowed: false },
      },
      presentation: { surface: 'text', channel: 'text' },
    });

    const firstContinuity = text.body.run.sharedRuntime.continuity;
    const voice = await request(buildApp())
      .post('/capabilities/ultrathink-shared-reasoning-v1/runs')
      .set('Authorization', BEARER)
      .send({
        surface: 'voice',
        intent: INTENT,
        priorEvidenceFingerprint: firstContinuity.evidenceFingerprint,
        priorProofCookie: firstContinuity.proofCookie,
      });

    expect(voice.status).toBe(200);
    expect(voice.body.run.sharedRuntime.surface).toBe('voice');
    expect(voice.body.run.presentation.channel).toBe('speech_and_text');
    expect(voice.body.run.sharedRuntime.continuity.transition).toBe('confirmed');
    expect(voice.body.run.sharedRuntime.continuity.evidenceFingerprint)
      .toBe(firstContinuity.evidenceFingerprint);
    expect(voice.body.run.sharedRuntime.requestFingerprint)
      .not.toBe(text.body.run.sharedRuntime.requestFingerprint);
    expect(mockEnqueueReconcile).not.toHaveBeenCalled();
  });

  it('fails closed when /ultrathink is absent instead of treating arbitrary text as a runtime command', async () => {
    authorizeFounder();

    const res = await request(buildApp())
      .post('/capabilities/ultrathink-shared-reasoning-v1/runs')
      .set('Authorization', BEARER)
      .send({ surface: 'voice', intent: 'Please reason about this architecture.' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('shared_runtime_invalid_request');
    expect(mockEnqueueReconcile).not.toHaveBeenCalled();
  });
});
