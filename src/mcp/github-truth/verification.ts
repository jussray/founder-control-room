import type {
  GitHubPrAuditResult,
  GitHubPrCheckObservation,
  GitHubPrChangedFile,
  GitHubPrCiConclusion,
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
  workflows: GitHubPrWorkflowObservation[];
  reviews: GitHubPrReviewObservation[];
  changedFiles: GitHubPrChangedFile[];
  expectedHeadSha?: string;
  checkedAt: string;
}

function normalized(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function ciConclusion(
  checks: readonly GitHubPrCheckObservation[],
  workflows: readonly GitHubPrWorkflowObservation[],
): GitHubPrCiConclusion {
  const items = [
    ...checks.map((item) => ({ status: normalized(item.status), conclusion: normalized(item.conclusion) })),
    ...workflows.map((item) => ({ status: normalized(item.status), conclusion: normalized(item.conclusion) })),
  ];
  if (items.length === 0) return 'unknown';
  if (items.some((item) => ['queued', 'in_progress', 'requested', 'waiting', 'pending'].includes(item.status))) {
    return 'pending';
  }
  if (items.some((item) => ['failure', 'failed', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(item.conclusion))) {
    return 'fail';
  }
  if (items.some((item) => !item.conclusion && item.status !== 'completed')) return 'pending';
  if (items.every((item) => ['success', 'neutral', 'skipped'].includes(item.conclusion))) return 'pass';
  return 'unknown';
}

function reviewDecision(reviews: readonly GitHubPrReviewObservation[]): 'approved' | 'changes_requested' | 'none' | 'unknown' {
  if (reviews.length === 0) return 'none';
  const latestByReviewer = new Map<string, GitHubPrReviewObservation>();
  for (const review of [...reviews].sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))) {
    latestByReviewer.set(review.reviewer, review);
  }
  const states = [...latestByReviewer.values()].map((review) => normalized(review.state));
  if (states.includes('changes_requested')) return 'changes_requested';
  if (states.includes('approved')) return 'approved';
  if (states.every((state) => ['commented', 'dismissed', 'pending'].includes(state))) return 'none';
  return 'unknown';
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
  const expectedHeadMatches = !expectedHead || expectedHead === initialHead;

  if (!headStable) {
    findings.push({
      severity: 'blocker',
      code: 'head_sha_changed_during_audit',
      message: `PR head changed during the audit (${input.initialPullRequest.headSha} -> ${input.finalPullRequest.headSha}).`,
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
  const staleWorkflows = input.workflows.filter((workflow) => normalized(workflow.headSha) !== initialHead);
  const ciBoundToHeadSha = staleChecks.length === 0 && staleWorkflows.length === 0;
  if (!ciBoundToHeadSha) {
    findings.push({
      severity: 'blocker',
      code: 'ci_stale_for_head_sha',
      message: 'At least one CI observation belongs to a commit other than the current PR head SHA.',
    });
  }

  const ci = ciConclusion(input.checks, input.workflows);
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

  const review = reviewDecision(input.reviews);
  if (review === 'changes_requested') {
    findings.push({
      severity: 'blocker',
      code: 'review_changes_requested',
      message: 'GitHub review evidence currently includes changes requested.',
    });
  }
  if (input.initialPullRequest.mergeable === null || input.initialPullRequest.mergeable === undefined) {
    findings.push({
      severity: 'info',
      code: 'mergeability_unknown',
      message: 'GitHub has not provided a conclusive mergeability value; this is not treated as safe.',
    });
  }

  const conflicted = !headStable || !expectedHeadMatches;
  const incomplete = !ciBoundToHeadSha || ci === 'unknown' || ci === 'pending';
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
      prNumber: input.initialPullRequest.number,
      title: input.initialPullRequest.title,
      baseSha: input.initialPullRequest.baseSha,
      headSha: input.initialPullRequest.headSha,
      prState: input.initialPullRequest.state,
      draft: input.initialPullRequest.draft,
      mergeable: input.initialPullRequest.mergeable,
      ciConclusion: ci,
      reviewDecision: review,
      changedFiles: input.initialPullRequest.changedFiles,
      additions: input.initialPullRequest.additions,
      deletions: input.initialPullRequest.deletions,
      commits: input.initialPullRequest.commits,
    },
    changedFiles: input.changedFiles,
    findings,
    evidence: evidenceRefs(input),
    verification: {
      checkedAt: input.checkedAt,
      ...(input.expectedHeadSha ? { expectedHeadSha: input.expectedHeadSha } : {}),
      headShaBound: headStable && expectedHeadMatches,
      ciBoundToHeadSha,
      freshness: conflicted || !ciBoundToHeadSha ? 'stale' : 'current',
    },
    boundary: {
      evidenceAuditOnly: true,
      mergeApproved: false,
      mutationPerformed: false,
    },
  };
}
