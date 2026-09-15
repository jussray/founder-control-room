import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  claimFounderContentApprovalForExecutionGeneration,
  type AtomicFounderContentExecutionClaimRpcClient,
} from '../atomicFounderContentExecutionClaim.js';

const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION = '2026-09-04T18:50:00.000Z';
const PROPOSAL_HASH = 'a'.repeat(64);
const PUBLIC_PAYLOAD_HASH = 'b'.repeat(64);
const AUTHORIZATION_HASH = 'c'.repeat(64);

function input() {
  return {
    executionId: EXECUTION_ID,
    executionStartedAt: GENERATION,
    approvalId: 'fca:atomic-claim-test',
    founderUserId: 'founder-user-1',
    proposalHash: PROPOSAL_HASH,
    publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    authorizationHash: AUTHORIZATION_HASH,
    consumedBy: 'founder@example.com',
    now: '2026-09-04T18:51:00.000Z',
  };
}

describe('atomic founder-content execution claim', () => {
  it('binds the exact execution generation and approval identity into one RPC call', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        approval: { approval_id: 'fca:atomic-claim-test' },
        approval_id: 'fca:atomic-claim-test',
        authorization_hash: AUTHORIZATION_HASH,
        public_payload_hash: PUBLIC_PAYLOAD_HASH,
        execution_started_at: GENERATION,
      }],
      error: null,
    }));
    const client = { rpc } as AtomicFounderContentExecutionClaimRpcClient;

    const result = await claimFounderContentApprovalForExecutionGeneration(input(), client);

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'claim_founder_content_approval_for_execution_generation',
      expect.objectContaining({
        p_execution_id: EXECUTION_ID,
        p_expected_started_at: GENERATION,
        p_approval_id: 'fca:atomic-claim-test',
        p_founder_user_id: 'founder-user-1',
        p_proposal_hash: PROPOSAL_HASH,
        p_public_payload_hash: PUBLIC_PAYLOAD_HASH,
        p_authorization_hash: AUTHORIZATION_HASH,
        p_consumed_by: 'founder@example.com',
        p_claimed_at: '2026-09-04T18:51:00.000Z',
      }),
    );
  });

  it('fails closed with no approval success when the exact generation no longer matches', async () => {
    const client = {
      rpc: vi.fn(async () => ({ data: [], error: null })),
    } as AtomicFounderContentExecutionClaimRpcClient;

    const result = await claimFounderContentApprovalForExecutionGeneration(input(), client);

    expect(result).toEqual({
      ok: false,
      code: 'CLAIM_NOT_CURRENT',
      reason: 'execution generation or authoritative founder approval is no longer current',
    });
  });

  it('treats an RPC error as an unknown store outcome instead of fabricating an unconsumed claim', async () => {
    const client = {
      rpc: vi.fn(async () => ({ data: null, error: { message: 'database unavailable' } })),
    } as AtomicFounderContentExecutionClaimRpcClient;

    const result = await claimFounderContentApprovalForExecutionGeneration(input(), client);

    expect(result).toEqual({
      ok: false,
      code: 'CLAIM_STORE_FAILED',
      reason: 'database unavailable',
    });
  });

  it('keeps the database primitive service-role-only and transactionally binds both ledgers', () => {
    const sql = readFileSync(
      new URL('../../../supabase/migrations/20260904190000_founder_content_atomic_execution_claim.sql', import.meta.url),
      'utf8',
    );

    expect(sql).toContain("and e.started_at = p_expected_started_at");
    expect(sql).toContain("coalesce(e.result->>'approval_claimed', 'false') = 'false'");
    expect(sql).toContain("from public.founder_content_approvals a");
    expect(sql).toContain("and a.consumed_at is null");
    expect(sql).toContain("update public.founder_content_approvals");
    expect(sql).toContain("update public.approval_executions");
    expect(sql).toContain("'approval_claimed', true");
    expect(sql).toContain('grant execute on function public.claim_founder_content_approval_for_execution_generation');
    expect(sql).toContain('to service_role;');
    expect(sql).toContain('revoke all on function public.claim_founder_content_approval_for_execution_generation');
    expect(sql).toContain('from authenticated;');
  });
});
