export interface PullRequestAuditObservation {
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

export interface PullRequestAuditCheckObservation {
  id: string;
  name: string;
  status: string;
  conclusion?: string;
  headSha: string;
  completedAt?: string;
  detailsUrl?: string;
}

export interface PullRequestAuditWorkflowObservation {
  id: string;
  name: string;
  status: string;
  conclusion?: string;
  headSha: string;
  updatedAt: string;
  detailsUrl?: string;
}

export interface PullRequestAuditReviewObservation {
  id: string;
  reviewer: string;
  state: string;
  commitSha?: string;
  submittedAt?: string;
  detailsUrl?: string;
}

export interface PullRequestAuditChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface BoundedProviderEvidence<T> {
  items: T[];
  complete: boolean;
  observedCount: number;
  totalCount?: number;
}

export interface PullRequestAuditEvidence {
  initialPullRequest: PullRequestAuditObservation;
  finalPullRequest: PullRequestAuditObservation;
  checks: BoundedProviderEvidence<PullRequestAuditCheckObservation>;
  workflows: BoundedProviderEvidence<PullRequestAuditWorkflowObservation>;
  reviews: BoundedProviderEvidence<PullRequestAuditReviewObservation>;
  changedFiles: BoundedProviderEvidence<PullRequestAuditChangedFile>;
}
