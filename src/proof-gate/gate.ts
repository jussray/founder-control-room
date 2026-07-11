/**
 * Proof Gate
 *
 * Enforces the evidence-completeness rule from the operating contract:
 * "Never report 'all good' when only one happy-path click was tested."
 *
 * Two tiers:
 *   1. Evidence gates  (gateId not in APPROVAL_GATES) — verify evidence
 *      quality only. No founder sign-off required.
 *   2. Approval gates  (gateId in APPROVAL_GATES) — require explicit
 *      founder sign-off via `approvedBy` before proceeding.
 */

import type { ProofEvidence, ProofGateResult, ProofStatus } from './types.js';

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

type ApprovalGateId = typeof APPROVAL_GATES[number];

export function requiresFounderApproval(gateId: string): gateId is ApprovalGateId {
  return (APPROVAL_GATES as readonly string[]).includes(gateId);
}

/**
 * Typed error thrown by assertProofPassed().
 * Carries the gateId and structured failure list for callers that need
 * to handle gate failures programmatically.
 */
export class ProofGateError extends Error {
  constructor(
    public readonly gateId: string,
    public readonly failures: string[],
  ) {
    const lines = [
      `\n\u274c PROOF GATE FAILED [${gateId}]`,
      ...failures.map((f) => `  \u2022 ${f}`),
      `\nResolve the above before proceeding.`,
    ];
    super(lines.join('\n'));
    this.name = 'ProofGateError';
  }
}

export function runProofGate(
  gateId: string,
  evidence: ProofEvidence,
  approvedBy?: string,
): ProofGateResult {
  const failures: string[] = [];

  // 1. Caller-reported check failures block the gate immediately
  if (evidence.failures.length > 0) {
    failures.push(
      `${evidence.failures.length} caller-reported check failure(s): ${evidence.failures.join('; ')}`,
    );
  }

  // 2. Reject empty evidence
  if (!evidence.filesChanged.length) {
    failures.push('No files reported as changed — gate cannot verify scope.');
  }

  if (!evidence.checksRun.length) {
    failures.push('No checks reported — happy-path-only claim rejected.');
  }

  if (!evidence.rollbackPath || evidence.rollbackPath.trim() === '') {
    failures.push('Rollback path is missing — required before any material change.');
  }

  // 3. Approval gates require founder sign-off
  if (requiresFounderApproval(gateId) && !approvedBy) {
    failures.push(
      `Gate '${gateId}' is an approval gate and requires explicit founder sign-off (approvedBy).`,
    );
  }

  // 4. Unresolved risks require founder acknowledgement
  if (evidence.unresolvedRisks.length > 0 && !approvedBy) {
    failures.push(
      `${evidence.unresolvedRisks.length} unresolved risk(s) present without founder acknowledgement: ${evidence.unresolvedRisks.join('; ')}`,
    );
  }

  const status: ProofStatus = failures.length === 0 ? 'pass' : 'fail';

  return {
    status,
    evidence: { ...evidence, failures: [...evidence.failures, ...failures.filter((f) => !evidence.failures.includes(f))] },
    timestamp: new Date().toISOString(),
    gateId,
    approvedBy,
  };
}

export function assertProofPassed(result: ProofGateResult): void {
  if (result.status !== 'pass') {
    throw new ProofGateError(result.gateId, result.evidence.failures);
  }
}
