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
import type { FriendRuntimeResult } from '../../../mirror/friendRuntime.js';
import {
  createFriendIntakeRouter,
  redactFriendSummary,
  type FriendIntakeRouteDependencies,
} from '../friendIntake.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

type TimelineEventArg = Parameters<NonNullable<FriendIntakeRouteDependencies['writeTimelineEvent']>>[0];
type CompletionArg = Parameters<NonNullable<FriendIntakeRouteDependencies['writeCompletion']>>[0];
type FeedbackArg = Parameters<NonNullable<FriendIntakeRouteDependencies['writeFeedback']>>[0];
type ReservationArg = Parameters<NonNullable<FriendIntakeRouteDependencies['reserveLiveInference']>>[0];

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function runtimeResult(provider: 'deterministic' | 'openai' | 'anthropic' | 'perplexity' = 'deterministic'): FriendRuntimeResult {
  const live = provider !== 'deterministic';
  return {
    mirror: {
      headline: 'One move, not ten',
      summary: 'The founder wants one bounded build step and a truthful receipt.',
    },
    tags: ['build'],
    move: {
      kind: 'tiny_move',
      text: 'Run the focused proof and record the result.',
      rationale: 'One bounded proof reduces uncertainty.',
      timeEstimateMinutes: 10,
      gateWarning: 'No external action is authorized.',
    },
    provenance: {
      provider,
      model: live ? `test-${provider}` : 'friend-deterministic-v1',
      responseId: live ? `resp-${provider}` : null,
      promptVersion: 'friend-test',
      providerStorageMode: provider === 'openai'
        ? 'disabled_request'
        : live
          ? 'provider_default'
          : 'local_only',
      webSearchUsed: false,
    },
    modelExecutionState: live ? 'succeeded' : 'not_used',
  };
}

function validPayload() {
  return {
    transcript: 'I need to move the build with one focused proof.',
    privacyChoice: 'process_without_saving',
    provider: 'deterministic',
    timeEnergyContext: 'Ten minutes.',
    voiceProfile: 'Direct and short.',
  };
}

