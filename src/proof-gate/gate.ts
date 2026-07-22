/**
 * Proof Gate — core engine.
 *
 * runProofGate()             — validates evidence and returns a ProofGateResult.
 * formatProofGateFailure()   — renders one canonical human-readable failure message.
 * assertProofPassed()        — throws ProofGateError if the gate did not pass.
 * ProofGateError             — structured error with gateId + failures for instanceof checks.
 * requiresFounderApproval()  — convenience alias over isApprovalGate().
 *
 * Evidence is founder-attested, not CI-verified. A passing manual attestation
 * must not be the sole authorization signal for a merge or deployment action.
 */

import type { ProofEvidence, ProofGateResult, ProofStatus } from './types.js';
import { APPROVAL_GATES, isApprovalGate } from './types.js';

export { APPROVAL_GATES, isApprovalGate };

/** Convenience alias used in tests and controllers. */
export const requiresFounderApproval = isApprovalGate;

export class ProofGateError extends Error {
  constructor(
    public readonly gateId: string,
    public readonly failures: string[],
    message: string,
  ) {
    super(message);
    this.name = 'ProofGateError';
    Object.setPrototypeOf(this, ProofGateError.prototype);
  }
}

export function runProofGate(
  gateId: string,
  evidence: ProofEvidence,
  approvedBy?: string,
): ProofGateResult {
  const detectedFailures: string[] = [];

  if (!evidence.filesChanged.length) {
    detectedFailures.push('No files reported as changed — gate cannot verify scope.');
  }

  if (!evidence.checksRun.length) {
    detectedFailures.push('No checks reported — happy-path-only claim rejected.');
  }

  if (!evidence.rollbackPath?.trim()) {
    detectedFailures.push('Rollback path is missing — required before any material change.');
  }

  if (isApprovalGate(gateId) && !approvedBy) {
    detectedFailures.push(
      `Gate '${gateId}' is an approval gate and requires explicit founder approval before proceeding.`,
    );
  }

  if (evidence.unresolvedRisks.length > 0 && !approvedBy) {
    detectedFailures.push(
      `${evidence.unresolvedRisks.length} unresolved risk(s) present without founder acknowledgement.`,
    );
  }

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

/** Render the canonical failure message for throwing and non-throwing callers. */
export function formatProofGateFailure(result: ProofGateResult): string {
  const lines = [
    `\n❌  PROOF GATE FAILED [${result.gateId}] at ${result.timestamp}`,
    ...result.allFailures.map((failure) => `  • ${failure}`),
    `\nResolve every item above before proceeding.`,
  ];

  return lines.join('\n');
}

export function assertProofPassed(result: ProofGateResult): void {
  if (result.status !== 'pass') {
    throw new ProofGateError(
      result.gateId,
      result.allFailures,
      formatProofGateFailure(result),
    );
  }
}
