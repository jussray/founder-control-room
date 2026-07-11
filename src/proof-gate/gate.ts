/**
 * Proof Gate — core engine.
 *
 * runProofGate()             — validates evidence and returns a ProofGateResult.
 * formatProofGateFailure()   — renders one canonical human-readable failure message.
 * assertProofPassed()        — throws ProofGateError if the gate did not pass.
 * ProofGateError             — structured error with gateId + failures for instanceof checks.
 * requiresFounderApproval()  — re-exported convenience wrapper over isApprovalGate.
 */

import type { ProofEvidence, ProofGateResult, ProofStatus } from './types.js';
import { isApprovalGate, APPROVAL_GATES } from './types.js';

export { isApprovalGate, APPROVAL_GATES };

/** Convenience alias used in tests and controllers. */
export const requiresFounderApproval = isApprovalGate;

// ── Structured error ──────────────────────────────────────────────────────────

export class ProofGateError extends Error {
  constructor(
    public readonly gateId: string,
    public readonly failures: string[],
    message: string,
  ) {
    super(message);
    this.name = 'ProofGateError';
    // Maintain proper prototype chain in transpiled environments
    Object.setPrototypeOf(this, ProofGateError.prototype);
  }
}

// ── Core engine ───────────────────────────────────────────────────────────────

export function runProofGate(
  gateId: string,
  evidence: ProofEvidence,
  approvedBy?: string,
): ProofGateResult {
  const detectedFailures: string[] = [];

  // ── 1. Scope evidence must exist ──────────────────────────────────────────
  if (!evidence.filesChanged.length) {
    detectedFailures.push(
      'No files reported as changed — gate cannot verify scope.',
    );
  }

  // ── 2. At least one check must have been run ──────────────────────────────
  if (!evidence.checksRun.length) {
    detectedFailures.push(
      'No checks reported — happy-path-only claim rejected.',
    );
  }

  // ── 3. Rollback path is mandatory before any material change ─────────────
  if (!evidence.rollbackPath?.trim()) {
    detectedFailures.push(
      'Rollback path is missing — required before any material change.',
    );
  }

  // ── 4. Approval gates require founder sign-off ───────────────────────────
  if (isApprovalGate(gateId) && !approvedBy) {
    detectedFailures.push(
      `Gate '${gateId}' is an approval gate and requires explicit founder approval before proceeding.`,
    );
  }

  // ── 5. Unresolved risks must be acknowledged by the founder ──────────────
  if (evidence.unresolvedRisks.length > 0 && !approvedBy) {
    detectedFailures.push(
      `${evidence.unresolvedRisks.length} unresolved risk(s) present without founder acknowledgement.`,
    );
  }

  // ── 6. Caller-reported failures block the gate ───────────────────────────
  if (evidence.failures.length > 0) {
    detectedFailures.push(
      `${evidence.failures.length} caller-reported check failure(s): ${evidence.failures.join('; ')}`,
    );
  }

  const allFailures = [...detectedFailures];
  const status: ProofStatus = allFailures.length === 0 ? 'pass' : 'fail';

  return {
    status,
    allFailures,
    evidence,
    timestamp: new Date().toISOString(),
    gateId,
    approvedBy,
  };
}

/**
 * Render the canonical failure message used by both throwing and non-throwing
 * callers. Keeping this formatting in one place prevents controller responses
 * and ProofGateError messages from drifting apart.
 */
export function formatProofGateFailure(result: ProofGateResult): string {
  const lines = [
    `\n❌  PROOF GATE FAILED [${result.gateId}] at ${result.timestamp}`,
    ...result.allFailures.map((failure) => `  • ${failure}`),
    `\nResolve every item above before proceeding.`,
  ];

  return lines.join('\n');
}

/**
 * Throws a ProofGateError when a gate did not pass.
 * Use inside action handlers to hard-stop execution.
 * Callers can catch by type: instanceof ProofGateError.
 */
export function assertProofPassed(result: ProofGateResult): void {
  if (result.status !== 'pass') {
    throw new ProofGateError(
      result.gateId,
      result.allFailures,
      formatProofGateFailure(result),
    );
  }
}
