/**
 * Proof Gate — runtime
 *
 * Usage:
 *
 *   import { runProofGate, assertProofPassed } from '../proof-gate/gate.js';
 *
 *   const result = runProofGate('deploy', evidence, 'jussray — approved 2026-07-11');
 *   assertProofPassed(result); // throws ProofGateError if status !== 'pass'
 */

import type { ProofEvidence, ProofGateResult, ProofStatus } from './types.js';

// ---------------------------------------------------------------------------
// Approval gate registry
// ---------------------------------------------------------------------------

/**
 * Gates that require explicit founder approval (approvedBy must be set).
 * Add new gate IDs here as the control room grows.
 */
export const APPROVAL_GATES = [
  'merge',
  'deploy',
  'rollback',
  'billing-change',
  'auth-change',
  'secrets-change',
  'db-destructive',
  'dns-change',
] as const;

export type ApprovalGateId = (typeof APPROVAL_GATES)[number];

export function requiresFounderApproval(gateId: string): gateId is ApprovalGateId {
  return (APPROVAL_GATES as readonly string[]).includes(gateId);
}

// ---------------------------------------------------------------------------
// Custom error class
// ---------------------------------------------------------------------------

export class ProofGateError extends Error {
  constructor(
    public readonly gateId: string,
    public readonly failures: string[],
  ) {
    const lines = [
      `\n❌ PROOF GATE FAILED [${gateId}]`,
      ...failures.map((f) => `  • ${f}`),
      `\nResolve the above before proceeding.`,
    ];
    super(lines.join('\n'));
    this.name = 'ProofGateError';
  }
}

// ---------------------------------------------------------------------------
// Core gate function
// ---------------------------------------------------------------------------

/**
 * Evaluate a set of proof evidence against the gate rules.
 *
 * @param gateId    - Identifies the gate (e.g. 'merge', 'deploy').
 * @param evidence  - The evidence assembled by the caller after the change.
 * @param approvedBy - Founder approval reference. Required for APPROVAL_GATES
 *                     and when unresolvedRisks is non-empty.
 * @returns ProofGateResult with status 'pass' or 'fail'.
 */
export function runProofGate(
  gateId: string,
  evidence: ProofEvidence,
  approvedBy?: string,
): ProofGateResult {
  const failures: string[] = [];

  // 1. Scope must be declared — no silent "nothing changed" claims.
  if (evidence.filesChanged.length === 0) {
    failures.push(
      'No files reported as changed — gate cannot verify scope. ' +
        'List every file that was created, modified, or deleted.',
    );
  }

  // 2. At least one check must have been run — happy-path-only is rejected.
  if (evidence.checksRun.length === 0) {
    failures.push(
      'No checks reported. ' +
        'Run tsc --noEmit, vitest run, supabase db lint, or equivalent ' +
        'and add them to checksRun before passing this gate.',
    );
  }

  // 3. Any check failures must be acknowledged.
  if (evidence.failures.length > 0) {
    failures.push(
      `${evidence.failures.length} check failure(s) reported: ` +
        evidence.failures.join('; '),
    );
  }

  // 4. Rollback path is mandatory before any material change.
  if (!evidence.rollbackPath.trim()) {
    failures.push(
      'Rollback path is missing. ' +
        'Describe the exact steps to undo this change before proceeding.',
    );
  }

  // 5. Approval gates require founder sign-off.
  if (requiresFounderApproval(gateId) && !approvedBy) {
    failures.push(
      `Gate '${gateId}' is an approval gate and requires explicit founder ` +
        'sign-off. Set approvedBy to a reference such as ' +
        '"jussray — approved 2026-07-11 via Slack".',
    );
  }

  // 6. Unresolved risks must be founder-acknowledged.
  if (evidence.unresolvedRisks.length > 0 && !approvedBy) {
    failures.push(
      `${evidence.unresolvedRisks.length} unresolved risk(s) require founder ` +
        'acknowledgement before proceeding: ' +
        evidence.unresolvedRisks.join('; '),
    );
  }

  const status: ProofStatus = failures.length === 0 ? 'pass' : 'fail';

  return {
    status,
    evidence: {
      ...evidence,
      // Append structural failures found by the gate itself.
      failures: [...evidence.failures, ...failures],
    },
    timestamp: new Date().toISOString(),
    gateId,
    approvedBy,
  };
}

// ---------------------------------------------------------------------------
// Assertion helper
// ---------------------------------------------------------------------------

/**
 * Throws ProofGateError if the gate result is not 'pass'.
 * Use this as a hard stop inside any action that must not proceed on failure.
 *
 * @example
 *   const result = runProofGate('deploy', evidence, approvedBy);
 *   assertProofPassed(result); // throws if failed
 *   await deployToProduction();
 */
export function assertProofPassed(result: ProofGateResult): void {
  if (result.status !== 'pass') {
    throw new ProofGateError(result.gateId, result.evidence.failures);
  }
}
