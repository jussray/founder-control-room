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
} from '../operatorExecutionContinuationStore.js';

const repo = 'jussray/founder-control-room';
const projectSlug = 'founder-control-room';

function record(taskId: string, observedAt: string, action: string, project = projectSlug) {
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
      evidenceRefs: ['github:sha'],
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
      const query = {
        select: () => query,
        eq: () => query,
        not: () => query,
        order: () => query,
        limit: async () => ({ data: rows.slice(0, 200), error: null }),
      };
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

  it('bounds requested discovery to 20 task summaries', async () => {
    await expect(listRecentOperatorExecutionContinuations(projectSlug, repo, 21))
      .rejects.toThrow('invalid_continuation');
    expect(fromMock).not.toHaveBeenCalled();
  });
});
