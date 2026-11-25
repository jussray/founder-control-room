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

/** Interpret minimized, persisted GitHub metadata as a candidate only.
 * This is not live PR truth, disclosure authorization, or a dispatch receipt.
 */
export function deriveCheckRemediationSignal(payload: unknown): RemediationSignal | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const event = payload as Record<string, unknown>;
  const repository = event.repository as Record<string, unknown> | undefined;
  const check = event.check_run as Record<string, unknown> | undefined;
  if (event.action !== 'completed' || check?.status !== 'completed' ||
      check.conclusion !== 'failure' || typeof repository?.full_name !== 'string' ||
      typeof check.remediation_pr_number !== 'number' || typeof check.head_sha !== 'string') return null;
  const signal: RemediationSignal = {
    repository: repository.full_name, pr: check.remediation_pr_number, head: check.head_sha, kind: 'ci_failed',
  };
  try {
    return planRemediationSignal(signal) ? signal : null;
  } catch {
    return null;
  }
}

// Planning is pure; it does not establish repository scope or dispatch authority.
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

export type RemediationEligibilityCheck = (
  signal: Readonly<RemediationSignal>,
  plan: Readonly<NonNullable<ReturnType<typeof planRemediationSignal>>>,
) => Promise<boolean>;

async function eligible(
  authorize: RemediationEligibilityCheck | undefined,
  signal: Readonly<RemediationSignal>,
  plan: Readonly<NonNullable<ReturnType<typeof planRemediationSignal>>>,
): Promise<boolean> {
  try {
    return typeof authorize === 'function' && await authorize(signal, plan) === true;
  } catch {
    return false;
  }
}

/** The claim callback must atomically reserve the signal in the existing
 * durable work ledger; a failed claim must never trigger another agent.
 * This relay requests analysis, not mutation authority or execution proof.
 * The trusted eligibility check must independently establish registered scope,
 * current head, exclusions and exact-payload disclosure authorization.
 * Callers own retries and durable outcome reconciliation.
 */
export async function dispatchRemediationSignal(
  signal: RemediationSignal,
  adapters: OperatorRelayAdapters,
  claim: (key: string) => Promise<boolean>,
  now = new Date(),
  authorize?: RemediationEligibilityCheck,
) {
  const subject = Object.freeze({ ...signal });
  const planned = planRemediationSignal(subject);
  if (!planned) return { state: 'held' as const };
  const plan = Object.freeze(planned);
  if (!Object.hasOwn(adapters, plan.target) || typeof adapters[plan.target] !== 'function')
    return { state: 'blocked' as const, reason: 'target_unavailable', ...plan };
  if (!await eligible(authorize, subject, plan))
    return { state: 'blocked' as const, reason: 'eligibility_unverified', ...plan };
  try {
    const claimed = await claim(plan.key);
    if (claimed === false) return { state: 'duplicate' as const, ...plan };
    if (claimed !== true) return { state: 'blocked' as const, reason: 'claim_failed', ...plan };
  } catch {
    return { state: 'blocked' as const, reason: 'claim_failed', ...plan };
  }
  if (!await eligible(authorize, subject, plan))
    return { state: 'blocked' as const, reason: 'eligibility_changed', ...plan };
  try {
    const relay = await relayBetweenOperators({
      fromOperator: 'fcr',
      toOperator: plan.target,
      capability: 'review',
      goal: 'Diagnose this remediation signal and return a bounded repair plan and proof requirements. Do not mutate external systems through this relay.',
      contextSummary: JSON.stringify({
        repository: subject.repository, pr: subject.pr, head: subject.head, kind: subject.kind,
      }),
      sensitivity: 'internal',
      now,
    }, adapters);
    return { state: 'relay_returned' as const, ...plan, relay };
  } catch {
    return { state: 'blocked' as const, reason: 'relay_failed', ...plan };
  }
}
