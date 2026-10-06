import { describe, expect, it } from 'vitest';
import {
  ACTION_UNIT_USD,
  actionCostReceiptHash,
  buildActionCostReceipt,
  validateActionCostReceipt,
  validateActionCostReceiptInput,
  type ActionCostReceiptV1,
} from '../actionCostLedger.js';

function base(overrides: Record<string, unknown> = {}) {
  return {
    receiptId: 'receipt-1',
    projectSlug: 'truth-weaver',
    actionId: 'verified-research',
    actionClass: 'deep' as const,
    occurredAt: '2026-10-06T22:00:00.000Z',
    pricingVersion: 'portfolio-2026-10-v1',
    planId: 'truth-weaver-pro-79',
    billingSubjectRef: `sha256:${'a'.repeat(64)}`,
    sourceRef: 'mission:abc123',
    costBasis: 'provider-reported' as const,
    actualCostUsd: 0.42,
    monthRuntimeCostBeforeUsd: 8.70,
    monthlyRuntimeBudgetUsd: 11.46,
    planNetRevenueUsd: 76.40,
    usage: {
      provider: 'openai',
      model: 'gpt-6-sol',
      inputTokens: 12_000,
      outputTokens: 2_000,
      toolCalls: 3,
      tools: ['file-search', 'web-search'],
    },
    ...overrides,
  };
}

describe('action cost ledger', () => {
  it('converts measured cost into action units and budget state without granting mutation authority', () => {
    const receipt = buildActionCostReceipt(base());

    expect(ACTION_UNIT_USD).toBe(0.10);
    expect(receipt.actionUnits).toBe(4.2);
    expect(receipt.actionClassState).toBe('within');
    expect(receipt.monthRuntimeCostAfterUsd).toBe(9.12);
    expect(receipt.budgetRemainingUsd).toBe(2.34);
    expect(receipt.budgetUtilizationPct).toBeCloseTo(79.5812, 4);
    expect(receipt.budgetState).toBe('within');
    expect(receipt.costTruth).toBe('measured');
    expect(receipt.authority).toEqual({
      billingMutation: false,
      pricingMutation: false,
      subscriptionMutation: false,
      providerMutation: false,
    });
    expect(validateActionCostReceipt(receipt)).toEqual([]);
  });

  it('warns at 80 percent and marks over-budget receipts without suppressing the measured cost', () => {
    const warning = buildActionCostReceipt(base({
      actualCostUsd: 0.50,
      monthRuntimeCostBeforeUsd: 8.70,
    }));
    expect(warning.budgetUtilizationPct).toBeGreaterThanOrEqual(80);
    expect(warning.budgetState).toBe('warning');

    const exceeded = buildActionCostReceipt(base({
      actualCostUsd: 3.00,
      monthRuntimeCostBeforeUsd: 9.00,
    }));
    expect(exceeded.actualCostUsd).toBe(3);
    expect(exceeded.budgetState).toBe('exceeded');
    expect(exceeded.budgetRemainingUsd).toBe(0);
  });

  it('records an action-class overrun as evidence instead of rejecting or hiding it', () => {
    const receipt = buildActionCostReceipt(base({
      actionClass: 'standard',
      actualCostUsd: 0.34,
    }));

    expect(receipt.actionClassMaxUsd).toBe(0.10);
    expect(receipt.actionClassState).toBe('exceeded');
    expect(receipt.actionUnits).toBe(3.4);
  });

  it('keeps estimates visibly distinct from measured provider or invoice cost', () => {
    const estimated = buildActionCostReceipt(base({ costBasis: 'estimated' }));
    const reconciled = buildActionCostReceipt(base({ costBasis: 'invoice-reconciled' }));

    expect(estimated.costTruth).toBe('estimated');
    expect(reconciled.costTruth).toBe('measured');
  });

  it('requires billing subjects to be opaque sha256 references rather than raw identifiers', () => {
    expect(validateActionCostReceiptInput(base({ billingSubjectRef: 'ray@example.com' }) as never))
      .toContain('billingSubjectRef must be a sha256 opaque reference');
  });

  it('hash-binds cost, plan budget, usage, and derived economics', () => {
    const receipt = buildActionCostReceipt(base());
    const tampered: ActionCostReceiptV1 = {
      ...receipt,
      actualCostUsd: receipt.actualCostUsd + 1,
    };
    expect(validateActionCostReceipt(tampered))
      .toContain('receiptHash does not match canonical action-cost receipt');

    const { receiptHash: _ignored, ...identity } = receipt;
    expect(actionCostReceiptHash(identity)).toBe(receipt.receiptHash);
  });

  it('deduplicates tool names so reporting volume cannot inflate the receipt', () => {
    const receipt = buildActionCostReceipt(base({
      usage: {
        provider: 'openai',
        model: 'gpt-6-sol',
        inputTokens: 5,
        outputTokens: 2,
        toolCalls: 3,
        tools: ['web-search', 'web-search', 'file-search'],
      },
    }));

    expect(receipt.usage?.tools).toEqual(['file-search', 'web-search']);
  });

  it('treats a zero runtime budget as unbudgeted rather than silently green', () => {
    const receipt = buildActionCostReceipt(base({
      monthlyRuntimeBudgetUsd: 0,
      monthRuntimeCostBeforeUsd: 0,
      actualCostUsd: 0.01,
    }));

    expect(receipt.budgetState).toBe('unbudgeted');
    expect(receipt.budgetUtilizationPct).toBeNull();
    expect(receipt.budgetRemainingUsd).toBeNull();
  });
});
