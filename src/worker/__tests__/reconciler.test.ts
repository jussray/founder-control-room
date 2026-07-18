import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockClaimWork,
  mockCompleteWork,
  mockFailWork,
  mockAbandonWork,
  mockControllerRun,
  mockFrom,
  mockAuditInsert,
} = vi.hoisted(() => ({
  mockClaimWork: vi.fn(),
  mockCompleteWork: vi.fn(),
  mockFailWork: vi.fn(),
  mockAbandonWork: vi.fn(),
  mockControllerRun: vi.fn(),
  mockFrom: vi.fn(),
  mockAuditInsert: vi.fn(),
}));

vi.mock('../../events/outbox.js', () => ({
  claimWork: mockClaimWork,
  completeWork: mockCompleteWork,
  failWork: mockFailWork,
  abandonWork: mockAbandonWork,
}));

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('../../controllers/CheckRunController.js', () => ({
  CheckRunController: vi.fn().mockImplementation(() => ({ run: mockControllerRun })),
}));
vi.mock('../../controllers/ChangeProposalController.js', () => ({
  ChangeProposalController: vi.fn().mockImplementation(() => ({ run: mockControllerRun })),
}));
vi.mock('../../controllers/MissionController.js', () => ({
  MissionController: vi.fn().mockImplementation(() => ({ run: mockControllerRun })),
}));
vi.mock('../../controllers/ProjectController.js', () => ({
  ProjectController: vi.fn().mockImplementation(() => ({ run: mockControllerRun })),
}));
vi.mock('../../controllers/ReleaseController.js', () => ({
  ReleaseController: vi.fn().mockImplementation(() => ({ run: mockControllerRun })),
}));
vi.mock('../../controllers/ProofGateController.js', () => ({
  ProofGateController: vi.fn().mockImplementation(() => ({ run: mockControllerRun })),
}));

import { runReconcilerCycle } from '../reconciler.js';

const WORK_ITEM = {
  id: 'work-1',
  projectId: 'project-1',
  controller: 'CheckRunController',
  resourceId: 'check-1',
  reason: 'provider_event',
  sourceEventId: 'event-1',
  attemptCount: 0,
};

const CONVERGED_RESULT = {
  status: 'converged' as const,
  observedChanges: [],
  proposedActions: [],
  evidenceIds: [],
  requiresApproval: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockClaimWork.mockResolvedValue([]);
  mockCompleteWork.mockResolvedValue(undefined);
  mockFailWork.mockResolvedValue(undefined);
  mockAbandonWork.mockResolvedValue(undefined);
  mockControllerRun.mockResolvedValue(CONVERGED_RESULT);
  mockAuditInsert.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({ insert: mockAuditInsert });
});

describe('reconciler lifecycle', () => {
  it('atomically completes successful work with its source event', async () => {
    mockClaimWork.mockResolvedValue([WORK_ITEM]);

    await runReconcilerCycle();

    expect(mockControllerRun).toHaveBeenCalledWith({
      projectId: 'project-1',
      controller: 'CheckRunController',
      resourceId: 'check-1',
      reason: 'provider_event',
      sourceEventId: 'event-1',
    });
    expect(mockCompleteWork).toHaveBeenCalledWith('work-1', 'event-1');
    expect(mockFailWork).not.toHaveBeenCalled();
    expect(mockAbandonWork).not.toHaveBeenCalled();
  });

  it('reschedules retryable work without creating a replacement row', async () => {
    mockClaimWork.mockResolvedValue([WORK_ITEM]);
    mockControllerRun.mockResolvedValue({
      ...CONVERGED_RESULT,
      status: 'retry',
      message: 'lease held',
      retryAfter: '2026-07-18T03:00:00.000Z',
    });

    await runReconcilerCycle();

    expect(mockFailWork).toHaveBeenCalledWith('work-1', 'lease held');
    expect(mockCompleteWork).not.toHaveBeenCalled();
    expect(mockAbandonWork).not.toHaveBeenCalled();
  });

  it('terminally abandons retrying work at the fifth attempt', async () => {
    mockClaimWork.mockResolvedValue([{ ...WORK_ITEM, attemptCount: 4 }]);
    mockControllerRun.mockResolvedValue({
      ...CONVERGED_RESULT,
      status: 'retry',
      message: 'provider unavailable',
    });

    await runReconcilerCycle();

    expect(mockAbandonWork).toHaveBeenCalledWith(
      'work-1',
      'event-1',
      expect.stringContaining('Terminal reconciliation failure after 5 attempt(s)'),
    );
    expect(mockFailWork).not.toHaveBeenCalled();
    expect(mockCompleteWork).not.toHaveBeenCalled();
    expect(mockAuditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'blocked',
        message: expect.stringContaining('provider unavailable'),
      }),
    );
  });

  it('terminally abandons deterministic unknown-controller work immediately', async () => {
    mockClaimWork.mockResolvedValue([
      { ...WORK_ITEM, controller: 'MissingController', attemptCount: 0 },
    ]);

    await runReconcilerCycle();

    expect(mockControllerRun).not.toHaveBeenCalled();
    expect(mockAbandonWork).toHaveBeenCalledWith(
      'work-1',
      'event-1',
      expect.stringContaining('Unknown controller: MissingController'),
    );
    expect(mockFailWork).not.toHaveBeenCalled();
  });

  it('reschedules thrown controller failures below the retry limit', async () => {
    mockClaimWork.mockResolvedValue([WORK_ITEM]);
    mockControllerRun.mockRejectedValue(new Error('provider timeout'));

    await runReconcilerCycle();

    expect(mockFailWork).toHaveBeenCalledWith('work-1', 'provider timeout');
    expect(mockAbandonWork).not.toHaveBeenCalled();
  });
});
