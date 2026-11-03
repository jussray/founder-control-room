/**
 * FCR-owned Jira mutation replay gate.
 *
 * This is a fail-closed decision layer, NOT a durable claim store. Callers must
 * load a persisted action claim under a database transaction/unique constraint
 * before consulting it. Never infer that an outbox lease is an action claim.
 */
export type JiraActionClaimState =
  | 'absent'
  | 'claimed'
  | 'provider-accepted'
  | 'verified'
  | 'outcome-unknown'
  | 'denied';

export type JiraActionDecision =
  | 'claim-atomically'
  | 'verify-provider-state'
  | 'already-verified'
  | 'stop';

export function decideJiraAction(state: JiraActionClaimState): JiraActionDecision {
  switch (state) {
    case 'absent':
      return 'claim-atomically';
    case 'claimed':
    case 'provider-accepted':
    case 'outcome-unknown':
      // Never issue another Jira write until a provider re-read proves
      // the original action did not occur and a new approval permits it.
      return 'verify-provider-state';
    case 'verified':
      return 'already-verified';
    case 'denied':
      return 'stop';
    default:
      return assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`unsupported_jira_action_state:${String(value)}`);
}
