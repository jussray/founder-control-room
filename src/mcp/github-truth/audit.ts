import { fingerprintNormalized } from '../../security/attack20V3.js';
import {
  GitHubAuditProviderError,
  type GitHubPrTruthEvidence,
  type GitHubPrTruthReaderLike,
} from '../../providers/GitHubPrTruthReader.js';
import type { ReviewSignal } from '../../providers/RepositoryProvider.js';
import { evaluatePrAuditEvidence } from './verification.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const PROOF_TTL_MS = 5 * 60 * 1000;
const AUDIT_CONTRACT = 'founder-control-room/github-pr-audit@v3' as const;
const COOKIE_CONTRACT = 'founder-control-room/external-read-cookie@v1' as const;
const FCR_REPOSITORY = 'jussray/founder-control-room';

export interface AuditGitHubPullRequestInput {
  repository: string;
  pullNumber: number;
  expectedHeadSha?: string;
}

type ReviewDecision = 'approved' | 'changes_requested' | 'none' | 'unknown';
type CiConclusion = 'pass' | 'fail' | 'pending' | 'unknown';

function normalizeSha(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeRepository(value: string): string {
  return value.trim().toLowerCase();
}

function latestReviewsByActor(reviews: readonly ReviewSignal[]): ReviewSignal[] {
  const latest = new Map<string, { review: ReviewSignal; index: number }>();
  reviews.forEach((review, index) => {
    const key = review.reviewerId.trim().toLowerCase();
    if (!key) return;
    const candidateTime = Date.parse(review.submittedAt ?? '') || 0;
    const current = latest.get(key);
    const currentTime = current ? Date.parse(current.review.submittedAt ?? '') || 0 : -1;
    if (!current || candidateTime > currentTime || (candidateTime === currentTime && index > current.index)) {
      latest.set(key, { review, index });
    }
  });
  return [...latest.values()].map((entry) => entry.review);
}

function reviewDecision(reviews: readonly ReviewSignal[], headSha: string): ReviewDecision {
  const latest = latestReviewsByActor(reviews);
  if (latest.some((review) => review.state === 'changes_requested')) return 'changes_requested';
  if (latest.some((review) => review.state === 'pending' || review.state === 'unknown')) return 'unknown';
  const currentApprovals = latest.filter(
    (review) => review.state === 'approved' && normalizeSha(review.commitSha) === headSha,
  );
  if (currentApprovals.length > 0) return 'approved';
  if (latest.some((review) => review.state === 'approved')) return 'unknown';
  return 'none';
}

function ciConclusion(findings: readonly string[], state: string): CiConclusion {
  if (state === 'evidence_complete') return 'pass';
  if (findings.some((finding) => [
    'required_check_failed',
    'required_check_cancelled',
    'required_check_neutral',
    'required_check_skipped',
  ].includes(finding))) return 'fail';
  if (findings.includes('required_check_pending')) return 'pending';
  return 'unknown';
}

function sanitizedChecks(evidence: GitHubPrTruthEvidence) {
  const headSha = evidence.finalContext.headSha;
  const requiredContexts = new Set(evidence.requiredChecks.requiredChecks.map((item) => item.context));
  return evidence.checks
    .filter((item) => normalizeSha(item.headSha) === headSha && requiredContexts.has(item.context))
    .map((item) => ({
      kind: item.kind,
      context: item.context,
      appId: item.appId ?? null,
      headSha: normalizeSha(item.headSha),
      status: item.status,
      conclusion: item.conclusion,
      observedAt: item.observedAt,
      providerRunId: item.providerRunId ?? null,
    }))
    .sort((left, right) => `${left.context}:${left.kind}:${left.providerRunId ?? ''}`.localeCompare(
      `${right.context}:${right.kind}:${right.providerRunId ?? ''}`,
    ));
}

function sanitizedReviews(reviews: readonly ReviewSignal[]) {
  return latestReviewsByActor(reviews)
    .map((review) => ({
      id: review.id,
      reviewerId: review.reviewerId,
      state: review.state,
      commitSha: normalizeSha(review.commitSha),
      provider: review.provider,
      submittedAt: review.submittedAt ?? null,
    }))
    .sort((left, right) => `${left.reviewerId}:${left.id}`.localeCompare(`${right.reviewerId}:${right.id}`));
}

function failedProviderResult(
  input: AuditGitHubPullRequestInput,
  checkedAt: string,
  finding: string,
) {
  return {
    contract: AUDIT_CONTRACT,
    repository: FCR_REPOSITORY,
    verdict: 'evidence_incomplete' as const,
    summary: {
      prNumber: input.pullNumber,
      targetBranch: null,
      sourceBranch: null,
      baseSha: null,
      headSha: input.expectedHeadSha ? normalizeSha(input.expectedHeadSha) : null,
      ciConclusion: 'unknown' as const,
      reviewDecision: 'unknown' as const,
      changedFiles: null,
      additions: null,
      deletions: null,
    },
    changedFiles: [],
    findings: [finding],
    diagnostics: [],
    verification: {
      checkedAt,
      expectedHeadSha: input.expectedHeadSha ? normalizeSha(input.expectedHeadSha) : null,
      expectedHeadMatches: false,
      identityStableAcrossRead: false,
      liveBaseStableAcrossRead: false,
      requiredCheckCoverage: 'incomplete' as const,
      collectionCompleteness: 'failed' as const,
      freshness: 'unknown' as const,
    },
    proof: null,
    boundary: {
      evidenceAuditOnly: true as const,
      mergeApproved: false as const,
      mutationPerformed: false as const,
      proofCookieGrantsAuthority: false as const,
      providerTokenAuthority: 'read_only' as const,
    },
  };
}

export async function auditGitHubPullRequest(
  reader: GitHubPrTruthReaderLike,
  input: AuditGitHubPullRequestInput,
  now: () => Date = () => new Date(),
) {
  if (normalizeRepository(input.repository) !== FCR_REPOSITORY) {
    throw new Error(`github_audit_pr is restricted to ${FCR_REPOSITORY}`);
  }
  if (!Number.isInteger(input.pullNumber) || input.pullNumber <= 0 || input.pullNumber > 2_147_483_647) {
    throw new Error('pullNumber must be a positive integer');
  }
  if (input.expectedHeadSha !== undefined && !FULL_SHA.test(input.expectedHeadSha.trim())) {
    throw new Error('expectedHeadSha must be a full 40-character commit SHA');
  }

  let evidence: GitHubPrTruthEvidence;
  try {
    evidence = await reader.readAuditEvidence(input.pullNumber);
  } catch (error) {
    const checkedAt = now().toISOString();
    const finding = error instanceof GitHubAuditProviderError
      ? error.finding
      : 'provider_response_malformed';
    return failedProviderResult(input, checkedAt, finding);
  }

  const checkedAtDate = now();
  const checkedAt = checkedAtDate.toISOString();
  const kernel = evaluatePrAuditEvidence({
    expectedHeadSha: input.expectedHeadSha,
    initialPr: evidence.initialPr,
    finalPr: evidence.finalPr,
    requiredChecks: evidence.requiredChecks,
    checks: evidence.checks,
    findings: evidence.kernelFindings,
    auditedAt: checkedAt,
  });

  const transportFindings = [...new Set(evidence.transportFindings)].sort();
  const verdict = kernel.state === 'evidence_conflicted'
    ? 'evidence_conflicted' as const
    : kernel.state === 'evidence_complete' && transportFindings.length === 0
      ? 'evidence_complete' as const
      : 'evidence_incomplete' as const;
  const findings = [...new Set([...kernel.findings, ...transportFindings])].sort();
  const final = evidence.finalContext;
  const finalHeadSha = normalizeSha(final.headSha);
  const liveBaseStable = evidence.liveBaseShaInitial === evidence.liveBaseShaFinal;
  const expectedHeadMatches = input.expectedHeadSha === undefined
    || normalizeSha(input.expectedHeadSha) === finalHeadSha;

  const changedFiles = [...evidence.diff.files]
    .map((file) => ({
      path: file.path,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const diffFingerprint = fingerprintNormalized({
    baseSha: evidence.liveBaseShaFinal,
    headSha: finalHeadSha,
    aheadBy: evidence.diff.aheadBy,
    behindBy: evidence.diff.behindBy,
    files: changedFiles,
  });
  const candidateFingerprint = fingerprintNormalized({
    repository: FCR_REPOSITORY,
    pullNumber: final.number,
    targetBranch: final.baseRef,
    liveBaseSha: evidence.liveBaseShaFinal,
    sourceBranch: final.headRef,
    headSha: finalHeadSha,
    diffFingerprint,
  });
  const evidenceFingerprint = fingerprintNormalized({
    candidateFingerprint,
    requiredCheckDiscovery: evidence.requiredChecks,
    exactRequiredChecks: sanitizedChecks(evidence),
    reviewSignals: sanitizedReviews(evidence.reviews),
    kernelState: kernel.state,
    findings,
  });
  const cookieId = fingerprintNormalized({
    contract: COOKIE_CONTRACT,
    candidateFingerprint,
    evidenceFingerprint,
    checkedAt,
  });
  const expiresAt = new Date(checkedAtDate.getTime() + PROOF_TTL_MS).toISOString();
  const review = reviewDecision(evidence.reviews, finalHeadSha);

  const diagnostics = [...new Set([
    ...evidence.diagnostics,
    ...(latestReviewsByActor(evidence.reviews).some(
      (item) => item.state === 'approved' && normalizeSha(item.commitSha) !== finalHeadSha,
    ) ? ['review_approval_stale_for_head_sha'] : []),
  ])].sort();

  return {
    contract: AUDIT_CONTRACT,
    repository: FCR_REPOSITORY,
    verdict,
    summary: {
      prNumber: final.number,
      title: final.title,
      targetBranch: final.baseRef,
      sourceBranch: final.headRef,
      baseSha: evidence.liveBaseShaFinal,
      headSha: finalHeadSha,
      authorIdentity: final.authorIdentity,
      ciConclusion: ciConclusion(findings, verdict),
      reviewDecision: review,
      changedFiles: changedFiles.length,
      additions: changedFiles.reduce((total, file) => total + file.additions, 0),
      deletions: changedFiles.reduce((total, file) => total + file.deletions, 0),
      aheadBy: evidence.diff.aheadBy,
      behindBy: evidence.diff.behindBy,
    },
    changedFiles,
    findings,
    diagnostics,
    evidence: {
      requiredChecks: evidence.requiredChecks.requiredChecks,
      exactRequiredChecks: sanitizedChecks(evidence),
      latestReviews: sanitizedReviews(evidence.reviews),
    },
    verification: {
      checkedAt,
      expectedHeadSha: input.expectedHeadSha ? normalizeSha(input.expectedHeadSha) : null,
      expectedHeadMatches,
      identityStableAcrossRead: !kernel.findings.includes('pr_identity_changed_during_collection'),
      liveBaseStableAcrossRead: liveBaseStable,
      requiredCheckCoverage: kernel.requiredCheckCoverage,
      collectionCompleteness: verdict === 'evidence_complete' ? 'complete' as const : 'incomplete' as const,
      freshness: 'current_at_read' as const,
    },
    proof: {
      diffFingerprint,
      candidateFingerprint,
      evidenceFingerprint,
      continuityCookie: {
        contract: COOKIE_CONTRACT,
        cookieId,
        contextType: 'external-read' as const,
        owner: 'founder-control-room-external-mcp',
        createdAt: checkedAt,
        expiresAt,
        parentCookieId: null,
        authority: 'observation_only' as const,
        browserCookie: false,
        reusableForAuthority: false,
      },
    },
    boundary: {
      evidenceAuditOnly: true as const,
      mergeApproved: false as const,
      mutationPerformed: false as const,
      proofCookieGrantsAuthority: false as const,
      providerTokenAuthority: 'read_only' as const,
    },
  };
}
