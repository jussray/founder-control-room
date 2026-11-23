import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, rows } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock('../supabaseClient.js', () => ({
  supabase: { from: fromMock },
}));

import {
  createOperatorContinuityReceiptV2,
  createOperatorExecutionContinuation,
} from '../operatorContinuity.js';
import {
  listRecentOperatorExecutionContinuations,
  storeOperatorExecutionContinuation,
} from '../operatorExecutionContinuationStore.js';

const repo = 'jussray/founder-control-room';
const projectSlug = 'founder-control-room';

function record(taskId: string, observedAt: string, action: string, project = projectSlug, evidenceRefs = ['github:sha']) {
  return createOperatorExecutionContinuation({
    sourceMode: 'chat',
    taskId,
    intentRef: 'fcr:intents/' + taskId,
    contextRefs: ['fcr:context/' + taskId],
    completedSteps: [{ stepId: 'inspect', evidenceRefs: ['github:sha'] }],
    remainingStepIds: [action],
    nextActionRef: 'fcr:actions/' + action,
    pendingDecisionRefs: [],
    observation: createOperatorContinuityReceiptV2({
      source: 'chatgpt',
      projectSlug: project,
      repositoryFullName: repo,
      targetBranch: 'main',
      targetSha: 'a'.repeat(40),
      prNumber: null,
      baseSha: null,
      headSha: null,
      scopeFingerprint: null,
      proofFingerprint: null,
      reviewFingerprint: null,
      providerFingerprint: null,
      runtimeFingerprint: null,
      authorityFingerprint: null,
      evidenceRefs,
      observedAt,
      expiresAt: '2026-11-22T00:00:00.000Z',
      predecessorFingerprint: null,
    }),
  });
}

function row(packet: ReturnType<typeof record>): Record<string, unknown> {
  return {
    id: 'row-' + packet.taskId + '-' + packet.observation.observedAt,
    task_id: packet.taskId,
    checkpoint_observed_at: packet.observation.observedAt,
    execution_state: packet,
    subject_fingerprint: packet.observation.fingerprint,
    proof_cookie: packet.fingerprint,
    invalidated_at: null,
    created_at: packet.observation.observedAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rows.length = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === 'projects') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'project-1', repo_identifier: repo },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'continuity_records') {
      const filters: Record<string, unknown> = {};
      let discovery = false;
      const query: Record<string, unknown> = {};
      Object.assign(query, {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        not: () => { discovery = true; return query; },
        order: () => query,
        limit: (count: number) => discovery
          ? Promise.resolve({ data: rows.slice(0, Math.min(count, 200)), error: null })
          : query,
        maybeSingle: async () => {
          const matches = rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
          matches.sort((a, b) => String(b.checkpoint_observed_at).localeCompare(String(a.checkpoint_observed_at))
            || String(b.created_at).localeCompare(String(a.created_at)));
          return { data: matches[0] ?? null, error: null };
        },
        insert: (payload: Record<string, unknown>) => {
          const inserted = {
            id: 'row-' + (rows.length + 1), project_id: payload.project_id, task_id: payload.task_id,
            execution_state: payload.execution_state,
            subject_fingerprint: payload.subject_fingerprint,
            proof_cookie: payload.proof_cookie,
            checkpoint_observed_at: payload.checkpoint_observed_at,
            invalidated_at: null,
            created_at: payload.checkpoint_observed_at,
          };
          rows.push(inserted);
          return { select: () => ({ single: async () => ({ data: inserted, error: null }) }) };
        },
      });
      return query;
    }
    throw new Error('unexpected table');
  });
});

