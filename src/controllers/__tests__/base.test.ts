import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReconcileRequest, ReconcileResult } from '../../reconciliation/types.js';

const {
  mockRpc,
  mockFrom,
  mockSelect,
  mockDelete,
  mockEq,
  mockSingle,
} = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockDelete: vi.fn(),
  mockEq: vi.fn(),
  mockSingle: vi.fn(),
}));

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
  },
}));

import { BaseController } from '../base.js';

const REQUEST: ReconcileRequest = {
  projectId: 'project-123',
  controller: 'TestController',
  resourceId: 'resource-456',
  reason: 'periodic_resync',
};

class TestController extends BaseController {
  readonly name = 'TestController';
  reconcileCalls = 0;

  protected async reconcile(_req: ReconcileRequest): Promise<ReconcileResult> {
    this.reconcileCalls += 1;
    return {
      status: 'converged',
      observedChanges: [],
      proposedActions: [],
      evidenceIds: [],
      requiresApproval: false,
    };
  }
}

beforeEach(() => {
  vi.clearAllMocks();

  const chain = {
    select: mockSelect,
    delete: mockDelete,
    eq: mockEq,
    single: mockSingle,
  };

  mockFrom.mockReturnValue(chain);
  mockSelect.mockReturnValue(chain);
  mockDelete.mockReturnValue(chain);
  mockEq.mockImplementation((column: string) => {
    if (column === 'claimed_at') return Promise.resolve({ error: null });
    return chain;
  });
  mockSingle.mockResolvedValue({
    data: { claimed_at: '2026-07-18T02:45:00.000Z' },
    error: null,
  });
  mockRpc.mockResolvedValue({ data: true, error: null });
});

describe('BaseController leases', () => {
  it('uses the atomic lease RPC and releases only its exact ownership token', async () => {
    const controller = new TestController();

    const result = await controller.run(REQUEST);

    expect(result.status).toBe('converged');
    expect(controller.reconcileCalls).toBe(1);
    expect(mockRpc).toHaveBeenCalledWith('try_acquire_controller_lease', {
      p_lease_key: 'project-123:TestController:resource-456',
      p_ttl_seconds: 60,
    });
    expect(mockSelect).toHaveBeenCalledWith('claimed_at');
    expect(mockEq).toHaveBeenCalledWith(
      'claimed_at',
      '2026-07-18T02:45:00.000Z',
    );
  });

  it('does not reconcile or release when another worker holds the lease', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const controller = new TestController();

    const result = await controller.run(REQUEST);

    expect(result.status).toBe('retry');
    expect(result.retryAfter).toBeDefined();
    expect(controller.reconcileCalls).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('fails closed when atomic lease acquisition errors', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const controller = new TestController();

    const result = await controller.run(REQUEST);

    expect(result.status).toBe('retry');
    expect(controller.reconcileCalls).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
