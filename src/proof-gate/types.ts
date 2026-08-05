export type ProofStatus = 'pass' | 'fail' | 'skipped';

export interface ProofEvidence {
  filesChanged: string[];
  behaviorChanged: string;
  checksRun: string[];
  /** Caller-reported failures. Empty means the submitted checks passed. */
  failures: string[];
  securityImpact: string;
  deploymentImpact: string;
  rollbackPath: string;
  unresolvedRisks: string[];
  /** Required by the close-issue gate. Use owner/repository#number or a canonical issue URL. */
  issueReference?: string;
  /** Required by the close-issue gate. State what was resolved without overstating proof. */
  resolution?: string;
  /** Required by the close-issue gate. Use "none" only when no follow-up gate remains. */
  nextGate?: string;
}

export interface ProofGateResult {
  status: ProofStatus;
  /** Complete list of caller-reported and gate-detected failures. */
  allFailures: string[];
  /** Raw evidence submitted to the gate. */
  evidence: ProofEvidence;
  timestamp: string;
  gateId: string;
  approvedBy?: string;
}

export const APPROVAL_GATES = [
  'merge',
  'deploy',
  'rollback',
  'close-issue',
  'billing-change',
  'auth-change',
  'secrets-change',
  'db-destructive',
  'dns-change',
] as const;

export type ApprovalGateId = typeof APPROVAL_GATES[number];

export function isApprovalGate(gateId: string): gateId is ApprovalGateId {
  return (APPROVAL_GATES as readonly string[]).includes(gateId);
}
