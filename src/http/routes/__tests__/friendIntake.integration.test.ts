import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
  createSupabaseAuthClient: vi.fn(),
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import type { DeterministicFriendIntakeResult } from '../../../chief/firstSliceEngine.js';
import {
  createFriendIntakeRouter,
  type FriendIntakeRouteDependencies,
} from '../friendIntake.js';

const FOUNDER_EMAIL = 'founder@example.com';
const FOUNDER_ID = '00000000-0000-4000-8000-000000000111';
const OTHER_FOUNDER_ID = '00000000-0000-4000-8000-000000000222';
const BEARER = 'Bearer test-token';
const PROJECT_ID = '00000000-0000-4000-8000-000000000333';
const RUN_ID = '00000000-0000-4000-8000-000000000444';
const REVIEW_KEY = Buffer.alloc(32, 7).toString('base64url');
type PersistRunInput = Parameters<NonNullable<FriendIntakeRouteDependencies['persistRun']>>[0];
type RecordUsefulnessInput = Parameters<NonNullable<FriendIntakeRouteDependencies['recordUsefulness']>>[0];

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function authenticateFounder() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: FOUNDER_ID, email: FOUNDER_EMAIL } },
    error: null,
  });
}

function buildApp(overrides: FriendIntakeRouteDependencies = {}) {
  const app = express();
  app.use(express.json());
  app.use('/friend-intake', createFriendIntakeRouter({
    enabled: () => true,
    resolveProjectId: vi.fn(async () => PROJECT_ID),
    persistRun: vi.fn(async () => undefined),
    recordUsefulness: vi.fn(async () => undefined),
    ...overrides,
  }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FOUNDER_SESSION_ENCRYPTION_KEY = REVIEW_KEY;
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return founderUsersRow();
    return {};
  });
});

