/**
 * Proof Gate — type contracts.
 *
 * The proof gate enforces the rule from chief-ai-machine CLAUDE.md:
 * "Never report 'all good' when only one happy-path click was tested."
 *
 * It sits between any material action (merge, deploy, rollback, schema change)
 * and the Approval Engine.  An action cannot be approved until a ProofGateResult
 * with status "pass" has been recorded against the same mission + gateId.
 */

export type ProofStatus = 'pass' | 'fail' | 'skipped';

/**
 * The IDs that require explicit founder approval AND a passing proof gate
 * before execution.  Must stay in sync with the `action` column on `approvals`.
 */
export const APPROVAL_GATE_IDS = [
  'merge',
  'deploy',
  'rollback',
  'billing-change',
  'auth-change',
  'secrets-change',
  'db-destructive',
  'dns-change',
] as const;

export type ApprovalGateId = (typeof APPROVAL_GATE_IDS)[number];

export function isApprovalGate(id: string): id is ApprovalGateId {
  return APPROVAL_GATE_IDS.includes(id as ApprovalGateId);
}

/**
 * Evidence the caller must supply.  Every field is required so the gate
 * cannot be trivially bypassed by omission.
 */
export interface ProofEvidence {
  /** List of files added / modified / deleted in this change. */
  filesChanged: string[];
  /** One-sentence description of what behaviour changed and why. */
  behaviorChanged: string;
  /** CLI commands or test suites that were actually executed, e.g. ["tsc --noEmit", "vitest run"]. */
  checksRun: string[];
  /** Any checks that failed.  Empty array = all passed. */
  failures: string[];
  /** Narrative of security surface affected, or "none". */
  securityImpact: string;
  /** Narrative of deployment dependencies or ordering constraints, or "none". */
  deploymentImpact: string;
  /** Exact steps to undo this change if something goes wrong. */
  rollbackPath: string;
  /** Risks that are known but not yet resolved.  Empty = none. */
  unresolvedRisks: string[];
}

export interface ProofGateResult {
  status: ProofStatus;
  /** All failures — both those from the caller's own `evidence.failures` and those detected by the gate. */
  allFailures: string[];
  evidence: ProofEvidence;
  timestamp: string;
  /** Matches the `action` column on `approvals`, e.g. "merge", "deploy". */
  gateId: string;
  /** Free-form reference — e.g. "founder — approved 2026-07-11 via Slack". */
  approvedBy?: string;
}
