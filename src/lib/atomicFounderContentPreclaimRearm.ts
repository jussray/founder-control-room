type JsonRecord = Record<string, unknown>;

export interface AtomicFounderContentPreclaimRearmInput {
  executionId: string;
  expectedStatus: 'pending' | 'failed';
  expectedStartedAt: string;
  newStartedAt: string;
  executedBy: string;
  request: JsonRecord;
  resumedFromFailed: boolean;
  resumedFromAbandoned: boolean;
}

export interface AtomicFounderContentPreclaimRearmSuccess {
  ok: true;
  executionId: string;
  projectId: string;
  executionStartedAt: string;
}

export interface AtomicFounderContentPreclaimRearmFailure {
  ok: false;
  code: 'REARM_NOT_CURRENT' | 'REARM_STORE_FAILED';
  reason: string;
}

export type AtomicFounderContentPreclaimRearmResult =
  | AtomicFounderContentPreclaimRearmSuccess
  | AtomicFounderContentPreclaimRearmFailure;

export interface AtomicFounderContentPreclaimRearmRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
}

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

export async function rearmFounderContentPreclaimExecution(
  input: AtomicFounderContentPreclaimRearmInput,
  rpcClient?: AtomicFounderContentPreclaimRearmRpcClient,
): Promise<AtomicFounderContentPreclaimRearmResult> {
  const expectedStartedMs = Date.parse(text(input.expectedStartedAt));
  const newStartedMs = Date.parse(text(input.newStartedAt));
  if (!text(input.executionId)) {
    return { ok: false, code: 'REARM_STORE_FAILED', reason: 'execution id is required for preclaim rearm' };
  }
  if (input.expectedStatus !== 'pending' && input.expectedStatus !== 'failed') {
    return { ok: false, code: 'REARM_STORE_FAILED', reason: 'expected execution status is invalid for preclaim rearm' };
  }
  if (!Number.isFinite(expectedStartedMs) || !Number.isFinite(newStartedMs) || newStartedMs <= expectedStartedMs) {
    return { ok: false, code: 'REARM_STORE_FAILED', reason: 'preclaim rearm requires a strictly newer started_at generation' };
  }
  if (!text(input.executedBy)) {
    return { ok: false, code: 'REARM_STORE_FAILED', reason: 'authenticated execution identity is required for preclaim rearm' };
  }

  const client = rpcClient ?? ((await import('./supabaseClient.js')).supabase as unknown as AtomicFounderContentPreclaimRearmRpcClient);
  let response: { data: unknown; error: { message?: string } | null };
  try {
    response = await client.rpc('rearm_founder_content_preclaim_execution', {
      p_execution_id: text(input.executionId),
      p_expected_status: input.expectedStatus,
      p_expected_started_at: new Date(expectedStartedMs).toISOString(),
      p_new_started_at: new Date(newStartedMs).toISOString(),
      p_executed_by: text(input.executedBy),
      p_request: input.request,
      p_resumed_from_failed: input.resumedFromFailed,
      p_resumed_from_abandoned: input.resumedFromAbandoned,
    });
  } catch (error) {
    return {
      ok: false,
      code: 'REARM_STORE_FAILED',
      reason: error instanceof Error ? error.message : 'preclaim rearm RPC failed',
    };
  }

  if (response.error) {
    return {
      ok: false,
      code: 'REARM_STORE_FAILED',
      reason: text(response.error.message) || 'preclaim rearm RPC failed',
    };
  }

  const row = firstRow(response.data);
  if (!row) {
    return {
      ok: false,
      code: 'REARM_NOT_CURRENT',
      reason: 'preclaim execution generation is no longer recoverable',
    };
  }

  const executionId = text(row.execution_id);
  const projectId = text(row.project_id);
  const executionStartedAt = text(row.execution_started_at);
  if (
    executionId !== text(input.executionId)
    || !projectId
    || !executionStartedAt
    || Date.parse(executionStartedAt) !== newStartedMs
  ) {
    return {
      ok: false,
      code: 'REARM_STORE_FAILED',
      reason: 'preclaim rearm returned mismatched execution-generation evidence',
    };
  }

  return {
    ok: true,
    executionId,
    projectId,
    executionStartedAt: new Date(executionStartedAt).toISOString(),
  };
}
