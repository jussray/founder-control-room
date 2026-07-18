import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFrom,
  mockInsert,
  mockSelect,
  mockSingle,
  mockUpdate,
  mockEq,
  mockRpc,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockSingle: vi.fn(),
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

import {
  claimWork,
  completeWork,
  enqueueReconcile,
  failWork,
} from '../outbox.js';

beforeEach(() => {
  vi.clearAllMocks();

  const chain = {
    insert: mockInsert,
    select: mockSelect,
    single: mockSingle,
    update: mockUpdate,
    eq: mockEq,
  };

  mockFrom.mockReturnValue(chain);
  mockInsert.mockReturnValue(chain);
  mockSelect.mockReturnValue(chain);
  mockUpdate.mockReturnValue(chain);
  mockEq.mockResolvedValue({ error: null });
  mockSingle.mockResolvedValue({ data: { id: 'work-1' }, error: null });
  mockRpc.mockResolvedValue({ data: [], error: null });
});

describe('controller outbox', () => {
  it('inserts separate work rows for later events on the same resource', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'work-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'work-2' }, error: null });

    const entry = {
      projectId: 'project-123',
      controller: 'ChangeProposalController',
      resourceId: '480',
      reason: 'provider_event' as const,
      sourceEventId: 'event-123',
    };

    const first = await enqueueReconcile(entry, {
      availableAt: '2026-07-18T02:45:00.000Z',
    });
    const second = await enqueueReconcile(
      { ...entry, sourceEventId: 'event-456' },
      { availableAt: '2026-07-18T02:46:00.000Z' },
    );

    expect(first).toBe('work-1');
    expect(second).toBe('work-2');
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenNthCalledWith(1, {
      project_id: 'project-123',
      controller: 'ChangeProposalController',
      resource_id: '480',
      reason: 'provider_event',
      source_event_id: 'event-123',
      available_at: '2026-07-18T02:45:00.000Z',
      attempt_count: 0,
    });
    expect(mockInsert).toHaveBeenNthCalledWith(2, {
      project_id: 'project-123',
      controller: 'ChangeProposalController',
      resource_id: '480',
      reason: 'provider_event',
      source_event_id: 'event-456',
      available_at: '2026-07-18T02:46:00.000Z',
      attempt_count: 0,
    });
  });

  it('maps atomically claimed database rows into controller work', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'work-1',
          project_id: 'project-123',
          controller: 'ProjectController',
          resource_id: null,
          reason: 'periodic_resync',
          source_event_id: null,
          attempt_count: 2,
        },
      ],
      error: null,
    });

    await expect(claimWork(5)).resolves.toEqual([
      {
        id: 'work-1',
        projectId: 'project-123',
        controller: 'ProjectController',
        resourceId: null,
        reason: 'periodic_resync',
        sourceEventId: null,
        attemptCount: 2,
      },
    ]);
    expect(mockRpc).toHaveBeenCalledWith('claim_outbox_work', { p_limit: 5 });
  });

  it('surfaces completion and retry persistence failures', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'completion failed' } });
    await expect(completeWork('work-1')).rejects.toThrow('completion failed');

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'retry failed' } });
    await expect(failWork('work-1', 'controller failed')).rejects.toThrow('retry failed');
  });
});
