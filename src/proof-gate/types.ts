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
  timestamp: string;
  gateId: string;
  approvedBy?: string;
}
