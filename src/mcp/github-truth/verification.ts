import type {
  GitHubPrAuditResult,
  GitHubPrCheckObservation,
  GitHubPrChangedFile,
  GitHubPrCiConclusion,
  GitHubPrCommitStatusObservation,
  GitHubPrEvidenceCoverage,
  GitHubPrEvidenceRef,
  GitHubPrFinding,
  GitHubPrObservation,
  GitHubPrReviewObservation,
  GitHubPrWorkflowObservation,
} from './types.js';

export interface EvaluateGitHubPrAuditInput {
  repository: string;
  initialPullRequest: GitHubPrObservation;
  finalPullRequest: GitHubPrObservation;
  checks: GitHubPrCheckObservation[];
  commitStatuses: GitHubPrCommitStatusObservation[];
  workflows: GitHubPrWorkflowObservation[];
  reviews: GitHubPrReviewObservation[];
  changedFiles: GitHubPrChangedFile[];
  evidenceCoverage: GitHubPrEvidenceCoverage;
  expectedHeadSha?: string;
  checkedAt: string;
}

function normalized(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function ciConclusion(
  checks: readonly GitHubPrCheckObservation[],
  commitStatuses: readonly GitHubPrCommitStatusObservation[],
  workflows: readonly GitHubPrWorkflowObservation[],
): GitHubPrCiConclusion {
  const items = [
    ...checks.map((item) => ({ status: normalized(item.status), conclusion: normalized(item.conclusion) })),
    ...commitStatuses.map((item) => ({ status: normalized(item.state), conclusion: normalized(item.state) })),
    ...workflows.map((item) => ({ status: normalized(item.status), conclusion: normalized(item.conclusion) })),
  ];
  if (items.length === 0) return 'unknown';
  if (items.some((item) => ['failure', 'failed', 'error', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(item.conclusion))) {
    return 'fail';
  }
  if (items.some((item) => ['queued', 'in_progress', 'requested', 'waiting', 'pending'].includes(item.status))) {
    return 'pending';
  }
  if (items.some((item) => !item.conclusion && item.status !== 'completed')) return 'pending';
  if (items.every((item) => ['success', 'neutral', 'skipped'].includes(item.conclusion))) return 'pass';
  return 'unknown';
}

function reviewDecision(
  reviews: readonly GitHubPrReviewObservation[],
  headSha: string,
): 'approved' | 'changes_requested' | 'none' | 'unknown' {
  const currentHeadReviews = reviews.filter((review) => {
    const commitSha = normalized(review.commitSha);
    return !commitSha || commitSha === headSha;
  });
  if (currentHeadReviews.length === 0) return 'none';
  const latestByReviewer = new Map<string, GitHubPrReviewObservation>();
  for (const review of [...currentHeadReviews].sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))) {
    latestByReviewer.set(review.reviewer, review);
  }
  const states = [...latestByReviewer.values()].map((review) => normalized(review.state));
  if (states.includes('changes_requested')) return 'changes_requested';
  if (states.includes('approved')) return 'approved';
  if (states.every((state) => ['commented', 'dismissed', 'pending'].includes(state))) return 'none';
  return 'unknown';
}

function samePrTruth(
  initial: GitHubPrObservation,
  final: GitHubPrObservation,
): boolean {
  return initial.number === final.number
    && initial.state === final.state
    && initial.draft === final.draft
    && normalized(initial.baseRef) === normalized(final.baseRef)
    && normalized(initial.headRef) === normalized(final.headRef)
    && normalized(initial.baseSha) === normalized(final.baseSha)
    && normalized(initial.headSha) === normalized(final.headSha)
    && normalized(initial.mergeCommitSha) === normalized(final.mergeCommitSha)
    && initial.mergeable === final.mergeable
    && initial.changedFiles === final.changedFiles
    && initial.additions === final.additions
    && initial.deletions === final.deletions
    && initial.commits === final.commits;
}

function evidenceRefs(input: EvaluateGitHubPrAuditInput): GitHubPrEvidenceRef[] {
  const observedAt = input.checkedAt;
  return [
    {
      kind: 'pull_request' as const,
      source: 'github' as const,
      sourceUrl: input.initialPullRequest.url,
      subjectSha: input.initialPullRequest.headSha,
      observedAt,
    },
    {
      kind: 'pull_request' as const,
      source: 'github' as const,
      sourceUrl: input.finalPullRequest.url,
      subjectSha: input.finalPullRequest.headSha,
      observedAt,
    },
    {
      kind: 'commit_comparison' as const,
      source: 'github' as const,
      subjectSha: input.initialPullRequest.headSha,
      observedAt,
    },
    ...input.checks.map((check) => ({
      kind: 'check_run' as const,
      source: 'github' as const,
      sourceUrl: check.detailsUrl,
      subjectSha: check.headSha,
      observedAt,
    })),
    ...input.commitStatuses.map((status) => ({
      kind: 'commit_status' as const,
      source: 'github' as const,
      sourceUrl: status.detailsUrl,
      subjectSha: status.headSha,
      observedAt,
    })),
    ...input.workflows.map((workflow) => ({
      kind: 'workflow_run' as const,
      source: 'github' as const,
      sourceUrl: workflow.detailsUrl,
      subjectSha: workflow.headSha,
      observedAt,
    })),
    ...input.reviews.map((review) => ({
      kind: 'review_state' as const,
      source: 'github' as const,
      sourceUrl: review.detailsUrl,
      subjectSha: review.commitSha,
      observedAt,
    })),
  ];
}

