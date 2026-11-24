import { createHash } from 'node:crypto';

type JsonRecord = Record<string, unknown>;

export const REVENUE_STRIKE_CUSTOMER_SEND_CONTRACT = 'fcr/revenue-strike-customer-send@v1' as const;

export interface RevenueStrikeRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
}

export interface RevenueStrikeCustomerEmailProvider {
  send(input: {
    recipient: string;
    subject: string;
    body: string;
    idempotencyKey: string;
  }): Promise<{ accepted: boolean; receiptId?: string | null }>;
}

export interface RevenueStrikeCustomerSendInput {
  runId: string;
  slot: number;
  founderUserId: string;
  claimedBy: string;
  recipient: string;
  prospectFingerprint: string;
  messageFingerprint: string;
  offerFingerprint: string;
  historicalLedgerDigest: string;
  replyGateClearObservedAt: string;
  subject: string;
  body: string;
  now?: string;
}

interface RevenueStrikeLeaseSuccess {
  ok: true;
  claimId: string;
  runId: string;
  slot: number;
  recipientFingerprint: string;
  claimedAt: string;
}

interface RevenueStrikeLeaseFailure {
  ok: false;
  code: 'LEASE_NOT_AVAILABLE' | 'LEASE_STORE_FAILED';
  reason: string;
}

export type RevenueStrikeLeaseResult = RevenueStrikeLeaseSuccess | RevenueStrikeLeaseFailure;

export type RevenueStrikeSendResult =
  | {
      ok: true;
      contract: typeof REVENUE_STRIKE_CUSTOMER_SEND_CONTRACT;
      claimId: string;
      providerReceiptId: string;
      recipientFingerprint: string;
      providerCalls: 1;
      leaseConsumed: true;
    }
  | {
      ok: false;
      contract: typeof REVENUE_STRIKE_CUSTOMER_SEND_CONTRACT;
      code:
        | 'LEASE_BLOCKED'
        | 'PROVIDER_REJECTED'
        | 'PROVIDER_OUTCOME_UNKNOWN'
        | 'POST_PROVIDER_RECONCILIATION_FAILED';
      reason: string;
      providerCalls: 0 | 1;
      leaseConsumed: boolean;
      claimId?: string;
      recipientFingerprint?: string;
    };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstRow(data: unknown): JsonRecord | null {
  if (Array.isArray(data)) {
    return data[0] && typeof data[0] === 'object' && !Array.isArray(data[0])
      ? data[0] as JsonRecord
      : null;
  }
  return data && typeof data === 'object' && !Array.isArray(data) ? data as JsonRecord : null;
}

function validHash(value: unknown): boolean {
  return /^[0-9a-f]{64}$/i.test(text(value));
}

function validTime(value: unknown): boolean {
  const raw = text(value);
  return Boolean(raw) && Number.isFinite(Date.parse(raw));
}