function buildApp(overrides: FriendIntakeRouteDependencies = {}) {
  const app = express();
  app.use(express.json());
  app.use('/mirror/friend-intake', createFriendIntakeRouter({
    runFriendRuntime: vi.fn(async (provider) => runtimeResult(provider)),
    resolveProjectId: vi.fn(async () => 'project-1'),
    resolveCompletedRunFounderId: vi.fn(async () => 'founder-user-1'),
    writeTimelineEvent: vi.fn(async (_event: TimelineEventArg) => 'timeline-failure-1'),
    writeCompletion: vi.fn(async (_record: CompletionArg) => 'timeline-1'),
    writeFeedback: vi.fn(async (_record: FeedbackArg) => undefined),
    reserveLiveInference: vi.fn(async (_record: ReservationArg) => 'reservation-1'),
    resolveLiveInferenceBudget: () => ({ requestUsd: 0.25, dailyUsd: 1 }),
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

function authenticate() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
    error: null,
  });
}

describe('POST /mirror/friend-intake', () => {
  it('rejects unauthenticated access before runtime execution', async () => {
    const runFriendRuntime = vi.fn(async () => runtimeResult());
    const response = await request(buildApp({ runFriendRuntime }))
      .post('/mirror/friend-intake')
      .send(validPayload());

    expect(response.status).toBe(401);
    expect(runFriendRuntime).not.toHaveBeenCalled();
  });

  it('rejects related-memory input instead of silently retrieving memory', async () => {
    authenticate();
    const runFriendRuntime = vi.fn(async () => runtimeResult());

    const response = await request(buildApp({ runFriendRuntime }))
      .post('/mirror/friend-intake')
      .set('Authorization', BEARER)
      .send({ ...validPayload(), relatedMemories: ['should not enter Friend'] });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('FRIEND_MEMORY_RETRIEVAL_NOT_ALLOWED');
    expect(runFriendRuntime).not.toHaveBeenCalled();
  });

  it('processes without saving founder content or content-derived semantic metadata', async () => {
    authenticate();
    const writeCompletion = vi.fn(async (_record: CompletionArg) => 'timeline-1');
    const runFriendRuntime = vi.fn(async () => runtimeResult('deterministic'));

    const response = await request(buildApp({ runFriendRuntime, writeCompletion }))
      .post('/mirror/friend-intake')
      .set('Authorization', BEARER)
      .send(validPayload());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      privacyChoice: 'process_without_saving',
      inputPersistence: 'none',
      runtimeProvider: 'deterministic',
      modelExecutionState: 'not_used',
      timelineEventId: 'timeline-1',
      intentTags: ['build'],
      move: { kind: 'tiny_move' },
    });
    expect(writeCompletion).toHaveBeenCalledTimes(1);

    const completion = writeCompletion.mock.calls[0]?.[0];
    expect(completion?.summary).toBeNull();
    const serialized = JSON.stringify(completion?.timelineEvent);
    expect(serialized).not.toContain(validPayload().transcript);
    expect(serialized).not.toContain(runtimeResult().mirror.summary);
    expect(serialized).not.toContain(runtimeResult().move.text);
    expect(serialized).not.toContain('intent_tags');
    expect(serialized).not.toContain('sensitive_categories');
    expect(serialized).not.toContain('input_length');
  });

  it('requires an interactive founder request before non-sensitive live inference', async () => {
    authenticate();
    const runFriendRuntime = vi.fn(async () => runtimeResult('openai'));
    const reserveLiveInference = vi.fn(async (_record: ReservationArg) => 'reservation-1');

    const response = await request(buildApp({ runFriendRuntime, reserveLiveInference }))
      .post('/mirror/friend-intake')
      .set('Authorization', BEARER)
      .send({ ...validPayload(), provider: 'openai' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('FRIEND_INTERACTIVE_FOUNDER_REQUIRED');
    expect(reserveLiveInference).not.toHaveBeenCalled();
    expect(runFriendRuntime).not.toHaveBeenCalled();
  });

  it('reserves bounded budget before one live provider call', async () => {
    authenticate();
    const order: string[] = [];
    const reserveLiveInference = vi.fn(async (record: ReservationArg) => {
      order.push('reserve');
      expect(record).toMatchObject({
        founderUserId: 'founder-user-1',
        provider: 'openai',
        reservedBudgetUsd: 0.25,
        dailyBudgetUsd: 1,
      });
      return 'reservation-live-1';
    });
    const runFriendRuntime = vi.fn(async () => {
      order.push('provider');
      return runtimeResult('openai');
    });

    const response = await request(buildApp({
      isInteractiveFounderRequest: () => true,
      reserveLiveInference,
      runFriendRuntime,
    }))
      .post('/mirror/friend-intake')
      .set('Authorization', BEARER)
      .send({ ...validPayload(), provider: 'openai' });

    expect(response.status).toBe(200);
    expect(order).toEqual(['reserve', 'provider']);
    expect(response.body.provenance.inferenceReservationId).toBe('reservation-live-1');
  });

  it('fails closed before provider execution when the live budget is unavailable or exhausted', async () => {
    authenticate();
    const runFriendRuntime = vi.fn(async () => runtimeResult('openai'));

    const notConfigured = await request(buildApp({
      isInteractiveFounderRequest: () => true,
      resolveLiveInferenceBudget: () => null,
      runFriendRuntime,
    }))
      .post('/mirror/friend-intake')
      .set('Authorization', BEARER)
      .send({ ...validPayload(), provider: 'openai' });

    expect(notConfigured.status).toBe(503);
    expect(notConfigured.body.code).toBe('FRIEND_LIVE_BUDGET_NOT_CONFIGURED');
    expect(runFriendRuntime).not.toHaveBeenCalled();

    const exhausted = await request(buildApp({
      isInteractiveFounderRequest: () => true,
      reserveLiveInference: vi.fn(async () => {
        throw new Error('FRIEND_INFERENCE_DAILY_BUDGET_EXCEEDED');
      }),
      runFriendRuntime,
    }))
      .post('/mirror/friend-intake')
      .set('Authorization', BEARER)
      .send({ ...validPayload(), provider: 'openai' });

    expect(exhausted.status).toBe(429);
    expect(exhausted.body.code).toBe('FRIEND_LIVE_DAILY_BUDGET_EXCEEDED');
    expect(runFriendRuntime).not.toHaveBeenCalled();
  });

  it('passes only redacted founder content, not semantic tags, into opt-in persistence', async () => {
    authenticate();
    const writeCompletion = vi.fn(async (_record: CompletionArg) => 'timeline-1');
    const result = runtimeResult('deterministic');
    result.mirror.summary = 'Email me at founder@example.com and use password:supersecret for the demo.';
    result.tags = ['health', 'kids'];
    const runFriendRuntime = vi.fn(async () => result);

    const response = await request(buildApp({ runFriendRuntime, writeCompletion }))
      .post('/mirror/friend-intake')
      .set('Authorization', BEARER)
      .send({
        ...validPayload(),
        privacyChoice: 'save_redacted_summary',
      });

    expect(response.status).toBe(200);
    expect(response.body.inputPersistence).toBe('redacted_summary_only');
    expect(writeCompletion).toHaveBeenCalledTimes(1);

    const completion = writeCompletion.mock.calls[0]?.[0];
    const saved = completion?.summary;
    expect(saved?.redactedSummary).toBe(
      'Email me at [redacted-email] and use password=[redacted] for the demo.',
    );
    expect(saved).not.toHaveProperty('intentTags');
    expect(JSON.stringify(saved)).not.toContain(validPayload().transcript);
    expect(JSON.stringify(saved)).not.toContain('supersecret');
    expect(JSON.stringify(completion?.timelineEvent.metadata)).not.toContain('intent_tags');
    expect(JSON.stringify(completion?.timelineEvent.metadata)).not.toContain('sensitive_categories');
  });

  it('records a sanitized failure event when atomic completion persistence fails', async () => {
    authenticate();
    const writeCompletion = vi.fn(async (_record: CompletionArg) => {
      throw new Error('atomic completion unavailable');
    });
    const writeTimelineEvent = vi.fn(async (_event: TimelineEventArg) => 'timeline-failure-1');

    const response = await request(buildApp({ writeCompletion, writeTimelineEvent }))
      .post('/mirror/friend-intake')
      .set('Authorization', BEARER)
      .send({
        ...validPayload(),
        privacyChoice: 'save_redacted_summary',
      });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('FRIEND_COMPLETION_PERSISTENCE_FAILED');
    expect(response.body.timelineEventId).toBeUndefined();
    expect(writeCompletion).toHaveBeenCalledTimes(1);
    expect(writeTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'friend_intake_failed',
      metadata: expect.objectContaining({
        stage: 'completion_persistence',
        error_code: 'FRIEND_COMPLETION_PERSISTENCE_FAILED',
      }),
    }));
    expect(JSON.stringify(writeTimelineEvent.mock.calls[0]?.[0])).not.toContain(validPayload().transcript);
  });

  it('keeps sensitive input local even when a live provider was requested', async () => {
    authenticate();
    const runFriendRuntime = vi.fn(async () => runtimeResult('perplexity'));

    const response = await request(buildApp({ runFriendRuntime }))
      .post('/mirror/friend-intake')
      .set('Authorization', BEARER)
      .send({
        ...validPayload(),
        provider: 'perplexity',
        transcript: 'I need to handle a password and a legal court issue involving my kid.',
      });

    expect(response.status).toBe(200);
    expect(runFriendRuntime).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      runtimeProvider: 'deterministic',
      modelExecutionState: 'not_used',
      move: { kind: 'protective_move' },
    });
  });

  it('keeps bare private identifiers and card-like numbers local before any provider call', async () => {
    authenticate();
    const runFriendRuntime = vi.fn(async () => runtimeResult('anthropic'));

    for (const transcript of [
      'customer@example.com 814-555-1212 ghp_abcdefghijk',
      '4111 1111 1111 1111',
    ]) {
      const response = await request(buildApp({ runFriendRuntime }))
        .post('/mirror/friend-intake')
        .set('Authorization', BEARER)
        .send({
          ...validPayload(),
          provider: 'anthropic',
          transcript,
        });

      expect(response.status).toBe(200);
      expect(response.body.runtimeProvider).toBe('deterministic');
      expect(response.body.move.kind).toBe('protective_move');
    }
    expect(runFriendRuntime).not.toHaveBeenCalled();
  });

  it('returns a bounded 400 for malformed JSON-body shapes', async () => {
    authenticate();
    const response = await request(buildApp())
      .post('/mirror/friend-intake')
      .set('Authorization', BEARER)
      .set('Content-Type', 'application/json')
      .send('null');

    expect(response.status).toBe(400);
  });

  it('never returns more than one move', async () => {
    authenticate();
    const response = await request(buildApp())
      .post('/mirror/friend-intake')
      .set('Authorization', BEARER)
      .send(validPayload());

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.move)).toBe(false);
    expect(response.body.move.kind).toBeTruthy();
  });
});

