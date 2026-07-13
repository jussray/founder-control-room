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
