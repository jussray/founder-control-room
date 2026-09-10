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

import express, { type NextFunction, type Request, type Response } from 'express';
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
const EVENT_ID = '00000000-0000-4000-8000-000000000555';
const SESSION_ID_HASH = 'a'.repeat(64);
const OTHER_SESSION_ID_HASH = 'b'.repeat(64);
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

function fakeInteractiveFounder(req: Request, _res: Response, next: NextFunction) {
  (req as Request & { founder?: { email: string; userId: string } }).founder = {
    email: FOUNDER_EMAIL,
    userId: FOUNDER_ID,
  };
  next();
}

function rejectInteractiveFounder(_req: Request, res: Response) {
  return res.status(401).json({ error: 'Interactive founder session required' });
}

function buildApp(overrides: FriendIntakeRouteDependencies = {}) {
  const app = express();
  app.use(express.json());
  app.use('/friend-intake', createFriendIntakeRouter({
    enabled: () => true,
    persistenceEnabled: () => true,
    interactiveAuthMiddleware: fakeInteractiveFounder,
    resolveInteractiveSessionIdHash: vi.fn(async () => SESSION_ID_HASH),
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
  it('rejects an unauthenticated unsaved run before engine persistence', async () => {
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
    expect(persistRun).toHaveBeenCalledTimes(1);
    expect(persistRun.mock.calls[0]?.[0]).toMatchObject({
      founderId: FOUNDER_ID,
      projectId: PROJECT_ID,
      privacyChoice: 'process_without_saving',
      redactedSummary: null,
      sensitiveCategories: [],
      sensitiveSaveReviewed: false,
      intentTagIds: [],
      modelExecutionState: 'blocked',
    });
    expect(JSON.stringify(persistRun.mock.calls[0]?.[0])).not.toContain(rawText);
    expect(JSON.stringify(persistRun.mock.calls[0]?.[0])).not.toContain(OTHER_FOUNDER_ID);
  });

  it('classifies sensitive input server-side without persisting derived labels in unsaved mode', async () => {
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
    expect(persistRun.mock.calls[0]?.[0]).toMatchObject({
      privacyChoice: 'process_without_saving',
      redactedSummary: null,
      sensitiveCategories: [],
      sensitiveSaveReviewed: false,
      intentTagIds: [],
    });
  });

  it('requires interactive founder authority before any saved intake content can persist', async () => {
    authenticateFounder();
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);

    const response = await request(buildApp({
      interactiveAuthMiddleware: rejectInteractiveFounder,
      persistRun,
    }))
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({ rawText: 'Finish the product build.', privacyChoice: 'save_redacted_summary' });

    expect(response.status).toBe(401);
    expect(persistRun).not.toHaveBeenCalled();
  });

  it('keeps ephemeral intake available while the independent persistence switch is off', async () => {
    authenticateFounder();
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);
    const app = buildApp({ persistenceEnabled: () => false, persistRun });

    const unsaved = await request(app)
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({ rawText: 'Finish the build.', privacyChoice: 'process_without_saving' });
    expect(unsaved.status).toBe(200);

    const saved = await request(app)
      .post('/friend-intake/run')
      .send({ rawText: 'Finish the build.', privacyChoice: 'save_redacted_summary' });
    expect(saved.status).toBe(503);
    expect(saved.body.code).toBe('FRIEND_INTAKE_PERSISTENCE_DISABLED');
    expect(persistRun).toHaveBeenCalledTimes(1);
    expect(persistRun.mock.calls[0]?.[0].privacyChoice).toBe('process_without_saving');
  });

  it('persists a bounded summary plus derived labels for a non-sensitive interactive save', async () => {
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);
    const rawText = 'Email founder@example.com about the product build plan.';

    const response = await request(buildApp({ persistRun }))
      .post('/friend-intake/run')
      .send({ rawText, privacyChoice: 'save_redacted_summary' });

    expect(response.status).toBe(200);
    expect(response.body.receipt.inputPersistence).toBe('redacted_summary_and_derived_labels');
    const persisted = persistRun.mock.calls[0]?.[0];
    expect(persisted?.privacyChoice).toBe('save_redacted_summary');
    expect(persisted?.redactedSummary).toBeTruthy();
    expect(persisted?.redactedSummary?.length).toBeLessThanOrEqual(300);
    expect(persisted?.redactedSummary).not.toContain('founder@example.com');
    expect(persisted?.intentTagIds).toContain('build');
    expect(persisted?.sensitiveSaveReviewed).toBe(false);
    expect(JSON.stringify(persisted)).not.toContain(rawText);
  });

  it('requires a server-issued, session-bound review receipt before a sensitive save', async () => {
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);
    const rawText = 'My child is involved in a custody issue.';
    const app = buildApp({ persistRun });
    const agent = request.agent(app);

    const forged = await agent
      .post('/friend-intake/run')
      .send({ rawText, privacyChoice: 'save_redacted_summary', sensitiveSaveConfirmed: true });
    expect(forged.status).toBe(409);
    expect(persistRun).not.toHaveBeenCalled();

    const reviewResponse = await agent
      .post('/friend-intake/run')
      .send({ rawText, privacyChoice: 'save_redacted_summary' });
    expect(reviewResponse.status).toBe(409);
    expect(reviewResponse.body).toMatchObject({
      code: 'SENSITIVE_SAVE_REVIEW_REQUIRED',
      review: {
        sensitiveCategories: expect.arrayContaining(['teen', 'legal']),
        intentTagIds: expect.arrayContaining(['kids', 'legal']),
        inputPersistence: 'none',
        externalModelCalled: false,
        reviewReceiptIssued: true,
      },
    });
    expect(JSON.stringify(reviewResponse.body)).not.toContain(rawText);

    const confirmed = await agent
      .post('/friend-intake/run')
      .send({ rawText, privacyChoice: 'save_redacted_summary', sensitiveSaveConfirmed: true });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.receipt.inputPersistence).toBe('redacted_summary_and_derived_labels');
    expect(persistRun).toHaveBeenCalledTimes(1);
    expect(persistRun.mock.calls[0]?.[0]).toMatchObject({
      founderId: FOUNDER_ID,
      privacyChoice: 'save_redacted_summary',
      sensitiveSaveReviewed: true,
      modelExecutionState: 'blocked',
    });
  });

  it('invalidates a sensitive review when the originating browser session changes', async () => {
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);
    let sessionHash = SESSION_ID_HASH;
    const app = buildApp({
      persistRun,
      resolveInteractiveSessionIdHash: vi.fn(async () => sessionHash),
    });
    const agent = request.agent(app);
    const rawText = 'My child is involved in a custody issue.';

    const review = await agent
      .post('/friend-intake/run')
      .send({ rawText, privacyChoice: 'save_redacted_summary' });
    expect(review.status).toBe(409);

    sessionHash = OTHER_SESSION_ID_HASH;
    const confirmation = await agent
      .post('/friend-intake/run')
      .send({ rawText, privacyChoice: 'save_redacted_summary', sensitiveSaveConfirmed: true });

    expect(confirmation.status).toBe(409);
    expect(confirmation.body.code).toBe('SENSITIVE_SAVE_REVIEW_REQUIRED');
    expect(persistRun).not.toHaveBeenCalled();
  });

  it('maps one review receipt to one database identity across concurrent confirmations', async () => {
    const seen = new Set<string>();
    const persistRun = vi.fn(async (input: PersistRunInput) => {
      if (seen.has(input.intakeId)) {
        throw new Error('FRIEND_INTAKE_PERSISTENCE_FAILED:duplicate key value violates unique constraint');
      }
      seen.add(input.intakeId);
    });
    const app = buildApp({ persistRun });
    const rawText = 'My child is involved in a custody issue.';

    const review = await request(app)
      .post('/friend-intake/run')
      .send({ rawText, privacyChoice: 'save_redacted_summary' });
    expect(review.status).toBe(409);
    const cookieHeader = review.headers['set-cookie'];
    const cookieText = Array.isArray(cookieHeader) ? cookieHeader[0] : String(cookieHeader ?? '');
    const reviewCookie = cookieText.split(';')[0];

    const confirm = () => request(app)
      .post('/friend-intake/run')
      .set('Cookie', reviewCookie)
      .send({ rawText, privacyChoice: 'save_redacted_summary', sensitiveSaveConfirmed: true });

    const responses = await Promise.all([confirm(), confirm()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(persistRun).toHaveBeenCalledTimes(2);
    expect(persistRun.mock.calls[0]?.[0].intakeId).toBe(persistRun.mock.calls[1]?.[0].intakeId);
    expect(seen).toHaveLength(1);
  });

  it('cancels without resolving a project or writing any receipt', async () => {
    authenticateFounder();
    const resolveProjectId = vi.fn(async () => PROJECT_ID);
    const persistRun = vi.fn(async (_input: PersistRunInput) => undefined);

    const response = await request(buildApp({ resolveProjectId, persistRun }))
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({ privacyChoice: 'cancel' });

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

    const response = await request(buildApp({ persistRun, runEngine: () => invalidResult }))
      .post('/friend-intake/run')
      .set('Authorization', BEARER)
      .send({ rawText: 'Finish the build.', privacyChoice: 'process_without_saving' });

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('invalid_tiny_move_duration');
    expect(persistRun).not.toHaveBeenCalled();
  });

  it('records appendable usefulness feedback using founder-scoped telemetry and an exact event id', async () => {
    authenticateFounder();
    const recordUsefulness = vi.fn(async (_input: RecordUsefulnessInput) => undefined);

    const response = await request(buildApp({ recordUsefulness }))
      .post('/friend-intake/usefulness')
      .set('Authorization', BEARER)
      .send({ runId: RUN_ID, response: 'yes', eventId: EVENT_ID, founderId: OTHER_FOUNDER_ID });

    expect(response.status).toBe(200);
    expect(recordUsefulness).toHaveBeenCalledWith({
      runId: RUN_ID,
      founderId: FOUNDER_ID,
      projectId: PROJECT_ID,
      response: 'yes',
      eventId: EVENT_ID,
    });
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
      .send({ runId: RUN_ID, response: 'not_really', eventId: EVENT_ID });

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
