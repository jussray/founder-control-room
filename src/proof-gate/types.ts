// ── Proof Gate — types ────────────────────────────────────────────────────────

export type ProofStatus = 'pass' | 'fail' | 'skipped';

export interface ProofEvidence {
  filesChanged: string[];
  behaviorChanged: string;
  checksRun: string[];
  failures: string[];            // caller-reported failures (empty = all passed)
  securityImpact: string;
  deploymentImpact: string;
  rollbackPath: string;
  unresolvedRisks: string[];
}

export interface ProofGateResult {
  status: ProofStatus;
  /** Merged list of caller-reported + gate-detected failures. */
  allFailures: string[];
  /** Raw evidence submitted to the gate. */
  evidence: ProofEvidence;
  timestamp: string;
  gateId: string;
  approvedBy?: string;
}

// ── Approval gate registry ────────────────────────────────────────────────────

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

export type ApprovalGateId = typeof APPROVAL_GATES[number];

/** Type guard — true when gateId is in the APPROVAL_GATES list. */
export function isApprovalGate(gateId: string): gateId is ApprovalGateId {
  return (APPROVAL_GATES as readonly string[]).includes(gateId);
}
