import { decideJiraAction, type JiraActionClaimState } from './jiraActionReplayGate.js';

/**
 * Provider-independent execution boundary. Implement claimOnce with a durable,
 * unique-key database transaction before enabling this for live Jira writes.
 */
export interface JiraActionStore {
  read(key: string): Promise<JiraActionClaimState>;
  claimOnce(key: string): Promise<boolean>;
  markUnknown(key: string): Promise<void>;
  markProviderAccepted(key: string): Promise<void>;
}

export type JiraActionRunResult =
  | 'provider-accepted'
  | 'verify-provider-state'
  | 'already-verified'
  | 'stop';

export async function runClaimedJiraAction(
  key: string,
  store: JiraActionStore,
  write: () => Promise<void>,
): Promise<JiraActionRunResult> {
  if (!key || !/^fcr-jira-[a-z0-9:-]+$/i.test(key)) throw new Error('invalid_jira_action_key');

  const decision = decideJiraAction(await store.read(key));
  if (decision === 'already-verified' || decision === 'stop' || decision === 'verify-provider-state') {
    return decision;
  }

  // A competing worker wins the durable claim: no provider write occurs here.
  if (!(await store.claimOnce(key))) return 'verify-provider-state';

  try {
    await write();
  } catch {
    // A timeout is not evidence that Jira did nothing.
    await store.markUnknown(key);
    return 'verify-provider-state';
  }

  await store.markProviderAccepted(key);
  return 'provider-accepted'; // Acceptance is not verification.
}
