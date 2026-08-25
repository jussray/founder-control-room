export type PrAuditVerdict =
  | 'evidence_complete'
  | 'evidence_incomplete'
  | 'evidence_conflicted';

export type PrAuditCiConclusion = 'pass' | 'fail' | 'pending' | 'unknown';
export type PrAuditFreshness = 'current' | 'stale' | 'unknown';
export type PrAuditFindingSeverity = 'info' | 'warning' | 'blocker';

export interface PrAuditFinding {
  severity: PrAuditFindingSeverity;
  code: string;
  message: string;
}

export interface PullRequestAuditObservation {
  number: number;
  state: 'open' | 'closed' | 'merged' | 'unknown';
  baseSha: string;
  headSha: string;
  observedAt: string;
  /** Caller expectation captured before provider observation, when supplied. */
  expectedHeadSha?: string;
  /** Second provider observation captured after CI collection, when supplied. */
  finalHeadSha?: string;
}

export type CiAuditStatus =
  | 'queued'
  | 'requested'
  | 'waiting'
  | 'in_progress'
  | 'pending'
  | 'completed'
  | 'unknown';

export type CiAuditConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'timed_out'
  | 'neutral'
  | 'skipped'
  | 'action_required'
  | 'stale'
  | 'startup_failure'
  | 'unknown'
  | null;

/** A minimized CI observation. URLs, logs, patches, and credentials do not belong here. */
export interface CiAuditObservation {
  id: string;
  name: string;
  headSha: string | null;
  status: CiAuditStatus;
  conclusion: CiAuditConclusion;
  observedAt: string;
}

export interface EvaluatePrAuditEvidenceInput {
  pullRequest: PullRequestAuditObservation;
  checks: readonly CiAuditObservation[];
  workflows: readonly CiAuditObservation[];
  now: string;
  freshnessWindowMs?: number;
}

export interface PrAuditEvidenceEvaluation {
  verdict: PrAuditVerdict;
  ciConclusion: PrAuditCiConclusion;
  findings: PrAuditFinding[];
  verification: {
    checkedAt: string;
    headShaBound: boolean;
    ciBoundToHeadSha: boolean;
    freshness: PrAuditFreshness;
  };
}
