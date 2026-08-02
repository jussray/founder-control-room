export interface ExpectedExecutionScope {
  missionId: string | null;
  projectId: string;
  actionType: string;
}

export interface StoredExecutionScope {
  mission_id: string | null;
  project_id: string;
  action_type: string;
}

/**
 * Idempotency is valid only inside the exact action scope that created the
 * ledger row. A globally unique key must never make one mission or action
 * inherit another action's provider result.
 */
export function executionScopeMatches(
  stored: StoredExecutionScope,
  expected: ExpectedExecutionScope,
): boolean {
  return stored.mission_id === expected.missionId
    && stored.project_id === expected.projectId
    && stored.action_type === expected.actionType;
}
