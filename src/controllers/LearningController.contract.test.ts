import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock('../lib/supabaseClient.js', () => ({
  supabase: { rpc, from },
}));

import { LearningController } from './LearningController.js';

const lessonId = '11111111-1111-4111-8111-111111111111';
const firstMission = '22222222-2222-4222-8222-222222222222';
const laterMission = '33333333-3333-4333-8333-333333333333';
const laterExecution = '44444444-4444-4444-8444-444444444444';
const laterOutcome = '55555555-5555-4555-8555-555555555555';
const permission = '66666666-6666-4666-8666-666666666666';

const sameDomain = {
  learningId: lessonId,
  originMissionId: firstMission,
  targetMissionId: laterMission,
  originDomain: 'ci',
  targetDomain: 'ci',
  citedByExecutionId: laterExecution,
  downstreamOutcomeId: laterOutcome,
  howApplied: 'Verified retry handling in a distinct downstream mission',
};

describe('LearningController runtime contract', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('submits exact downstream outcome identity to the atomic SQL promotion RPC', async () => {
    rpc.mockResolvedValue({ data: { id: lessonId, state: 'APPLIED' }, error: null });
    const controller = new LearningController();
    expect(await controller.apply(sameDomain)).toBe('APPLIED');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('learning_apply_verified', {
      p_learning_id: lessonId,
      p_expected_state: 'RETAINED',
      p_execution_id: laterExecution,
      p_outcome_id: laterOutcome,
      p_target_domain: 'ci',
      p_how_applied: sameDomain.howApplied,
      p_cross_domain_reason: null,
      p_founder_permission_id: null,
    });
    expect(controller.authority).toBe('observation-and-knowledge-only');
  });

  it('denies cross-domain reuse without a founder permission before calling SQL', async () => {
    const controller = new LearningController();
    await expect(controller.apply({
      ...sameDomain,
      targetDomain: 'auth',
      crossDomainReason: 'Same evidence-expiry bug affects auth decisions',
    })).rejects.toThrow('LEARNING_CROSS_DOMAIN_FOUNDER_APPROVAL_REQUIRED');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('pins a cross-domain application to its founder permission and later outcome', async () => {
    rpc.mockResolvedValue({ data: { id: lessonId, state: 'APPLIED' }, error: null });
    await new LearningController().apply({
      ...sameDomain,
      targetDomain: 'auth',
      crossDomainReason: 'Same evidence-expiry bug affects auth decisions',
      crossDomainPermissionId: permission,
    });
    expect(rpc).toHaveBeenCalledWith('learning_apply_verified', expect.objectContaining({
      p_outcome_id: laterOutcome,
      p_target_domain: 'auth',
      p_founder_permission_id: permission,
    }));
  });

  it('rejects false SQL receipts and stale state rather than claiming application', async () => {
    rpc.mockResolvedValueOnce({data: {id: lessonId, state: 'RETAINED'}, error: null});
    await expect(new LearningController().apply(sameDomain)).rejects.toThrow('LEARNING_APPLY_RECEIPT_MISMATCH');
    rpc.mockResolvedValueOnce({data: null, error: {message:'LEARNING_STALE_STATE'}});
    await expect(new LearningController().apply(sameDomain)).rejects.toThrow('LEARNING_STALE_STATE');
  });

  it('retirement requests are exact-state and exact-permission and cannot unretire', async () => {
    rpc.mockResolvedValue({data:{id:lessonId,state:'RETIRED'},error:null});
    const controller = new LearningController();
    await expect(controller.retire(lessonId,'RETAINED',permission)).resolves.toBe('RETIRED');
    expect(rpc).toHaveBeenCalledWith('learning_progress', {
      p_id: lessonId,
      p_expected: 'RETAINED',
      p_next: 'RETIRED',
      p_payload: { founder_permission_id: permission },
    });
    await expect(controller.extractSignal(lessonId, {
      signalClass:'repeatable',
      description:'No further signal after retirement',
      evidenceRefs:['verified:retired'],
    })).rejects.toThrow('LEARNING_PROGRESS_RECEIPT_MISMATCH');
    // The database, not an unauthenticated callback, must reject an attempted
    // write back from RETIRED to an active state. See Neon SQL preview.
  });

  it('findApplicable excludes retired records at the query boundary', async () => {
    const chain: any = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.gt = vi.fn(() => chain);
    chain.order = vi.fn(async () => ({data: [{id:'retained',state:'RETAINED'}],error:null}));
    from.mockReturnValue(chain);
    const value = await new LearningController().findApplicable('ci', '2026-11-06T20:00:00Z');
    expect(from).toHaveBeenCalledWith('learning_records');
    expect(chain.in).toHaveBeenCalledWith('state',['RETAINED','APPLIED','REVISED']);
    expect(value.lessons).toEqual([{id:'retained',state:'RETAINED'}]);
    expect(value.authorizesExecution).toBe(false);
  });
});
