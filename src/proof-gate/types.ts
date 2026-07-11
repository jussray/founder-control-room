/**
 * Proof Gate — types
 *
 * The Proof step sits at position 5 of the operating contract's 6-step
 * response format:
 *   Reality → Risk → Decision → Action → Proof → Next gate
 *
 * A ProofGateResult is the machine-readable record that a change actually
 * worked (or why it didn't). It must be produced before the work is
 * considered done and before any downstream gate (e.g. merge, deploy) opens.
 */

export type ProofStatus = 'pass' | 'fail' | 'skipped';

/**
 * The evidence payload that the caller assembles after completing a change.
 * Every field is required — omitting them is itself a gate failure.
 */
export interface ProofEvidence {
  /** Relative paths of every file that was created, modified, or deleted. */
  filesChanged: string[];

  /** Human-readable description of the observable behaviour change. */
  behaviorChanged: string;

  /**
   * Every check that was run (e.g. 'tsc --noEmit', 'vitest run',
   * 'supabase db lint'). An empty array means only the happy path was
   * tested — the gate rejects this.
   */
  checksRun: string[];

  /**
   * Names of any checks that failed. Empty = all checks passed.
   * Populated by the caller; the gate appends its own structural failures.
   */
  failures: string[];

  /** How security posture changed (or 'none' if unchanged). */
  securityImpact: string;

  /** Deployment ordering requirements, env-var changes, migration steps. */
  deploymentImpact: string;

  /**
   * Exact steps to undo this change (e.g. 'supabase migration revert X +
   * redeploy prior Workers revision'). Required — empty string fails the gate.
   */
  rollbackPath: string;

  /**
   * Risks that are known but not yet resolved. May be non-empty only if the
   * founder has acknowledged them (approvedBy must be set).
   */
  unresolvedRisks: string[];
}

/** The result record produced by runProofGate(). */
export interface ProofGateResult {
  status: ProofStatus;
  evidence: ProofEvidence;
  /** ISO-8601 timestamp of when the gate ran. */
  timestamp: string;
  /**
   * Identifies which gate this is (e.g. 'merge', 'deploy', 'schema-change').
   * Gates in APPROVAL_GATES require an approvedBy value.
   */
  gateId: string;
  /**
   * Free-text founder approval reference — e.g.
   * 'jussray — approved 2026-07-11 via Slack'.
   * Required for gates in APPROVAL_GATES and when unresolvedRisks is non-empty.
   */
  approvedBy?: string;
}