export function revenueStrikeRecipientFingerprint(recipient: string): string {
  const normalized = text(recipient).toLowerCase();
  if (!normalized || !normalized.includes('@')) throw new Error('valid recipient email is required');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function validateClaimInput(input: RevenueStrikeCustomerSendInput, now: string): string | null {
  if (!text(input.runId)) return 'run id is required';
  if (!Number.isInteger(input.slot) || input.slot < 1 || input.slot > 5) return 'slot must be an integer from 1 through 5';
  if (!text(input.founderUserId)) return 'authenticated founder user id is required';
  if (!text(input.claimedBy)) return 'authenticated execution identity is required';
  if (!validHash(input.prospectFingerprint)) return 'prospect fingerprint must be sha256';
  if (!validHash(input.messageFingerprint)) return 'message fingerprint must be sha256';
  if (!validHash(input.offerFingerprint)) return 'offer fingerprint must be sha256';
  if (!validHash(input.historicalLedgerDigest)) return 'historical ledger digest must be sha256';
  if (!validTime(input.replyGateClearObservedAt)) return 'fresh reply-first observation timestamp is required';
  if (!validTime(now)) return 'claim timestamp is invalid';
  if (!text(input.subject) || !text(input.body)) return 'plain-text subject and body are required';
  return null;
}

async function defaultRpcClient(): Promise<RevenueStrikeRpcClient> {
  const { supabase } = await import('./supabaseClient.js');
  return supabase as unknown as RevenueStrikeRpcClient;
}

export async function claimRevenueStrikeCustomerSendLease(
  input: RevenueStrikeCustomerSendInput,
  rpcClient?: RevenueStrikeRpcClient,
): Promise<RevenueStrikeLeaseResult> {
  const now = input.now ?? new Date().toISOString();
  const invalid = validateClaimInput(input, now);
  if (invalid) return { ok: false, code: 'LEASE_STORE_FAILED', reason: invalid };

  let recipientFingerprint: string;
  try {
    recipientFingerprint = revenueStrikeRecipientFingerprint(input.recipient);
  } catch (error) {
    return {
      ok: false,
      code: 'LEASE_STORE_FAILED',
      reason: error instanceof Error ? error.message : 'recipient fingerprint failed',
    };
  }

  const client = rpcClient ?? await defaultRpcClient();
  let response: { data: unknown; error: { message?: string } | null };
  try {
    response = await client.rpc('claim_revenue_strike_customer_send_lease', {
      p_run_id: text(input.runId),
      p_slot: input.slot,
      p_founder_user_id: text(input.founderUserId),
      p_recipient_fingerprint: recipientFingerprint,
      p_prospect_fingerprint: text(input.prospectFingerprint).toLowerCase(),
      p_message_fingerprint: text(input.messageFingerprint).toLowerCase(),
      p_offer_fingerprint: text(input.offerFingerprint).toLowerCase(),
      p_historical_ledger_digest: text(input.historicalLedgerDigest).toLowerCase(),
      p_reply_gate_clear_at: new Date(input.replyGateClearObservedAt).toISOString(),
      p_claimed_by: text(input.claimedBy),
      p_claimed_at: new Date(now).toISOString(),
    });
  } catch (error) {
    return {
      ok: false,
      code: 'LEASE_STORE_FAILED',
      reason: error instanceof Error ? error.message : 'customer send lease RPC failed',
    };
  }

  if (response.error) {
    return {
      ok: false,
      code: 'LEASE_STORE_FAILED',
      reason: text(response.error.message) || 'customer send lease RPC failed',
    };
  }

  const row = firstRow(response.data);
  if (!row) {
    return {
      ok: false,
      code: 'LEASE_NOT_AVAILABLE',
      reason: 'customer send lease is unavailable because the run is closed, the slot/recipient was already consumed, or the reply-first evidence is stale',
    };
  }

  const claimId = text(row.claim_id);
  const returnedRunId = text(row.run_id);
  const returnedRecipientFingerprint = text(row.recipient_fingerprint).toLowerCase();
  const claimedAt = text(row.claimed_at);
  const returnedSlot = Number(row.slot);
  if (
    !claimId
    || returnedRunId !== text(input.runId)
    || returnedSlot !== input.slot
    || returnedRecipientFingerprint !== recipientFingerprint
    || !validTime(claimedAt)
  ) {
    return {
      ok: false,
      code: 'LEASE_STORE_FAILED',
      reason: 'customer send lease returned mismatched authority evidence',
    };
  }

  return {
    ok: true,
    claimId,
    runId: returnedRunId,
    slot: returnedSlot,
    recipientFingerprint,
    claimedAt: new Date(claimedAt).toISOString(),
  };
}

async function finalizeLease(input: {
  claimId: string;
  founderUserId: string;
  outcome: 'accepted' | 'rejected' | 'unknown';
  providerReceiptId?: string | null;
  finalizedAt: string;
}, rpcClient: RevenueStrikeRpcClient): Promise<boolean> {
  try {
    const expectedReceiptId = text(input.providerReceiptId);
    const response = await rpcClient.rpc('finalize_revenue_strike_customer_send_lease', {
      p_claim_id: input.claimId,
      p_founder_user_id: text(input.founderUserId),
      p_provider_outcome: input.outcome,
      p_provider_receipt_id: expectedReceiptId || null,
      p_finalized_at: new Date(input.finalizedAt).toISOString(),
    });
    if (response.error) return false;

    const row = firstRow(response.data);
    if (!row) return false;

    return text(row.claim_id) === input.claimId
      && text(row.provider_outcome) === input.outcome
      && text(row.provider_receipt_id) === expectedReceiptId
      && validTime(row.finalized_at);
  } catch {
    return false;
  }
}

export async function executeRevenueStrikeCustomerSend(
  input: RevenueStrikeCustomerSendInput,
  dependencies: {
    rpcClient?: RevenueStrikeRpcClient;
    provider: RevenueStrikeCustomerEmailProvider;
  },
): Promise<RevenueStrikeSendResult> {
  const rpcClient = dependencies.rpcClient ?? await defaultRpcClient();
  const lease = await claimRevenueStrikeCustomerSendLease(input, rpcClient);
  if (!lease.ok) {
    return {
      ok: false,
      contract: REVENUE_STRIKE_CUSTOMER_SEND_CONTRACT,
      code: 'LEASE_BLOCKED',
      reason: lease.reason,
      providerCalls: 0,
      leaseConsumed: false,
    };
  }

  let providerResult: { accepted: boolean; receiptId?: string | null };
  try {
    providerResult = await dependencies.provider.send({
      recipient: text(input.recipient).toLowerCase(),
      subject: text(input.subject),
      body: input.body,
      idempotencyKey: lease.claimId,
    });
  } catch (error) {
    await finalizeLease({
      claimId: lease.claimId,
      founderUserId: input.founderUserId,
      outcome: 'unknown',
      finalizedAt: new Date().toISOString(),
    }, rpcClient);
    return {
      ok: false,
      contract: REVENUE_STRIKE_CUSTOMER_SEND_CONTRACT,
      code: 'PROVIDER_OUTCOME_UNKNOWN',
      reason: error instanceof Error ? error.message : 'provider outcome is unknown; lease remains consumed and retry is forbidden',
      providerCalls: 1,
      leaseConsumed: true,
      claimId: lease.claimId,
      recipientFingerprint: lease.recipientFingerprint,
    };
  }

  const receiptId = text(providerResult.receiptId);
  const outcome: 'accepted' | 'rejected' | 'unknown' = providerResult.accepted
    ? (receiptId ? 'accepted' : 'unknown')
    : 'rejected';
  const reconciled = await finalizeLease({
    claimId: lease.claimId,
    founderUserId: input.founderUserId,
    outcome,
    providerReceiptId: receiptId || null,
    finalizedAt: new Date().toISOString(),
  }, rpcClient);

  if (!reconciled) {
    return {
      ok: false,
      contract: REVENUE_STRIKE_CUSTOMER_SEND_CONTRACT,
      code: 'POST_PROVIDER_RECONCILIATION_FAILED',
      reason: 'provider was called but the terminal lease receipt could not be reconciled; lease remains consumed and retry is forbidden',
      providerCalls: 1,
      leaseConsumed: true,
      claimId: lease.claimId,
      recipientFingerprint: lease.recipientFingerprint,
    };
  }

  if (outcome === 'accepted') {
    return {
      ok: true,
      contract: REVENUE_STRIKE_CUSTOMER_SEND_CONTRACT,
      claimId: lease.claimId,
      providerReceiptId: receiptId,
      recipientFingerprint: lease.recipientFingerprint,
      providerCalls: 1,
      leaseConsumed: true,
    };
  }

  return {
    ok: false,
    contract: REVENUE_STRIKE_CUSTOMER_SEND_CONTRACT,
    code: outcome === 'rejected' ? 'PROVIDER_REJECTED' : 'PROVIDER_OUTCOME_UNKNOWN',
    reason: outcome === 'rejected'
      ? 'provider rejected the send; lease remains consumed and retry is forbidden'
      : 'provider reported acceptance without an authoritative receipt; outcome is unknown and retry is forbidden',
    providerCalls: 1,
    leaseConsumed: true,
    claimId: lease.claimId,
    recipientFingerprint: lease.recipientFingerprint,
  };
}
