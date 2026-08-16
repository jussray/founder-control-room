import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock, upsertMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  supabaseMock: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock('../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import { StripeSyncWitnessController } from '../StripeSyncWitnessController.js';
import type { ReconcileRequest, ReconcileResult } from '../../reconciliation/types.js';

type DirectController = {
  reconcile(req: ReconcileRequest): Promise<ReconcileResult>;
};

const request: ReconcileRequest = {
  projectId: 'project-fcr',
  controller: 'StripeSyncWitnessController',
  resourceId: 'latest_full_sync_run',
  reason: 'periodic_resync',
};

const cleanWitness = {
  available: true,
  proof_scope: 'latest_full_sync_run',
  run_present: true,
  started_at: '2026-08-10T07:24:00.951Z',
  closed_at: '2026-08-10T07:25:10.847Z',
  triggered_by: 'edge-worker',
  total_processed: 65,
  total_objects: 618,
  complete_count: 618,
  error_count: 0,
  running_count: 0,
  pending_count: 0,
  status: 'complete',
  error_present: false,
  reconciliation_proven: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  upsertMock.mockResolvedValue({ error: null });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'provider_observations') return { upsert: upsertMock };
    return {};
  });
});

describe('StripeSyncWitnessController', () => {
  it('marks a provider-proven full sync as converged without proposing mutations', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: cleanWitness, error: null });

    const controller = new StripeSyncWitnessController() as unknown as DirectController;
    const result = await controller.reconcile(request);

    expect(result.status).toBe('converged');
    expect(result.proposedActions).toEqual([]);
    expect(result.requiresApproval).toBe(false);
    expect(result.message).toMatch(/618\/618/);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-fcr',
        provider: 'stripe',
        resource_type: 'stripe_sync',
        resource_id: 'latest_full_sync_run',
        observed_state: cleanWitness,
      }),
      { onConflict: 'project_id,provider,resource_type,resource_id' },
    );
  });

  it('marks an incomplete or errored provider run as drifted instead of claiming success', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        ...cleanWitness,
        status: 'error',
        error_count: 3,
        complete_count: 615,
        error_present: true,
        reconciliation_proven: false,
      },
      error: null,
    });

    const controller = new StripeSyncWitnessController() as unknown as DirectController;
    const result = await controller.reconcile(request);

    expect(result.status).toBe('drifted');
    expect(result.message).toMatch(/not proven complete/);
    expect(result.proposedActions).toEqual([]);
  });

  it('fails closed when the provider ledger is unavailable', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        available: false,
        proof_scope: 'latest_full_sync_run',
        reason: 'stripe_sync_ledger_unavailable',
      },
      error: null,
    });

    const controller = new StripeSyncWitnessController() as unknown as DirectController;
    const result = await controller.reconcile(request);

    expect(result.status).toBe('blocked');
    expect(result.message).toContain('stripe_sync_ledger_unavailable');
    expect(result.proposedActions).toEqual([]);
  });
});