export function evaluateGitHubPrAuditEvidence(input: EvaluateGitHubPrAuditInput): GitHubPrAuditResult {
  const findings: GitHubPrFinding[] = [];
  const initialHead = normalized(input.initialPullRequest.headSha);
  const finalHead = normalized(input.finalPullRequest.headSha);
  const expectedHead = normalized(input.expectedHeadSha);
  const headStable = Boolean(initialHead) && initialHead === finalHead;
  const prTruthStable = samePrTruth(input.initialPullRequest, input.finalPullRequest);
  const expectedHeadMatches = !expectedHead || expectedHead === initialHead;

  if (!headStable) {
    findings.push({
      severity: 'blocker',
      code: 'head_sha_changed_during_audit',
      message: `PR head changed during the audit (${input.initialPullRequest.headSha} -> ${input.finalPullRequest.headSha}).`,
    });
  } else if (!prTruthStable) {
    findings.push({
      severity: 'blocker',
      code: 'pr_truth_changed_during_audit',
      message: 'Load-bearing PR state changed during evidence collection; the audit must be repeated against a stable PR observation.',
    });
  }
  if (!expectedHeadMatches) {
    findings.push({
      severity: 'blocker',
      code: 'expected_head_sha_mismatch',
      message: `Expected head ${input.expectedHeadSha} but GitHub reported ${input.initialPullRequest.headSha}.`,
    });
  }

  const staleChecks = input.checks.filter((check) => normalized(check.headSha) !== initialHead);
  const staleStatuses = input.commitStatuses.filter((status) => normalized(status.headSha) !== initialHead);
  const staleWorkflows = input.workflows.filter((workflow) => normalized(workflow.headSha) !== initialHead);
  const ciBoundToHeadSha = staleChecks.length === 0 && staleStatuses.length === 0 && staleWorkflows.length === 0;
  if (!ciBoundToHeadSha) {
    findings.push({
      severity: 'blocker',
      code: 'ci_stale_for_head_sha',
      message: 'At least one CI observation belongs to a commit other than the current PR head SHA.',
    });
  }

  const incompleteCoverage = Object.entries(input.evidenceCoverage)
    .filter(([, complete]) => !complete)
    .map(([name]) => name.replace(/Complete$/, ''));
  if (incompleteCoverage.length > 0) {
    findings.push({
      severity: 'blocker',
      code: 'evidence_collection_truncated',
      message: `GitHub evidence was truncated for: ${incompleteCoverage.join(', ')}. The audit cannot claim complete evidence.`,
    });
  }

  const ci = ciConclusion(input.checks, input.commitStatuses, input.workflows);
  if (ci === 'unknown') {
    findings.push({
      severity: 'warning',
      code: 'ci_missing_or_unknown',
      message: 'No current, conclusive CI evidence was observed for this PR head.',
    });
  } else if (ci === 'pending') {
    findings.push({
      severity: 'warning',
      code: 'ci_pending',
      message: 'CI is still pending for the current PR head.',
    });
  } else if (ci === 'fail') {
    findings.push({
      severity: 'blocker',
      code: 'ci_failed',
      message: 'At least one current CI signal failed for the PR head.',
    });
  }

  const staleApprovals = input.reviews.filter((review) => (
    normalized(review.state) === 'approved'
    && Boolean(normalized(review.commitSha))
    && normalized(review.commitSha) !== initialHead
  ));
  if (staleApprovals.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'review_approval_stale_for_head_sha',
      message: 'At least one approval was recorded against an older commit and is not counted as approval for the current PR head.',
    });
  }

  const review = reviewDecision(input.reviews, initialHead);
  if (review === 'changes_requested') {
    findings.push({
      severity: 'blocker',
      code: 'review_changes_requested',
      message: 'GitHub review evidence currently includes changes requested for the observed PR head.',
    });
  }
  if (input.finalPullRequest.mergeable === null || input.finalPullRequest.mergeable === undefined) {
    findings.push({
      severity: 'info',
      code: 'mergeability_unknown',
      message: 'GitHub has not provided a conclusive mergeability value; this is not treated as safe.',
    });
  }

  const coverageComplete = incompleteCoverage.length === 0;
  const conflicted = !prTruthStable || !expectedHeadMatches;
  const incomplete = !ciBoundToHeadSha || !coverageComplete || ci === 'unknown' || ci === 'pending';
  const verdict = conflicted
    ? 'evidence_conflicted'
    : incomplete
      ? 'evidence_incomplete'
      : 'evidence_complete';

  return {
    contract: 'founder-control-room/github-pr-audit@v1',
    repository: input.repository,
    verdict,
    summary: {
      prNumber: input.finalPullRequest.number,
      title: input.finalPullRequest.title,
      baseSha: input.finalPullRequest.baseSha,
      headSha: input.finalPullRequest.headSha,
      prState: input.finalPullRequest.state,
      draft: input.finalPullRequest.draft,
      mergeable: input.finalPullRequest.mergeable,
      ciConclusion: ci,
      reviewDecision: review,
      changedFiles: input.finalPullRequest.changedFiles,
      additions: input.finalPullRequest.additions,
      deletions: input.finalPullRequest.deletions,
      commits: input.finalPullRequest.commits,
    },
    changedFiles: input.changedFiles,
    findings,
    evidence: evidenceRefs(input),
    verification: {
      checkedAt: input.checkedAt,
      ...(input.expectedHeadSha ? { expectedHeadSha: input.expectedHeadSha } : {}),
      headShaBound: headStable && expectedHeadMatches,
      ciBoundToHeadSha,
      evidenceCoverage: input.evidenceCoverage,
      freshness: conflicted || !ciBoundToHeadSha
        ? 'stale'
        : coverageComplete
          ? 'current'
          : 'unknown',
    },
    boundary: {
      evidenceAuditOnly: true,
      mergeApproved: false,
      mutationPerformed: false,
    },
  };
}