describe('POST /mirror/friend-intake/:runId/usefulness', () => {
  it('records exactly one bounded usefulness response for a completed run owned by the founder', async () => {
    authenticate();
    const writeFeedback = vi.fn(async (_record: FeedbackArg) => undefined);

    const response = await request(buildApp({ writeFeedback }))
      .post('/mirror/friend-intake/11111111-1111-4111-8111-111111111111/usefulness')
      .set('Authorization', BEARER)
      .send({ response: 'yes' });

    expect(response.status).toBe(200);
    expect(response.body.usefulness.response).toBe('yes');
    expect(writeFeedback).toHaveBeenCalledWith(expect.objectContaining({
      runId: '11111111-1111-4111-8111-111111111111',
      founderUserId: 'founder-user-1',
      response: 'yes',
    }));
  });

  it('rejects feedback when the completed run is absent or belongs to another founder', async () => {
    authenticate();
    const writeFeedback = vi.fn(async (_record: FeedbackArg) => undefined);

    const response = await request(buildApp({
      resolveCompletedRunFounderId: vi.fn(async () => 'other-founder'),
      writeFeedback,
    }))
      .post('/mirror/friend-intake/11111111-1111-4111-8111-111111111111/usefulness')
      .set('Authorization', BEARER)
      .send({ response: 'yes' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('FRIEND_COMPLETED_RUN_NOT_FOUND');
    expect(writeFeedback).not.toHaveBeenCalled();
  });

  it('returns a bounded 400 for malformed usefulness bodies', async () => {
    authenticate();
    const response = await request(buildApp())
      .post('/mirror/friend-intake/11111111-1111-4111-8111-111111111111/usefulness')
      .set('Authorization', BEARER)
      .set('Content-Type', 'application/json')
      .send('null');

    expect(response.status).toBe(400);
  });
});

describe('redactFriendSummary', () => {
  it('redacts common contact, credential, identity, and financial patterns', () => {
    expect(redactFriendSummary(
      'Reach founder@example.com, 814-555-1212, api_key=abcdef123456, SSN 123-45-6789, routing number 123456789.',
    )).toBe(
      'Reach [redacted-email], [redacted-phone], api_key=[redacted] SSN [redacted-id], [redacted-financial].',
    );
  });
});
