import { createHash } from 'node:crypto';

export const ACTION_COST_RECEIPT_CONTRACT = 'juss/action-cost-receipt@v1' as const;
export const ACTION_UNIT_USD = 0.10 as const;
export const BUDGET_WARNING_RATIO = 0.80 as const;

export const ACTION_COST_CLASS_MAX_USD = Object.freeze({
  light: 0.01,
  standard: 0.10,
  deep: 0.50,
  agent: 1.50,
} as const);

export type ActionCostClass = keyof typeof ACTION_COST_CLASS_MAX_USD;
export type ActionCostBasis = 'provider-reported' | 'invoice-reconciled' | 'estimated';
export type ActionCostTruth = 'measured' | 'estimated';
export type ActionClassState = 'within' | 'exceeded';
export type ActionBudgetState = 'within' | 'warning' | 'exceeded' | 'unbudgeted';

export interface ActionCostUsageV1 {
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  toolCalls?: number | null;
  tools?: string[];
}

export interface ActionCostReceiptInputV1 {
  receiptId: string;
  projectSlug: string;
  actionId: string;
  actionClass: ActionCostClass;
  occurredAt: string;
  pricingVersion: string;
  planId: string;
  billingSubjectRef?: string | null;
  sourceRef?: string | null;
  costBasis: ActionCostBasis;
  actualCostUsd: number;
  monthRuntimeCostBeforeUsd: number;
  monthlyRuntimeBudgetUsd: number;
  planNetRevenueUsd?: number | null;
  usage?: ActionCostUsageV1 | null;
}

export interface ActionCostReceiptV1 extends ActionCostReceiptInputV1 {
  contract: typeof ACTION_COST_RECEIPT_CONTRACT;
  costTruth: ActionCostTruth;
  actionUnits: number;
  actionClassMaxUsd: number;
  actionClassState: ActionClassState;
  monthRuntimeCostAfterUsd: number;
  budgetRemainingUsd: number | null;
  budgetUtilizationPct: number | null;
  budgetState: ActionBudgetState;
  runtimeContributionMarginPct: number | null;
  authority: {
    billingMutation: false;
    pricingMutation: false;
    subscriptionMutation: false;
    providerMutation: false;
  };
  receiptHash: string;
}

const HASHED_SUBJECT = /^sha256:[0-9a-f]{64}$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SAFE_TOOL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$/;

function round(value: number, precision = 6): number {
  const scale = 10 ** precision;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function safeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}

function normalizeUsage(usage: ActionCostUsageV1 | null | undefined): ActionCostUsageV1 | null {
  if (!usage) return null;
  const tools = Array.isArray(usage.tools)
    ? [...new Set(usage.tools.map((tool) => tool.trim()).filter(Boolean))].sort()
    : undefined;
  return {
    provider: normalizeOptional(usage.provider),
    model: normalizeOptional(usage.model),
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    toolCalls: usage.toolCalls ?? null,
    ...(tools ? { tools } : {}),
  };
}

function receiptIdentity(receipt: Omit<ActionCostReceiptV1, 'receiptHash'>): unknown[] {
  return [
    receipt.contract,
    receipt.receiptId,
    receipt.projectSlug,
    receipt.actionId,
    receipt.actionClass,
    receipt.occurredAt,
    receipt.pricingVersion,
    receipt.planId,
    receipt.billingSubjectRef ?? null,
    receipt.sourceRef ?? null,
    receipt.costBasis,
    receipt.actualCostUsd,
    receipt.monthRuntimeCostBeforeUsd,
    receipt.monthlyRuntimeBudgetUsd,
    receipt.planNetRevenueUsd ?? null,
    receipt.usage ? [
      receipt.usage.provider ?? null,
      receipt.usage.model ?? null,
      receipt.usage.inputTokens ?? null,
      receipt.usage.outputTokens ?? null,
      receipt.usage.toolCalls ?? null,
      [...(receipt.usage.tools ?? [])].sort(),
    ] : null,
    receipt.costTruth,
    receipt.actionUnits,
    receipt.actionClassMaxUsd,
    receipt.actionClassState,
    receipt.monthRuntimeCostAfterUsd,
    receipt.budgetRemainingUsd,
    receipt.budgetUtilizationPct,
    receipt.budgetState,
    receipt.runtimeContributionMarginPct,
    false,
    false,
    false,
    false,
  ];
}

