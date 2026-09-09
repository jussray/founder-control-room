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

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function runtimeResult(provider: 'deterministic' | 'openai' | 'anthropic' | 'perplexity' = 'openai'): FriendRuntimeResult {
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
    provider: 'openai',
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
    writeTimelineEvent: vi.fn(async (_event: TimelineEventArg) => 'timeline-failure-1'),
    writeCompletion: vi.fn(async (_record: CompletionArg) => 'timeline-1'),
    writeFeedback: vi.fn(async (_record: FeedbackArg) => undefined),
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

  it('processes without saving founder content and emits one sanitized atomic completion receipt', async () => {
    authenticate();
    const writeCompletion = vi.fn(async (_record: CompletionArg) => 'timeline-1');
    const runFriendRuntime = vi.fn(async () => runtimeResult('anthropic'));

    const response = await request(buildApp({
      runFriendRuntime,
      writeCompletion,
    }))
      .post('/mirror/friend-intake')
      .set('Authorization', BEARER)
      .send({ ...validPayload(), provider: 'anthropic' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      privacyChoice: 'process_without_saving',
      inputPersistence: 'none',
      runtimeProvider: 'anthropic',
      modelExecutionState: 'succeeded',
      timelineEventId: 'timeline-1',
      intentTags: ['build'],
      move: { kind: 'tiny_move' },
      provenance: {
        source: 'model_inference',
        provider: 'anthropic',
        webSearchUsed: false,
      },
    });
    expect(writeCompletion).toHaveBeenCalledTimes(1);

    const completion = writeCompletion.mock.calls[0]?.[0];
    expect(completion?.summary).toBeNull();
    const serialized = JSON.stringify(completion?.timelineEvent);
    expect(serialized).not.toContain(validPayload().transcript);
    expect(serialized).not.toContain(runtimeResult().mirror.summary);
    expect(serialized).not.toContain(runtimeResult().move.text);
  });

  it('passes only the redacted summary into the atomic completion when the founder opts in', async () => {
    authenticate();
    const writeCompletion = vi.fn(async (_record: CompletionArg) => 'timeline-1');
    const result = runtimeResult('openai');
    result.mirror.summary = 'Email me at founder@example.com and use password:supersecret for the demo.';
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

    const saved = writeCompletion.mock.calls[0]?.[0].summary;
    expect(saved?.redactedSummary).toBe(
      'Email me at [redacted-email] and use password=[redacted] for the demo.',
    );
    expect(JSON.stringify(saved)).not.toContain(validPayload().transcript);
    expect(JSON.stringify(saved)).not.toContain('supersecret');
  });

  it('does not return a success receipt when atomic completion persistence fails', async () => {
    authenticate();
    const writeCompletion = vi.fn(async (_record: CompletionArg) => {
      throw new Error('atomic completion unavailable');
    });

    const response = await request(buildApp({ writeCompletion }))
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
        transcript: 'I need to figure out a password and a legal court issue involving my kid.',
      });

    expect(response.status).toBe(200);
    expect(runFriendRuntime).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      runtimeProvider: 'deterministic',
      modelExecutionState: 'not_used',
      move: { kind: 'protective_move' },
      provenance: {
        source: 'deterministic',
        provider: 'deterministic',
        webSearchUsed: false,
      },
    });
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
  it('records exactly one bounded usefulness response without founder content', async () => {
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
    expect(JSON.stringify(writeFeedback.mock.calls[0]?.[0])).not.toContain('transcript');
  });
});

describe('redactFriendSummary', () => {
  it('redacts common contact and credential patterns', () => {
    expect(redactFriendSummary(
      'Reach me at founder@example.com, 814-555-1212, api_key=abcdef123456.',
    )).toBe(
      'Reach me at [redacted-email], [redacted-phone], api_key=[redacted]',
    );
  });
});
