import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockFrom, storeRows, dbState } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  storeRows: [] as Array<Record<string, unknown>>,
  dbState: { fail: false },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}));

import express from 'express';
import request from 'supertest';
import {
  createOperatorContinuityReceiptV2,
  createOperatorExecutionContinuation,
} from '../../../lib/operatorContinuity.js';
import { operatorContinuationRouter } from '../operatorContinuation.js';

const HEAD = 'a'.repeat(40);
const observedAt = '2026-11-15T19:00:00.000Z';
const basePacket = createOperatorExecutionContinuation({
  sourceMode: 'chat',
  taskId: 'task-12',
  intentRef: 'fcr:intent/task-12',
  contextRefs: ['chatgpt:threads/task-12', 'fcr:artifacts/task-12'],
  completedSteps: [{ stepId: 'inspect', evidenceRefs: ['github:head-readback'] }],
  remainingStepIds: ['verify'],
  nextActionRef: 'fcr:actions/verify',
  pendingDecisionRefs: [],
  observation: createOperatorContinuityReceiptV2({
    source: 'chatgpt',
    projectSlug: 'founder-control-room',
    repositoryFullName: 'jussray/founder-control-room',
    targetBranch: 'main',
    targetSha: HEAD,
    prNumber: null,
    baseSha: null,
    headSha: null,
    scopeFingerprint: null,
    proofFingerprint: null,
    reviewFingerprint: null,
    providerFingerprint: null,
    runtimeFingerprint: null,
    authorityFingerprint: null,
    evidenceRefs: ['github:head-readback'],
    observedAt,
    expiresAt: '2026-11-15T21:00:00.000Z',
    predecessorFingerprint: null,
  }),
});

function app() {
  const server = express();
  server.use(express.json());
  server.use('/operator/continuity', operatorContinuationRouter);
  return server;
}

function mockDatabase() {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'founder_users') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { email: 'founder@example.org' }, error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'projects') {
      return {
        select: () => ({
          eq: (_key: string, slug: string) => ({
            maybeSingle: async () => ({
              data: slug === 'founder-control-room'
                ? { id: 'project-1', repo_identifier: 'jussray/founder-control-room' }
                : null,
              error: dbState.fail ? { code: 'down' } : null,
            }),
          }),
        }),
      };
    }
    if (table === 'continuity_records') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: storeRows.at(-1) ?? null,
                    error: dbState.fail ? { code: 'down' } : null,
                  }),
                }),
              }),
            }),
          }),
        }),
        insert: (input: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const inserted = {
                id: 'stored-row-1',
                task_id: input.task_id,
                execution_state: input.execution_state,
                subject_fingerprint: input.subject_fingerprint,
                proof_cookie: input.proof_cookie,
                invalidated_at: null,
                created_at: '2026-11-15T20:00:00.000Z',
              };
              if (!dbState.fail) storeRows.push(inserted);
              return {
                data: dbState.fail ? null : inserted,
                error: dbState.fail ? { code: 'down' } : null,
              };
            },
          }),
        }),
      };
    }
    throw new Error('unexpected table');
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  storeRows.length = 0;
  dbState.fail = false;
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-1', email: 'founder@example.org' } },
    error: null,
  });
  mockDatabase();
});

const authorization = 'Bearer valid-synthetic-founder-token';
const endpoint = '/operator/continuity';
const scope = '?projectSlug=founder-control-room&repositoryFullName=jussray%2Ffounder-control-room';

describe('founder-only cross-mode continuation storage', () => {
  it('rejects unauthenticated lookups and posts', async () => {
    expect((await request(app()).get(endpoint + '/task-12' + scope)).status).toBe(401);
    expect((await request(app()).post(endpoint).send({ continuation: basePacket })).status).toBe(401);
    expect(storeRows).toHaveLength(0);
  });

  it('saves a non-authorizing packet and retrieves the same pointers', async () => {
    const posted = await request(app()).post(endpoint)
      .set('Authorization', authorization)
      .send({ continuation: basePacket });
    expect(posted.status).toBe(201);
    expect(posted.body.disposition).toBe('stored');
    expect(posted.body.currentEvidenceVerified).toBe(false);
    expect(posted.body.executionAuthorityFromHandoff).toBe(false);

    const retrieved = await request(app()).get(endpoint + '/task-12' + scope)
      .set('Authorization', authorization);
    expect(retrieved.status).toBe(200);
    expect(retrieved.body.continuation.record).toMatchObject({
      taskId: 'task-12',
      completedSteps: [{ stepId: 'inspect' }],
      remainingStepIds: ['verify'],
      sourceMode: 'chat',
    });
    expect(retrieved.body.continuation.status).toBe('PERSISTED_NOT_REVALIDATED');
    expect(retrieved.body.currentEvidenceVerified).toBe(false);
    expect(retrieved.body.executionAuthorityFromHandoff).toBe(false);
  });

  it('does not duplicate identical packets or grant approval on replay', async () => {
    const first = await request(app()).post(endpoint)
      .set('Authorization', authorization).send({ continuation: basePacket });
    const second = await request(app()).post(endpoint)
      .set('Authorization', authorization).send({ continuation: basePacket });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.disposition).toBe('duplicate');
    expect(storeRows).toHaveLength(1);
  });

  it('rejects tampered authority and cross-project repository lookups', async () => {
    const forged = await request(app()).post(endpoint)
      .set('Authorization', authorization)
      .send({ continuation: { ...basePacket, authorizing: true } });
    expect(forged.status).toBe(400);
    expect(storeRows).toHaveLength(0);

    const wrongRepo = await request(app()).get(
      endpoint + '/task-12?projectSlug=founder-control-room&repositoryFullName=other%2Frepo',
    ).set('Authorization', authorization);
    expect(wrongRepo.status).toBe(404);
  });

  it('returns a sanitized 503 when storage is unavailable', async () => {
    dbState.fail = true;
    const posted = await request(app()).post(endpoint)
      .set('Authorization', authorization).send({ continuation: basePacket });
    expect(posted.status).toBe(503);
    expect(posted.body).toEqual({ code: 'continuation_store_unavailable' });
  });
});
