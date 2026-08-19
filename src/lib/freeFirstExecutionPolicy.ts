export const FREE_FIRST_EXECUTION_POLICY_VERSION = 'free-first-v1';

export type ExecutionCostClass = 'free' | 'included' | 'metered' | 'paid';

export interface FreeFirstMissionPolicySnapshot {
  source?: unknown;
  founder_constraints?: unknown;
}

export interface FreeFirstCostDecision {
  allowed: boolean;
  governed: boolean;
  reason:
    | 'mission_not_free_first'
    | 'free_or_included_execution'
    | 'paid_fallback_not_authorized';
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function isExecutionCostCurrentlyAuthorized(costClass: ExecutionCostClass): boolean {
  return costClass === 'free' || costClass === 'included';
}

export function missionRequiresFreeFirst(
  snapshot: FreeFirstMissionPolicySnapshot | null | undefined,
): boolean {
  const policy = record(snapshot);
  if (!policy) return false;

  const constraints = record(policy['founder_constraints']);
  const explicitRepositoryRepair = policy['source'] === 'repository_verification';
  const explicitZeroBudget = constraints?.['monthly_budget'] === 0;
  const explicitPreferFree = constraints?.['prefer_free'] === true;

  return explicitRepositoryRepair || (explicitZeroBudget && explicitPreferFree);
}

export function evaluateFreeFirstCostGate(input: {
  policySnapshot: FreeFirstMissionPolicySnapshot | null | undefined;
  costClass: ExecutionCostClass;
}): FreeFirstCostDecision {
  if (!missionRequiresFreeFirst(input.policySnapshot)) {
    return { allowed: true, governed: false, reason: 'mission_not_free_first' };
  }

  if (isExecutionCostCurrentlyAuthorized(input.costClass)) {
    return { allowed: true, governed: true, reason: 'free_or_included_execution' };
  }

  // Repository-repair missions have a zero-dollar founder budget today and
  // FCR does not yet have an application-side paid-commitment receipt path.
  // Fail closed instead of treating mission approval as purchase authority.
  return { allowed: false, governed: true, reason: 'paid_fallback_not_authorized' };
}