export function actionCostReceiptHash(receipt: Omit<ActionCostReceiptV1, 'receiptHash'>): string {
  return createHash('sha256').update(JSON.stringify(receiptIdentity(receipt))).digest('hex');
}

export function validateActionCostReceiptInput(input: ActionCostReceiptInputV1): string[] {
  const errors: string[] = [];
  if (!SAFE_IDENTIFIER.test(input.receiptId?.trim() ?? '')) errors.push('receiptId is invalid');
  if (!SAFE_IDENTIFIER.test(input.projectSlug?.trim() ?? '')) errors.push('projectSlug is invalid');
  if (!SAFE_IDENTIFIER.test(input.actionId?.trim() ?? '')) errors.push('actionId is invalid');
  if (!Object.prototype.hasOwnProperty.call(ACTION_COST_CLASS_MAX_USD, input.actionClass)) errors.push('actionClass is invalid');
  if (!Number.isFinite(Date.parse(input.occurredAt))) errors.push('occurredAt must be RFC3339-compatible');
  if (!SAFE_IDENTIFIER.test(input.pricingVersion?.trim() ?? '')) errors.push('pricingVersion is invalid');
  if (!SAFE_IDENTIFIER.test(input.planId?.trim() ?? '')) errors.push('planId is invalid');
  if (input.billingSubjectRef && !HASHED_SUBJECT.test(input.billingSubjectRef.trim())) {
    errors.push('billingSubjectRef must be a sha256 opaque reference');
  }
  if (input.sourceRef && input.sourceRef.trim().length > 256) errors.push('sourceRef exceeds 256 characters');
  if (!['provider-reported', 'invoice-reconciled', 'estimated'].includes(input.costBasis)) {
    errors.push('costBasis is invalid');
  }
  for (const [field, value] of [
    ['actualCostUsd', input.actualCostUsd],
    ['monthRuntimeCostBeforeUsd', input.monthRuntimeCostBeforeUsd],
    ['monthlyRuntimeBudgetUsd', input.monthlyRuntimeBudgetUsd],
  ] as const) {
    if (!finiteNonNegative(value)) errors.push(`${field} must be a finite non-negative number`);
  }
  if (input.planNetRevenueUsd !== undefined && input.planNetRevenueUsd !== null && !finiteNonNegative(input.planNetRevenueUsd)) {
    errors.push('planNetRevenueUsd must be a finite non-negative number');
  }
  if (input.usage) {
    for (const field of ['inputTokens', 'outputTokens', 'toolCalls'] as const) {
      const value = input.usage[field];
      if (value !== undefined && value !== null && !safeCount(value)) {
        errors.push(`usage.${field} must be a non-negative safe integer`);
      }
    }
    if (input.usage.provider && input.usage.provider.trim().length > 64) errors.push('usage.provider exceeds 64 characters');
    if (input.usage.model && input.usage.model.trim().length > 128) errors.push('usage.model exceeds 128 characters');
    if (input.usage.tools) {
      if (input.usage.tools.length > 16) errors.push('usage.tools exceeds 16 entries');
      if (input.usage.tools.some((tool) => !SAFE_TOOL.test(tool.trim()))) errors.push('usage.tools contains an invalid tool identifier');
    }
  }
  return [...new Set(errors)];
}

