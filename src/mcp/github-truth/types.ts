export type GitHubPrAuditVerdict =
  | 'evidence_complete'
  | 'evidence_incomplete'
  | 'evidence_conflicted';

export type GitHubPrCiConclusion = 'pass' | 'fail' | 'pending' | 'unknown';
export type GitHubPrFreshness = 'current' | 'stale' | 'unknown';
export type GitHubPrFindingSeverity = 'info' | 'warning' | 'blocker';

export interface GitHubPrObservation {
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft: boolean;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  mergeCommitSha?: string;
  mergeable?: boolean | null;
  changedFiles: number;
  additions: number;
  deletions: number;
  commits: number;
  updatedAt: string;
  url: string;
}

export interface GitHubPrCheckObservation {
  id: string;
  name: string;
  status: string;
  conclusion?: string;
  headSha: string;
  completedAt?: string;
  detailsUrl?: string;
}

export interface GitHubPrWorkflowObservation {
  id: string;
  name: string;
  status: string;
  conclusion?: string;
  headSha: string;
  updatedAt: string;
  detailsUrl?: string;
}

export interface GitHubPrReviewObservation {
  id: string;
  reviewer: string;
  state: string;
  commitSha?: string;
  submittedAt?: string;
  detailsUrl?: string;
}

export interface GitHubPrChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface GitHubPrBoundedEvidence<T> {
  items: T[];
  complete: boolean;
  observedCount: number;
  totalCount?: number;
}

export interface GitHubPrEvidenceCoverage {
  checksComplete: boolean;
  workflowsComplete: boolean;
  reviewsComplete: boolean;
  changedFilesComplete: boolean;
}

export interface GitHubPrEvidenceRef {
  kind: 'pull_request' | 'commit_comparison' | 'check_run' | 'workflow_run' | 'review_state';
  source: 'github';
  sourceUrl?: string;
  subjectSha?: string;
  observedAt: string;
}

export interface GitHubPrFinding {
  severity: GitHubPrFindingSeverity;
  code: string;
  message: string;
}

export interface GitHubPrAuditResult {
  contract: 'founder-control-room/github-pr-audit@v1';
  repository: string;
  verdict: GitHubPrAuditVerdict;
  summary: {
    prNumber: number;
    title: string;
    baseSha: string;
    headSha: string;
    prState: string;
    draft: boolean;
    mergeable?: boolean | null;
    ciConclusion: GitHubPrCiConclusion;
    reviewDecision: 'approved' | 'changes_requested' | 'none' | 'unknown';
    changedFiles: number;
    additions: number;
    deletions: number;
    commits: number;
  };
  changedFiles: GitHubPrChangedFile[];
  findings: GitHubPrFinding[];
  evidence: GitHubPrEvidenceRef[];
  verification: {
    checkedAt: string;
    expectedHeadSha?: string;
    headShaBound: boolean;
    ciBoundToHeadSha: boolean;
    evidenceCoverage: GitHubPrEvidenceCoverage;
    freshness: GitHubPrFreshness;
  };
  boundary: {
    evidenceAuditOnly: true;
    mergeApproved: false;
    mutationPerformed: false;
  };
}
