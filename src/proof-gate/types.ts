export type ProofStatus = 'pass' | 'fail' | 'skipped';

export interface ProofEvidence {
  filesChanged: string[];
  behaviorChanged: string;
  checksRun: string[];
  failures: string[];            // empty = all passed
  securityImpact: string;
  deploymentImpact: string;
  rollbackPath: string;
  unresolvedRisks: string[];
}

export interface ProofGateResult {
  status: ProofStatus;
  evidence: ProofEvidence;
  /**
   * Flat list of all failures detected by runProofGate().
   * Combines caller-reported evidence.failures with gate-generated
   * structural failures. Use this for persistence and HTTP responses;
   * evidence.failures retains only the caller-supplied subset.
   */
  allFailures: string[];
  timestamp: string;
  gateId: string;
  approvedBy?: string;
}
