import { describe, expect, it } from 'vitest';
import {
  claimFounderContentApprovalForExecutionGeneration,
  type AtomicFounderContentExecutionClaimRpcClient,
} from '../atomicFounderContentExecutionClaim.js';

const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_A = '2026-09-04T18:50:00.000Z';
const GENERATION_B = '2026-09-04T18:52:01.000Z';
const PROPOSAL_HASH = 'a'.repeat(64);
const PUBLIC_PAYLOAD_HASH = 'b'.repeat(64);
const AUTHORIZATION_HASH = 'c'.repeat(64);
const APPROVAL_ID = 'fca:atomic-race-test';

function claimInput(generation: string) {
  return {
    executionId: EXECUTION_ID,
    executionStartedAt: generation,
    approvalId: APPROVAL_ID,
    founderUserId: 'founder-user-1',
    proposalHash: PROPOSAL_HASH,
    publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    authorizationHash: AUTHORIZATION_HASH,
    consumedBy: 'founder@example.com',
    now: '2026-09-04T18:52:02.000Z',
  };
}

function atomicRaceHarness() {
  const state = {
    executionStartedAt: GENERATION_A,
    status: 'pending',
    providerWriteAttempted: false,
    approvalClaimed: false,
    approvalConsumed: false,
    providerRequests: 0,
  };

  const rpc: AtomicFounderContentExecutionClaimRpcClient['rpc'] = async (functionName, args) => {
    expect(functionName).toBe('claim_founder_content_approval_for_execution_generation');
    const generationMatches = args.p_execution_id === EXECUTION_ID
      && args.p_expected_started_at === state.executionStartedAt
      && state.status === 'pending'
      && state.providerWriteAttempted === false
      && state.approvalClaimed === false;
    const approvalMatches = args.p_approval_id === APPROVAL_ID
      && args.p_founder_user_id === 'founder-user-1'
      && args.p_proposal_hash === PROPOSAL_HASH
      && args.p_public_payload_hash === PUBLIC_PAYLOAD_HASH
      && args.p_authorization_hash === AUTHORIZATION_HASH
      && state.approvalConsumed === false;

    if (!generationMatches || !approvalMatches) {
      return { data: [], error: null };
    }

    // Model the single PostgreSQL transaction: execution ownership and
    // one-shot approval consumption become visible together.
    state.approvalConsumed = true;
    state.approvalClaimed = true;
    return {
      data: [{
        approval: { approval_id: APPROVAL_ID },
        approval_id: APPROVAL_ID,
        authorization_hash: AUTHORIZATION_HASH,
        public_payload_hash: PUBLIC_PAYLOAD_HASH,
        execution_started_at: state.executionStartedAt,
      }],
      error: null,
    };
  };

  return {
    state,
    client: { rpc } as AtomicFounderContentExecutionClaimRpcClient,
    rearmAfterAbandonedPreclaimLease() {
      expect(state.approvalClaimed).toBe(false);
      expect(state.providerWriteAttempted).toBe(false);
      state.executionStartedAt = GENERATION_B;
    },
    dispatch(generation: string) {
      if (
        state.status === 'pending'
        && state.executionStartedAt === generation
        && state.approvalClaimed
        && !state.providerWriteAttempted
      ) {
        state.providerWriteAttempted = true;
        state.providerRequests += 1;
        return true;
      }
      return false;
    },
  };
}

describe('n8n atomic approval claim race contract', () => {
  it('prevents stale generation A from consuming approval after B rearms, then lets B claim and dispatch exactly once', async () => {
    const harness = atomicRaceHarness();

    // A prepared generation A, then stalled beyond the two-minute pre-claim
    // lease. B is therefore allowed to rearm while approval is still unused.
    harness.rearmAfterAbandonedPreclaimLease();

    const staleA = await claimFounderContentApprovalForExecutionGeneration(
      claimInput(GENERATION_A),
      harness.client,
    );
    expect(staleA).toEqual({
      ok: false,
      code: 'CLAIM_NOT_CURRENT',
      reason: 'execution generation or authoritative founder approval is no longer current',
    });
    expect(harness.state.approvalConsumed).toBe(false);
    expect(harness.dispatch(GENERATION_A)).toBe(false);
    expect(harness.state.providerRequests).toBe(0);

    const activeB = await claimFounderContentApprovalForExecutionGeneration(
      claimInput(GENERATION_B),
      harness.client,
    );
    expect(activeB.ok).toBe(true);
    expect(harness.state.approvalConsumed).toBe(true);
    expect(harness.state.approvalClaimed).toBe(true);

    expect(harness.dispatch(GENERATION_B)).toBe(true);
    expect(harness.dispatch(GENERATION_B)).toBe(false);
    expect(harness.state.providerRequests).toBe(1);
  });

  it('allows at most one atomic approval consumer for duplicate claims on one generation', async () => {
    const harness = atomicRaceHarness();

    const first = await claimFounderContentApprovalForExecutionGeneration(
      claimInput(GENERATION_A),
      harness.client,
    );
    const second = await claimFounderContentApprovalForExecutionGeneration(
      claimInput(GENERATION_A),
      harness.client,
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(harness.state.approvalConsumed).toBe(true);
  });
});
