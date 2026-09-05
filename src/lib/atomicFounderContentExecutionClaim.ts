type JsonRecord = Record<string, unknown>;

export interface AtomicFounderContentExecutionClaimInput {
  executionId: string;
  executionStartedAt: string;
  approvalId: string;
  founderUserId: string;
  proposalHash: string;
  publicPayloadHash: string;
  authorizationHash: string;
  consumedBy: string;
  now: string;
}

export interface AtomicFounderContentExecutionClaimSuccess {
  ok: true;
  approval: JsonRecord;
  approvalId: string;
  authorizationHash: string;
  publicPayloadHash: string;
  executionStartedAt: string;
}

export interface AtomicFounderContentExecutionClaimFailure {
  ok: false;
  code: 'CLAIM_NOT_CURRENT' | 'CLAIM_STORE_FAILED';
  reason: string;
}

export type AtomicFounderContentExecutionClaimResult =
  | AtomicFounderContentExecutionClaimSuccess
  | AtomicFounderContentExecutionClaimFailure;

export interface AtomicFounderContentExecutionClaimRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function firstRow(data: unknown): JsonRecord | null {
  if (Array.isArray(data)) {
    return data[0] && typeof data[0] === 'object' && !Array.isArray(data[0])
      ? data[0] as JsonRecord
      : null;
  }
  return data && typeof data === 'object' && !Array.isArray(data) ? data as JsonRecord : null;
}

function invalidInput(input: AtomicFounderContentExecutionClaimInput): string | null {
  if (!text(input.executionId)) return 'execution id is required for atomic founder-content claim';
  if (!text(input.executionStartedAt) || !Number.isFinite(Date.parse(input.executionStartedAt))) {
    return 'authoritative execution started_at generation is required for atomic founder-content claim';
  }
  if (!text(input.approvalId)) return 'approval id is required for atomic founder-content claim';
  if (!text(input.founderUserId)) return 'authenticated founder user id is required for atomic founder-content claim';
  if (!/^[0-9a-f]{64}$/i.test(text(input.proposalHash))) return 'proposal hash is invalid for atomic founder-content claim';
  if (!/^[0-9a-f]{64}$/i.test(text(input.publicPayloadHash))) return 'public payload hash is invalid for atomic founder-content claim';
  if (!/^[0-9a-f]{64}$/i.test(text(input.authorizationHash))) return 'authorization hash is invalid for atomic founder-content claim';
  if (!text(input.consumedBy)) return 'authenticated founder execution identity is required for atomic founder-content claim';
  if (!text(input.now) || !Number.isFinite(Date.parse(input.now))) return 'fresh claim timestamp is invalid';
  return null;
}

export async function claimFounderContentApprovalForExecutionGeneration(
  input: AtomicFounderContentExecutionClaimInput,
  rpcClient?: AtomicFounderContentExecutionClaimRpcClient,
): Promise<AtomicFounderContentExecutionClaimResult> {
  const invalid = invalidInput(input);
  if (invalid) return { ok: false, code: 'CLAIM_STORE_FAILED', reason: invalid };

  const client = rpcClient ?? ((await import('./supabaseClient.js')).supabase as unknown as AtomicFounderContentExecutionClaimRpcClient);
  let response: { data: unknown; error: { message?: string } | null };
  try {
    response = await client.rpc('claim_founder_content_approval_for_execution_generation', {
      p_execution_id: text(input.executionId),
      p_expected_started_at: new Date(input.executionStartedAt).toISOString(),
      p_approval_id: text(input.approvalId).toLowerCase(),
      p_founder_user_id: text(input.founderUserId),
      p_proposal_hash: text(input.proposalHash).toLowerCase(),
      p_public_payload_hash: text(input.publicPayloadHash).toLowerCase(),
      p_authorization_hash: text(input.authorizationHash).toLowerCase(),
      p_consumed_by: text(input.consumedBy),
      p_claimed_at: new Date(input.now).toISOString(),
    });
  } catch (error) {
    return {
      ok: false,
      code: 'CLAIM_STORE_FAILED',
      reason: error instanceof Error ? error.message : 'atomic founder-content claim RPC failed',
    };
  }

  if (response.error) {
    return {
      ok: false,
      code: 'CLAIM_STORE_FAILED',
      reason: text(response.error.message) || 'atomic founder-content claim RPC failed',
    };
  }

  const row = firstRow(response.data);
  if (!row) {
    return {
      ok: false,
      code: 'CLAIM_NOT_CURRENT',
      reason: 'execution generation or authoritative founder approval is no longer current',
    };
  }

  const approvalId = text(row.approval_id).toLowerCase();
  const authorizationHash = text(row.authorization_hash).toLowerCase();
  const publicPayloadHash = text(row.public_payload_hash).toLowerCase();
  const executionStartedAt = text(row.execution_started_at);
  if (
    approvalId !== text(input.approvalId).toLowerCase()
    || authorizationHash !== text(input.authorizationHash).toLowerCase()
    || publicPayloadHash !== text(input.publicPayloadHash).toLowerCase()
    || !executionStartedAt
    || Date.parse(executionStartedAt) !== Date.parse(input.executionStartedAt)
  ) {
    return {
      ok: false,
      code: 'CLAIM_STORE_FAILED',
      reason: 'atomic founder-content claim returned mismatched authority evidence',
    };
  }

  return {
    ok: true,
    approval: record(row.approval),
    approvalId,
    authorizationHash,
    publicPayloadHash,
    executionStartedAt: new Date(executionStartedAt).toISOString(),
  };
}
