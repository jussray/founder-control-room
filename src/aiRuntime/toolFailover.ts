export type ToolEffect = 'read_only' | 'idempotent_write' | 'non_idempotent_write';
export type ToolOutcome = 'not_started' | 'succeeded' | 'confirmed_not_applied' | 'unknown';

export type ToolFailoverAction =
  | 'retry_model'
  | 'retry_tool'
  | 'reuse_result_for_synthesis'
  | 'reconcile_before_retry';

export interface ToolFailoverContext {
  effect: ToolEffect;
  outcome: ToolOutcome;
  idempotencyKey?: string | null;
  externalIdempotencyGuaranteed?: boolean;
}

export interface ToolFailoverDecision {
  safeToFailOverModel: boolean;
  safeToReplayTool: boolean;
  action: ToolFailoverAction;
  reason: string;
}

/**
 * Provider failure and tool execution are different failure planes.
 *
 * This function deliberately does not execute or journal anything. FCR's
 * mission/project/action execution ledger remains authoritative for writes.
 * The runtime only decides whether model failover or tool replay is safe from
 * the already-observed execution state.
 */
export function decideToolFailover(context: ToolFailoverContext): ToolFailoverDecision {
  if (context.outcome === 'not_started') {
    return {
      safeToFailOverModel: true,
      safeToReplayTool: false,
      action: 'retry_model',
      reason: 'No tool execution began, so provider failover cannot duplicate an external side effect.',
    };
  }

  if (context.outcome === 'succeeded') {
    return {
      safeToFailOverModel: true,
      safeToReplayTool: false,
      action: 'reuse_result_for_synthesis',
      reason: 'The tool already succeeded; a fallback model may synthesize from the recorded result but must not replay the tool.',
    };
  }

  if (context.effect === 'read_only') {
    return {
      safeToFailOverModel: true,
      safeToReplayTool: true,
      action: 'retry_tool',
      reason: 'A read-only tool has no external mutation to duplicate.',
    };
  }

  if (context.outcome === 'confirmed_not_applied') {
    const idempotencyReady = context.effect === 'idempotent_write'
      && Boolean(context.idempotencyKey?.trim())
      && context.externalIdempotencyGuaranteed === true;

    if (context.effect === 'non_idempotent_write' || !idempotencyReady) {
      return {
        safeToFailOverModel: true,
        safeToReplayTool: false,
        action: 'retry_model',
        reason: 'The write is confirmed not applied, so model failover is safe, but tool replay still lacks a proven deduplication boundary.',
      };
    }

    return {
      safeToFailOverModel: true,
      safeToReplayTool: true,
      action: 'retry_tool',
      reason: 'The idempotent write is confirmed not applied and the external provider guarantees deduplication for the same key.',
    };
  }

  return {
    safeToFailOverModel: false,
    safeToReplayTool: false,
    action: 'reconcile_before_retry',
    reason: 'A write may have executed. Reconcile the authoritative execution ledger and external provider outcome before any retry or model failover.',
  };
}
