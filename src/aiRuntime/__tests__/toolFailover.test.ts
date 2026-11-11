import { describe, expect, it } from 'vitest';
import { decideToolFailover } from '../toolFailover.js';

describe('decideToolFailover', () => {
  it('allows model failover before any tool execution starts', () => {
    expect(decideToolFailover({
      effect: 'non_idempotent_write',
      outcome: 'not_started',
    })).toMatchObject({
      safeToFailOverModel: true,
      safeToReplayTool: false,
      action: 'retry_model',
    });
  });

  it('reuses a successful tool result for answer synthesis without replaying the tool', () => {
    expect(decideToolFailover({
      effect: 'non_idempotent_write',
      outcome: 'succeeded',
    })).toMatchObject({
      safeToFailOverModel: true,
      safeToReplayTool: false,
      action: 'reuse_result_for_synthesis',
    });
  });

  it('permits a read-only tool retry after an unknown provider interruption', () => {
    expect(decideToolFailover({
      effect: 'read_only',
      outcome: 'unknown',
    })).toMatchObject({
      safeToFailOverModel: true,
      safeToReplayTool: true,
      action: 'retry_tool',
    });
  });

  it('permits an idempotent write retry only when non-application and external deduplication are both proven', () => {
    expect(decideToolFailover({
      effect: 'idempotent_write',
      outcome: 'confirmed_not_applied',
      idempotencyKey: 'mission-1:action-1',
      externalIdempotencyGuaranteed: true,
    })).toMatchObject({
      safeToFailOverModel: true,
      safeToReplayTool: true,
      action: 'retry_tool',
    });
  });

  it('blocks provider failover and replay when a write outcome is unknown', () => {
    expect(decideToolFailover({
      effect: 'idempotent_write',
      outcome: 'unknown',
      idempotencyKey: 'mission-1:action-1',
      externalIdempotencyGuaranteed: true,
    })).toMatchObject({
      safeToFailOverModel: false,
      safeToReplayTool: false,
      action: 'reconcile_before_retry',
    });
  });

  it('does not replay a non-idempotent write even when the provider confirms it was not applied', () => {
    expect(decideToolFailover({
      effect: 'non_idempotent_write',
      outcome: 'confirmed_not_applied',
    })).toMatchObject({
      safeToFailOverModel: true,
      safeToReplayTool: false,
      action: 'retry_model',
    });
  });
});
