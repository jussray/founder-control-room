import { describe, expect, it } from 'vitest';
import { latestWorkflowObservations } from './GitHubAuditRepositoryProvider.js';
import type { PullRequestAuditWorkflowObservation } from './PullRequestAuditEvidence.js';

const HEAD = 'a'.repeat(40);

function workflow(overrides: Partial<PullRequestAuditWorkflowObservation> = {}): PullRequestAuditWorkflowObservation {
  return {
    id: 'run-1',
    contextId: '10:pull_request',
    name: 'Quality Gate',
    status: 'completed',
    conclusion: 'success',
    headSha: HEAD,
    runNumber: 10,
    runAttempt: 1,
    createdAt: '2026-08-25T20:00:00.000Z',
    updatedAt: '2026-08-25T20:10:00.000Z',
    detailsUrl: 'https://github.com/example/actions/runs/1',
    ...overrides,
  };
}

describe('latestWorkflowObservations', () => {
  it('drops an older failed execution when a newer successful run exists for the same context', () => {
    const result = latestWorkflowObservations([
      workflow({
        id: 'old-failure',
        conclusion: 'failure',
        runNumber: 9,
        updatedAt: '2026-08-25T19:10:00.000Z',
      }),
      workflow({
        id: 'new-success',
        conclusion: 'success',
        runNumber: 10,
        updatedAt: '2026-08-25T20:10:00.000Z',
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'new-success', conclusion: 'success' });
  });

  it('uses a later run attempt when the workflow run number is unchanged', () => {
    const result = latestWorkflowObservations([
      workflow({ id: 'attempt-1', conclusion: 'failure', runNumber: 10, runAttempt: 1 }),
      workflow({ id: 'attempt-2', conclusion: 'success', runNumber: 10, runAttempt: 2 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'attempt-2', runAttempt: 2, conclusion: 'success' });
  });

  it('keeps distinct workflow/event contexts independent', () => {
    const result = latestWorkflowObservations([
      workflow({ id: 'pr', contextId: '10:pull_request' }),
      workflow({ id: 'push', contextId: '10:push', name: 'Quality Gate push' }),
    ]);

    expect(result.map((item) => item.id).sort()).toEqual(['pr', 'push']);
  });
});