describe('real store task discovery over canonical continuity_records', () => {
  it('retains newest task metadata once per task and never promotes persisted data to proof', async () => {
    rows.push(
      row(record('task-a', '2026-11-21T09:08:00.000Z', 'verify')),
      row(record('task-a', '2026-11-21T09:05:00.000Z', 'patch')),
      row(record('task-b', '2026-11-21T09:02:00.000Z', 'review')),
    );
    const result = await listRecentOperatorExecutionContinuations(projectSlug, repo, 2);
    expect(result.items.map(item => item.taskId)).toEqual(['task-a', 'task-b']);
    expect(result.items[0].nextActionRef).toBe('fcr:actions/verify');
    expect(result).toMatchObject({
      scanned: 3, boundedWindow: true,
      currentEvidenceVerified: false, authorizesExecution: false,
    });
    expect(JSON.stringify(result)).not.toContain('contextRefs');
  });

  it('flags an invalidated newest checkpoint without resurrecting an older row or exposing its action', async () => {
    rows.push(
      { ...row(record('task-a', '2026-11-21T09:08:00.000Z', 'deploy')), invalidated_at: '2026-11-21T10:00:00.000Z' },
      row(record('task-a', '2026-11-21T09:05:00.000Z', 'patch')),
      row(record('task-b', '2026-11-21T09:02:00.000Z', 'review')),
    );
    const result = await listRecentOperatorExecutionContinuations(projectSlug, repo, 5);
    expect(result.items.map(item => item.taskId)).toEqual(['task-a', 'task-b']);
    expect(result.items[0]).toMatchObject({
      status: 'INVALIDATED',
      invalidatedAt: '2026-11-21T10:00:00.000Z',
      nextActionRef: null,
      remainingStepIds: [],
    });
    expect(JSON.stringify(result.items[0])).not.toContain('fcr:actions/patch');
    expect(result.items[1]).toMatchObject({
      status: 'PERSISTED_NOT_REVALIDATED',
      invalidatedAt: null,
      nextActionRef: 'fcr:actions/review',
    });
  });

  it('rejects cross-project persisted records rather than disclosing them', async () => {
    rows.push(row(record('task-a', '2026-11-21T09:08:00.000Z', 'verify', 'other-project')));
    await expect(listRecentOperatorExecutionContinuations(projectSlug, repo))
      .rejects.toThrow('storage_unavailable');
  });

  it('enforces A-to-B submit, independent verification, close, and invalidation revalidation', async () => {
    const packet = (taskId: string, observedAt: string, sourceOperator: string, destinationOperator: string,
      taskState: 'ACTIVE' | 'RESULT_SUBMITTED' | 'VERIFIED' | 'CLOSED', evidenceRef: string,
      extras: Record<string, unknown> = {}) => {
      const base = record(taskId, observedAt, 'verify', projectSlug, [evidenceRef]);
      return createOperatorExecutionContinuation({
        sourceMode: base.sourceMode,
        sourceOperator,
        destinationOperator,
        taskState,
        resultRef: taskState === 'ACTIVE' ? null : (extras.resultRef as string | null),
        resultSubmittedByOperator: taskState === 'ACTIVE' ? null : (extras.resultSubmittedByOperator as string | null),
        verificationRefs: (extras.verificationRefs as string[] | undefined) ?? [],
        verifiedByOperator: (extras.verifiedByOperator as string | null | undefined) ?? null,
        closedAt: (extras.closedAt as string | null | undefined) ?? null,
        taskId: base.taskId,
        intentRef: base.intentRef,
        contextRefs: base.contextRefs,
        completedSteps: base.completedSteps,
        remainingStepIds: base.remainingStepIds,
        nextActionRef: base.nextActionRef,
        pendingDecisionRefs: base.pendingDecisionRefs,
        observation: base.observation,
      });
    };

    const active = packet('task-lifecycle', '2026-11-21T09:00:00.000Z', 'chatgpt', 'codex', 'ACTIVE', 'github:source');
    await storeOperatorExecutionContinuation(active);
    const submitted = packet('task-lifecycle', '2026-11-21T09:01:00.000Z', 'codex', 'chatgpt', 'RESULT_SUBMITTED', 'github:submit', {
      resultRef: 'artifact:result-1', resultSubmittedByOperator: 'codex',
    });
    await storeOperatorExecutionContinuation(submitted);
    const verified = packet('task-lifecycle', '2026-11-21T09:02:00.000Z', 'chatgpt', 'chatgpt', 'VERIFIED', 'github:verify', {
      resultRef: 'artifact:result-1', resultSubmittedByOperator: 'codex',
      verificationRefs: ['github:verify'], verifiedByOperator: 'chatgpt',
    });
    await storeOperatorExecutionContinuation(verified);
    const closed = packet('task-lifecycle', '2026-11-21T09:03:00.000Z', 'chatgpt', 'chatgpt', 'CLOSED', 'github:close', {
      resultRef: 'artifact:result-1', resultSubmittedByOperator: 'codex',
      verificationRefs: ['github:verify'], verifiedByOperator: 'chatgpt', closedAt: '2026-11-21T09:03:00.000Z',
    });
    await storeOperatorExecutionContinuation(closed);
    await expect(storeOperatorExecutionContinuation(packet(
      'task-lifecycle', '2026-11-21T09:04:00.000Z', 'chatgpt', 'chatgpt', 'ACTIVE', 'github:late',
    ))).rejects.toThrow('stale_continuation');

    const invalidatable = packet('task-invalidated', '2026-11-21T09:05:00.000Z', 'chatgpt', 'codex', 'ACTIVE', 'github:old');
    await storeOperatorExecutionContinuation(invalidatable);
    rows.find(row => row.task_id === 'task-invalidated')!.invalidated_at = '2026-11-21T09:06:00.000Z';
    await expect(storeOperatorExecutionContinuation(packet(
      'task-invalidated', '2026-11-21T09:07:00.000Z', 'codex', 'chatgpt', 'ACTIVE', 'github:old',
    ))).rejects.toThrow('stale_continuation');
    const revalidated = packet('task-invalidated', '2026-11-21T09:08:00.000Z', 'codex', 'chatgpt', 'ACTIVE', 'github:fresh');
    await expect(storeOperatorExecutionContinuation(revalidated)).resolves.toMatchObject({ disposition: 'stored' });
  });

  it('bounds requested discovery to 20 task summaries', async () => {
    await expect(listRecentOperatorExecutionContinuations(projectSlug, repo, 21))
      .rejects.toThrow('invalid_continuation');
    expect(fromMock).not.toHaveBeenCalled();
  });
});