describe('Friend Intake route', () => {
  it('rejects an unauthenticated run before engine persistence', async () => {
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);
    const response = await request(buildApp({ persistRun }))
      .post('/friend-intake/run')
      .send({ rawText: 'Finish the build.', privacyChoice: 'process_without_saving' });

    expect(response.status).toBe(401);
    expect(persistRun).not.toHaveBeenCalled();
  });

  it('uses the authenticated founder identity and stores no intake content for process_without_saving', async () => {
    authenticateFounder();
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);
    const rawText = 'Finish the product build and choose the next launch step.';

    const response = await request(buildApp({ persistRun }))
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({
        rawText,
        privacyChoice: 'process_without_saving',
        founderId: OTHER_FOUNDER_ID,
        sensitiveDetected: false,
      });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.receipt).toMatchObject({
      privacyChoice: 'process_without_saving',
      inputPersistence: 'none',
      modelExecutionState: 'blocked',
      provenance: {
        kind: 'deterministic_rule_engine',
        externalModelCalled: false,
        relatedMemoryUsed: false,
      },
    });
    expect(response.body.receipt.intakeId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(persistRun).toHaveBeenCalledTimes(1);
    const persisted = persistRun.mock.calls[0]?.[0];
    expect(persisted).toMatchObject({
      founderId: FOUNDER_ID,
      projectId: PROJECT_ID,
      privacyChoice: 'process_without_saving',
      redactedSummary: null,
      sensitiveCategories: [],
      sensitiveSaveReviewed: false,
      intentTagIds: [],
      modelExecutionState: 'blocked',
    });
    expect(JSON.stringify(persisted)).not.toContain(rawText);
    expect(JSON.stringify(persisted)).not.toContain('sensitiveDetected');
    expect(JSON.stringify(persisted)).not.toContain(OTHER_FOUNDER_ID);
  });

  it('classifies sensitive input server-side without persisting the derived labels in unsaved mode', async () => {
    authenticateFounder();
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);

    const response = await request(buildApp({ persistRun }))
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({
        rawText: 'My child is involved in a custody issue.',
        privacyChoice: 'process_without_saving',
        sensitiveDetected: false,
      });

    expect(response.status).toBe(200);
    expect(response.body.receipt.move.kind).toBe('protective_move');
    expect(response.body.receipt.move.kind).not.toBe('tiny_move');
    expect(persistRun).toHaveBeenCalledTimes(1);
    expect(persistRun.mock.calls[0]?.[0]).toMatchObject({
      privacyChoice: 'process_without_saving',
      redactedSummary: null,
      sensitiveCategories: [],
      sensitiveSaveReviewed: false,
      intentTagIds: [],
    });
  });

  it('persists only a bounded category-level summary for a non-sensitive saved intake', async () => {
    authenticateFounder();
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);
    const rawText = 'Email founder@example.com about the product build plan.';

    const response = await request(buildApp({ persistRun }))
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({ rawText, privacyChoice: 'save_redacted_summary' });

    expect(response.status).toBe(200);
    const persisted = persistRun.mock.calls[0]?.[0];
    expect(persisted?.privacyChoice).toBe('save_redacted_summary');
    expect(persisted?.redactedSummary).toBeTruthy();
    expect(persisted?.redactedSummary?.length).toBeLessThanOrEqual(300);
    expect(persisted?.redactedSummary).not.toContain('founder@example.com');
    expect(persisted?.intentTagIds).toContain('build');
    expect(persisted?.sensitiveSaveReviewed).toBe(false);
    expect(JSON.stringify(persisted)).not.toContain(rawText);
  });

  it('requires a server-issued review receipt before persisting a sensitive redacted summary', async () => {
    authenticateFounder();
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);
    const rawText = 'My child is involved in a custody issue.';
    const app = buildApp({ persistRun });

    const forgedConfirmation = await request(app)
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({
        rawText,
        privacyChoice: 'save_redacted_summary',
        sensitiveSaveConfirmed: true,
      });

    expect(forgedConfirmation.status).toBe(409);
    expect(forgedConfirmation.body.code).toBe('SENSITIVE_SAVE_REVIEW_REQUIRED');
    expect(persistRun).not.toHaveBeenCalled();

    const agent = request.agent(app);
    const reviewResponse = await agent
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({
        rawText,
        privacyChoice: 'save_redacted_summary',
        sensitiveDetected: false,
      });

    expect(reviewResponse.status).toBe(409);
    expect(reviewResponse.headers['cache-control']).toBe('no-store');
    expect(reviewResponse.headers['set-cookie']?.join(';')).toContain('HttpOnly');
    expect(reviewResponse.headers['set-cookie']?.join(';')).toContain('SameSite=Strict');
    expect(reviewResponse.body).toMatchObject({
      code: 'SENSITIVE_SAVE_REVIEW_REQUIRED',
      review: {
        inputPersistence: 'none',
        externalModelCalled: false,
        reviewReceiptIssued: true,
      },
    });
    expect(reviewResponse.body.review.redactedSummary).toBeTruthy();
    expect(JSON.stringify(reviewResponse.body)).not.toContain(rawText);
    expect(persistRun).not.toHaveBeenCalled();

    const confirmedResponse = await agent
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({
        rawText,
        privacyChoice: 'save_redacted_summary',
        sensitiveSaveConfirmed: true,
      });

    expect(confirmedResponse.status).toBe(200);
    expect(persistRun).toHaveBeenCalledTimes(1);
    const persisted = persistRun.mock.calls[0]?.[0];
    expect(persisted).toMatchObject({
      founderId: FOUNDER_ID,
      privacyChoice: 'save_redacted_summary',
      sensitiveSaveReviewed: true,
      modelExecutionState: 'blocked',
    });
    expect(persisted?.sensitiveCategories).toEqual(expect.arrayContaining(['teen', 'legal']));
    expect(persisted?.redactedSummary).toBeTruthy();
    expect(JSON.stringify(persisted)).not.toContain(rawText);
  });

  it('binds the sensitive review receipt to the exact reviewed input', async () => {
    authenticateFounder();
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);
    const app = buildApp({ persistRun });
    const agent = request.agent(app);

    const firstText = 'My child is involved in a custody issue.';
    const changedText = 'My child is involved in a different legal issue.';

    const reviewResponse = await agent
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({ rawText: firstText, privacyChoice: 'save_redacted_summary' });
    expect(reviewResponse.status).toBe(409);

    const changedConfirmation = await agent
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({
        rawText: changedText,
        privacyChoice: 'save_redacted_summary',
        sensitiveSaveConfirmed: true,
      });

    expect(changedConfirmation.status).toBe(409);
    expect(changedConfirmation.body.code).toBe('SENSITIVE_SAVE_REVIEW_REQUIRED');
    expect(persistRun).not.toHaveBeenCalled();
  });

  it('cancels without resolving a project or writing any receipt', async () => {
    authenticateFounder();
    const resolveProjectId = vi.fn(async () => PROJECT_ID);
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);

    const response = await request(buildApp({ resolveProjectId, persistRun }))
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({ rawText: 'Do not process this.', privacyChoice: 'cancel' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'cancelled',
      privacyChoice: 'cancel',
      inputPersistence: 'none',
      timelineEventId: null,
    });
    expect(resolveProjectId).not.toHaveBeenCalled();
    expect(persistRun).not.toHaveBeenCalled();
  });

  it('fails closed when an engine result violates the canonical tiny-move duration', async () => {
    authenticateFounder();
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);
    const invalidResult: DeterministicFriendIntakeResult = {
      mirror: { headline: 'h', summary: 's' },
      intentTags: ['general'],
      sensitiveCategories: [],
      redactedSummary: null,
      move: {
        kind: 'tiny_move',
        text: 'Too long.',
        timeEstimateMinutes: 20,
        gateWarning: null,
        policy: 'tiny',
      },
    };

    const response = await request(buildApp({
      persistRun,
      runEngine: () => invalidResult,
    }))
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({ rawText: 'Finish the build.', privacyChoice: 'process_without_saving' });

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('invalid_tiny_move_duration');
    expect(persistRun).not.toHaveBeenCalled();
  });

  it('records usefulness for an unsaved run using only founder-scoped telemetry', async () => {
    authenticateFounder();
    const recordUsefulness = vi.fn(async (_input: RecordUsefulnessInput) => undefined);

    const response = await request(buildApp({ recordUsefulness }))
      .post('/friend-intake/usefulness')
      .set('Authorization', BEARER)
      .send({ runId: RUN_ID, response: 'yes', founderId: OTHER_FOUNDER_ID });

    expect(response.status).toBe(200);
    expect(recordUsefulness).toHaveBeenCalledWith(expect.objectContaining({
      runId: RUN_ID,
      founderId: FOUNDER_ID,
      projectId: PROJECT_ID,
      response: 'yes',
    }));
    expect(JSON.stringify(recordUsefulness.mock.calls[0]?.[0])).not.toContain(OTHER_FOUNDER_ID);
  });

  it('returns 404 when usefulness targets a run not owned by the authenticated founder', async () => {
    authenticateFounder();
    const recordUsefulness = vi.fn(async (_input: RecordUsefulnessInput) => {
      throw new Error('FRIEND_INTAKE_USEFULNESS_FAILED:friend_intake_run_not_owned');
    });

    const response = await request(buildApp({ recordUsefulness }))
      .post('/friend-intake/usefulness')
      .set('Authorization', BEARER)
      .send({ runId: RUN_ID, response: 'not_really' });

    expect(response.status).toBe(404);
  });

  it('does not make an external HTTP call while producing the deterministic slice', async () => {
    authenticateFounder();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await request(buildApp())
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({ rawText: 'Finish the build.', privacyChoice: 'process_without_saving' });

    expect(response.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