export function buildActionCostReceipt(input: ActionCostReceiptInputV1): ActionCostReceiptV1 {
  const errors = validateActionCostReceiptInput(input);
  if (errors.length) throw new Error(`invalid action-cost receipt: ${errors.join('; ')}`);

  const actualCostUsd = round(input.actualCostUsd);
  const monthRuntimeCostBeforeUsd = round(input.monthRuntimeCostBeforeUsd);
  const monthlyRuntimeBudgetUsd = round(input.monthlyRuntimeBudgetUsd);
  const planNetRevenueUsd = input.planNetRevenueUsd === undefined || input.planNetRevenueUsd === null
    ? null
    : round(input.planNetRevenueUsd);
  const actionClassMaxUsd = ACTION_COST_CLASS_MAX_USD[input.actionClass];
  const monthRuntimeCostAfterUsd = round(monthRuntimeCostBeforeUsd + actualCostUsd);
  const budgetRemainingUsd = monthlyRuntimeBudgetUsd > 0
    ? round(Math.max(0, monthlyRuntimeBudgetUsd - monthRuntimeCostAfterUsd))
    : null;
  const budgetUtilizationPct = monthlyRuntimeBudgetUsd > 0
    ? round((monthRuntimeCostAfterUsd / monthlyRuntimeBudgetUsd) * 100, 4)
    : null;
  const budgetState: ActionBudgetState = monthlyRuntimeBudgetUsd <= 0
    ? 'unbudgeted'
    : monthRuntimeCostAfterUsd > monthlyRuntimeBudgetUsd
      ? 'exceeded'
      : monthRuntimeCostAfterUsd >= monthlyRuntimeBudgetUsd * BUDGET_WARNING_RATIO
        ? 'warning'
        : 'within';
  const runtimeContributionMarginPct = planNetRevenueUsd && planNetRevenueUsd > 0
    ? round(((planNetRevenueUsd - monthRuntimeCostAfterUsd) / planNetRevenueUsd) * 100, 4)
    : null;

  const withoutHash: Omit<ActionCostReceiptV1, 'receiptHash'> = {
    contract: ACTION_COST_RECEIPT_CONTRACT,
    receiptId: input.receiptId.trim(),
    projectSlug: input.projectSlug.trim(),
    actionId: input.actionId.trim(),
    actionClass: input.actionClass,
    occurredAt: new Date(input.occurredAt).toISOString(),
    pricingVersion: input.pricingVersion.trim(),
    planId: input.planId.trim(),
    billingSubjectRef: normalizeOptional(input.billingSubjectRef),
    sourceRef: normalizeOptional(input.sourceRef),
    costBasis: input.costBasis,
    actualCostUsd,
    monthRuntimeCostBeforeUsd,
    monthlyRuntimeBudgetUsd,
    planNetRevenueUsd,
    usage: normalizeUsage(input.usage),
    costTruth: input.costBasis === 'estimated' ? 'estimated' : 'measured',
    actionUnits: round(actualCostUsd / ACTION_UNIT_USD, 4),
    actionClassMaxUsd,
    actionClassState: actualCostUsd <= actionClassMaxUsd ? 'within' : 'exceeded',
    monthRuntimeCostAfterUsd,
    budgetRemainingUsd,
    budgetUtilizationPct,
    budgetState,
    runtimeContributionMarginPct,
    authority: {
      billingMutation: false,
      pricingMutation: false,
      subscriptionMutation: false,
      providerMutation: false,
    },
  };

  return {
    ...withoutHash,
    receiptHash: actionCostReceiptHash(withoutHash),
  };
}

export function validateActionCostReceipt(receipt: ActionCostReceiptV1): string[] {
  const errors = validateActionCostReceiptInput(receipt);
  if (receipt.contract !== ACTION_COST_RECEIPT_CONTRACT) errors.push('unsupported action-cost receipt contract');
  if (Object.values(receipt.authority ?? {}).some(Boolean)) errors.push('action-cost receipt cannot carry mutation authority');
  if (!/^[0-9a-f]{64}$/.test(receipt.receiptHash ?? '')) errors.push('receiptHash must be sha256');
  if (errors.length === 0) {
    const { receiptHash: _receiptHash, ...identity } = receipt;
    if (receipt.receiptHash !== actionCostReceiptHash(identity)) errors.push('receiptHash does not match canonical action-cost receipt');
  }
  return [...new Set(errors)];
}
