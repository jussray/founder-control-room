import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  claimRevenueStrikeCustomerSendLease,
  executeRevenueStrikeCustomerSend,
  revenueStrikeRecipientFingerprint,
  type RevenueStrikeRpcClient,
} from '../revenueStrikeCustomerSendGate.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);
const CLAIM_ID = '22222222-2222-4222-8222-222222222222';
const CLAIMED_AT = '2026-09-12T19:15:00.000Z';

function baseInput() {
  return {
    runId: 'strike:2026-09-12',
    slot: 1,
    founderUserId: 'founder-user-1',
    claimedBy: 'revenue-strike-executor',
    recipient: 'Buyer@Example.com',
    prospectFingerprint: HASH_A,
    messageFingerprint: HASH_B,
    offerFingerprint: HASH_C,
    historicalLedgerDigest: HASH_D,
    replyGateClearObservedAt: '2026-09-12T19:10:00.000Z',
    subject: 'Bounded proof engagement',
    body: 'Short plain-text note.',
    now: CLAIMED_AT,
  };
}

function successRpc() {
  const recipientFingerprint = revenueStrikeRecipientFingerprint('buyer@example.com');
  return {
    rpc: vi.fn(async (name: string) => {
      if (name === 'claim_revenue_strike_customer_send_lease') {
        return {
          data: [{
            claim_id: CLAIM_ID,
            run_id: 'strike:2026-09-12',
            slot: 1,
            recipient_fingerprint: recipientFingerprint,
            claimed_at: CLAIMED_AT,
          }],
          error: null,
        };
      }
      return {
        data: [{
          claim_id: CLAIM_ID,
          provider_outcome: 'accepted',
          provider_receipt_id: 'gmail-receipt-1',
          finalized_at: '2026-09-12T19:16:00.000Z',
        }],
        error: null,
      };
    }),
  } as RevenueStrikeRpcClient;
}

describe('Revenue Strike customer send authority membrane', () => {
  it('derives recipient identity locally instead of trusting a caller-supplied fingerprint', () => {
    expect(revenueStrikeRecipientFingerprint(' Buyer@Example.com '))
      .toBe(revenueStrikeRecipientFingerprint('buyer@example.com'));
  });

  it('claims one durable lease before exactly one provider call and records provider acceptance', async () => {
    const rpcClient = successRpc();
    const provider = {
      send: vi.fn(async () => ({ accepted: true, receiptId: 'gmail-receipt-1' })),
    };

    const result = await executeRevenueStrikeCustomerSend(baseInput(), { rpcClient, provider });

    expect(result.ok).toBe(true);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(rpcClient.rpc).toHaveBeenCalledTimes(2);
    expect(rpcClient.rpc).toHaveBeenNthCalledWith(
      1,
      'claim_revenue_strike_customer_send_lease',
      expect.objectContaining({
        p_run_id: 'strike:2026-09-12',
        p_slot: 1,
        p_recipient_fingerprint: revenueStrikeRecipientFingerprint('buyer@example.com'),
        p_historical_ledger_digest: HASH_D,
      }),
    );
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: CLAIM_ID }));
    expect(rpcClient.rpc).toHaveBeenNthCalledWith(
      2,
      'finalize_revenue_strike_customer_send_lease',
      expect.objectContaining({
        p_claim_id: CLAIM_ID,
        p_provider_outcome: 'accepted',
        p_provider_receipt_id: 'gmail-receipt-1',
      }),
    );
  });

  it('never calls the provider when the durable lease is unavailable', async () => {
    const rpcClient = {
      rpc: vi.fn(async () => ({ data: [], error: null })),
    } as RevenueStrikeRpcClient;
    const provider = { send: vi.fn() };

    const result = await executeRevenueStrikeCustomerSend(baseInput(), { rpcClient, provider });

    expect(result).toMatchObject({ ok: false, code: 'LEASE_BLOCKED', providerCalls: 0, leaseConsumed: false });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('consumes the lease and forbids retry semantics when provider outcome is ambiguous', async () => {
    const rpcClient = successRpc();
    const provider = {
      send: vi.fn(async () => {
        throw new Error('network ended after provider call');
      }),
    };

    const result = await executeRevenueStrikeCustomerSend(baseInput(), { rpcClient, provider });

    expect(result).toMatchObject({
      ok: false,
      code: 'PROVIDER_OUTCOME_UNKNOWN',
      providerCalls: 1,
      leaseConsumed: true,
      claimId: CLAIM_ID,
    });
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(rpcClient.rpc).toHaveBeenCalledWith(
      'finalize_revenue_strike_customer_send_lease',
      expect.objectContaining({ p_claim_id: CLAIM_ID, p_provider_outcome: 'unknown' }),
    );
  });

  it('treats acceptance without a provider receipt as unknown and never retries', async () => {
    const rpcClient = successRpc();
    const provider = {
      send: vi.fn(async () => ({ accepted: true, receiptId: null })),
    };

    const result = await executeRevenueStrikeCustomerSend(baseInput(), { rpcClient, provider });

    expect(result).toMatchObject({
      ok: false,
      code: 'PROVIDER_OUTCOME_UNKNOWN',
      providerCalls: 1,
      leaseConsumed: true,
    });
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it('fails closed before provider mutation when the reply-first observation is malformed', async () => {
    const rpcClient = successRpc();
    const input = { ...baseInput(), replyGateClearObservedAt: 'not-a-time' };

    const result = await claimRevenueStrikeCustomerSendLease(input, rpcClient);

    expect(result).toEqual({
      ok: false,
      code: 'LEASE_STORE_FAILED',
      reason: 'fresh reply-first observation timestamp is required',
    });
    expect(rpcClient.rpc).not.toHaveBeenCalled();
  });

  it('pins the database membrane to five sends per run, global recipient uniqueness, fresh reply proof, and service-role-only execution', () => {
    const sql = readFileSync(
      new URL('../../../supabase/migrations/20260912191500_revenue_strike_customer_send_gate.sql', import.meta.url),
      'utf8',
    );

    expect(sql).toContain('unique (recipient_fingerprint)');
    expect(sql).toContain('unique (run_id, slot)');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("select count(*) from public.revenue_strike_customer_send_leases");
    expect(sql).toContain('>= 5');
    expect(sql).toContain("p_claimed_at - p_reply_gate_clear_at > interval '15 minutes'");
    expect(sql).toContain("provider_outcome = 'claimed'");
    expect(sql).toContain('grant execute on function public.claim_revenue_strike_customer_send_lease');
    expect(sql).toContain('grant execute on function public.finalize_revenue_strike_customer_send_lease');
    expect(sql).toContain('to service_role;');
    expect(sql).toContain('from authenticated;');
  });
});
