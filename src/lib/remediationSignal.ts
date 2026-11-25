import { createHash } from 'node:crypto';
import { relayBetweenOperators } from './operatorRelayBridge.js';
import type { OperatorRelayAdapters } from './operatorRelayDispatch.js';
import type { RelayOperatorId } from './operatorRelay.js';

const ROUTES = {
  ci_failed: 'codex',
  branch_behind: 'codex',
  merge_conflict: 'claude-code',
  code_regression: 'claude-code',
  check_access_blocked: 'codex',
  founder_hold: null,
  security_incident: null,
} as const;
export type RemediationSignal = {
  repository: string;
  pr: number;
  head: string;
  kind: keyof typeof ROUTES;
};

// Internal trusted callers must independently establish repository scope,
// current head, exclusions, and disclosure authorization before dispatch.
export function planRemediationSignal(signal: RemediationSignal) {
  if (!/^jussray\/[a-z0-9_.-]{1,100}$/i.test(signal.repository) ||
      !Number.isSafeInteger(signal.pr) || signal.pr < 1 ||
      !/^[a-f0-9]{40}$/.test(signal.head) ||
      !Object.hasOwn(ROUTES, signal.kind)) throw new Error('Invalid remediation signal');
  const target: RelayOperatorId | null = ROUTES[signal.kind];
  if (!target) return null;
  const key = createHash('sha256').update(JSON.stringify([
    signal.repository.toLowerCase(), signal.pr, signal.head, signal.kind,
  ])).digest('hex');
  return { target, key };
}

/** The claim callback must atomically reserve the signal in the existing
 * durable work ledger; a failed claim must never trigger another agent.
 * This relay requests analysis, not mutation authority or execution proof.
 * Callers own retries, head revalidation, and durable outcome reconciliation.
 */
export async function dispatchRemediationSignal(
  signal: RemediationSignal,
  adapters: OperatorRelayAdapters,
  claim: (key: string) => Promise<boolean>,
  now = new Date(),
) {
  const plan = planRemediationSignal(signal);
  if (!plan) return { state: 'held' as const };
  if (!Object.hasOwn(adapters, plan.target) || typeof adapters[plan.target] !== 'function')
    return { state: 'blocked' as const, reason: 'target_unavailable', ...plan };
  if (!await claim(plan.key)) return { state: 'duplicate' as const, ...plan };
  try {
    const relay = await relayBetweenOperators({
      fromOperator: 'fcr',
      toOperator: plan.target,
      capability: 'review',
      goal: 'Diagnose this remediation signal and return a bounded repair plan and proof requirements. Do not mutate external systems through this relay.',
      contextSummary: JSON.stringify({
        repository: signal.repository, pr: signal.pr, head: signal.head, kind: signal.kind,
      }),
      sensitivity: 'internal',
      now,
    }, adapters);
    return { state: 'relay_returned' as const, ...plan, relay };
  } catch {
    return { state: 'blocked' as const, reason: 'relay_failed', ...plan };
  }
}
