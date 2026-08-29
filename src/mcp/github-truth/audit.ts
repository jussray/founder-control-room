import { fingerprintNormalized } from '../../security/attack20V3.js';
import type {
  GitHubPrTruthReaderLike,
  GitHubPrTruthEvidence,
} from '../../providers/GitHubPrTruthReader.js';
import type { PullRequestReviewContext, ReviewSignal, VerificationSignal } from '../../providers/RepositoryProvider.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const PROOF_TTL_MS = 5 * 60 * 1000;
const AUDIT_CONTRACT = 'founder-control-room/github-pr-audit@v2' as const;
const COOKIE_CONTRACT = 'founder-control-room/external-read-cookie@v1' as const;

export interface AuditGitHubPullRequestInput {
  repository: string;
  pullNumber: number;
  expectedHeadSha?: string;
}

type AuditVerdict = 'evidence_incomplete' | 'evidence_conflicted';
type CiConclusion = 'pass' | 'fail' | 'pending' | 'unknown';
type ReviewDecision = 'approved' | 'changes_requested' | 'none' | 'unknown';

function normalizeSha(value: string): string {
  return value.trim().toLowerCase();
}

function samePullRequestIdentity(left: PullRequestReviewContext, right: PullRequestReviewContext): boolean {
  return left.number === right.number
    && left.repository.toLowerCase() === right.repository.toLowerCase()
    && left.headRepository.toLowerCase() === right.headRepository.toLowerCase()
    && left.baseRef === right.baseRef
    && left.headRef === right.headRef
    && normalizeSha(left.baseSha) === normalizeSha(right.baseSha)
    && normalizeSha(left.headSha) === normalizeSha(right.headSha)
    && left.authorIdentity.toLowerCase() === right.authorIdentity.toLowerCase();
}

function exactHeadSignals(signals: readonly VerificationSignal[], headSha: string): VerificationSignal[] {
  const expected = normalizeSha(headSha);
  return signals.filter((signal) => normalizeSha(signal.commitSha) === expected);
}

function ciConclusion(signals: readonly VerificationSignal[], headSha: string): CiConclusion {
  const current = exactHeadSignals(signals, headSha);
  if (current.length === 0) return 'unknown';
  if (current.some((signal) => signal.status === 'failed' || signal.status === 'cancelled')) return 'fail';
  if (current.some((signal) => signal.status === 'queued' || signal.status === 'running')) return 'pending';
  if (current.some((signal) => signal.status === 'unknown' || signal.status === 'skipped')) return 'unknown';
  return current.every((signal) => signal.status === 'passed') ? 'pass' : 'unknown';
}

function latestReviewsByActor(reviews: readonly ReviewSignal[]): ReviewSignal[] {
  const latest = new Map<string, { review: ReviewSignal; index: number }>();
  reviews.forEach((review, index) => {
    const key = review.reviewerId.trim().toLowerCase();
    if (!key) return;
    const current = latest.get(key);
    const candidateTime = Date.parse(review.submittedAt ?? '') || 0;
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

  const approvals = latest.filter((review) => review.state === 'approved');
  if (approvals.some((review) => normalizeSha(review.commitSha) === normalizeSha(headSha))) return 'approved';
  if (approvals.length > 0) return 'unknown';
  return 'none';
}

function sanitizedDiff(evidence: GitHubPrTruthEvidence) {
  return [...evidence.diff.files]
    .map((file) => ({
      path: file.path,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function sanitizedSignals(signals: readonly VerificationSignal[]) {
  return [...signals]
    .map((signal) => ({
      id: signal.id,
      name: signal.name,
      status: signal.status,
      commitSha: normalizeSha(signal.commitSha),
      provider: signal.provider,
      evidenceFingerprint: signal.evidenceFingerprint ?? null,
      issuer: signal.issuer ? { kind: signal.issuer.kind, id: signal.issuer.id } : null,
      startedAt: signal.startedAt ?? null,
      completedAt: signal.completedAt ?? null,
    }))
    .sort((left, right) => `${left.name}:${left.id}`.localeCompare(`${right.name}:${right.id}`));
}

function sanitizedReviews(reviews: readonly ReviewSignal[]) {
  return [...reviews]
    .map((review) => ({
      id: review.id,
      reviewerId: review.reviewerId,
      state: review.state,
      commitSha: normalizeSha(review.commitSha),
      provider: review.provider,
      receiptHash: review.receiptHash ?? null,
      submittedAt: review.submittedAt ?? null,
    }))
    .sort((left, right) => `${left.reviewerId}:${left.id}`.localeCompare(`${right.reviewerId}:${right.id}`));
}

export async function auditGitHubPullRequest(
  reader: GitHubPrTruthReaderLike,
  input: AuditGitHubPullRequestInput,
  now: () => Date = () => new Date(),
) {
  if (!Number.isInteger(input.pullNumber) || input.pullNumber <= 0 || input.pullNumber > 2_147_483_647) {
    throw new Error('pullNumber must be a positive integer');
  }
  if (input.expectedHeadSha && !FULL_SHA.test(input.expectedHeadSha)) {
    throw new Error('expectedHeadSha must be a full 40-character commit SHA');
  }

  const checkedAtDate = now();
  const checkedAt = checkedAtDate.toISOString();
  const evidence = await reader.readAuditEvidence(input.pullNumber);
  const initial = evidence.initialPullRequest;
  const final = evidence.finalPullRequest;
  const finalHeadSha = normalizeSha(final.headSha);
  const identityStable = samePullRequestIdentity(initial, final);
  const expectedHeadMatches = !input.expectedHeadSha
    || normalizeSha(input.expectedHeadSha) === finalHeadSha;
  const currentSignals = exactHeadSignals(evidence.verificationSignals, finalHeadSha);
  const diffFiles = sanitizedDiff(evidence);

  const diffFingerprint = fingerprintNormalized({
    baseSha: normalizeSha(final.baseSha),
    headSha: finalHeadSha,
    files: diffFiles,
  });

  const candidateFingerprint = fingerprintNormalized({
    repository: input.repository.toLowerCase(),
    pullNumber: final.number,
    targetBranch: final.baseRef,
    baseSha: normalizeSha(final.baseSha),
    sourceBranch: final.headRef,
    headSha: finalHeadSha,
    diffFingerprint,
  });

  const evidenceFingerprint = fingerprintNormalized({
    candidateFingerprint,
    verificationSignals: sanitizedSignals(evidence.verificationSignals),
    reviewSignals: sanitizedReviews(evidence.reviewSignals),
    diffFingerprint,
  });

  const cookieId = fingerprintNormalized({
    contract: COOKIE_CONTRACT,
    candidateFingerprint,
    evidenceFingerprint,
    checkedAt,
  });
  const expiresAt = new Date(checkedAtDate.getTime() + PROOF_TTL_MS).toISOString();

  const findings = new Set<string>(['provider_collection_completeness_not_proven']);
  if (!identityStable) findings.add('pr_identity_changed_during_collection');
  if (!expectedHeadMatches) findings.add('expected_head_sha_mismatch');
  if (currentSignals.length === 0) findings.add('current_head_verification_signals_missing');
  if (evidence.verificationSignals.some((signal) => normalizeSha(signal.commitSha) !== finalHeadSha)) {
    findings.add('verification_signal_stale_for_head_sha');
  }
  if (latestReviewsByActor(evidence.reviewSignals).some(
    (review) => review.state === 'approved' && normalizeSha(review.commitSha) !== finalHeadSha,
  )) {
    findings.add('review_approval_stale_for_head_sha');
  }

  const verdict: AuditVerdict = identityStable ? 'evidence_incomplete' : 'evidence_conflicted';

  return {
    contract: AUDIT_CONTRACT,
    repository: input.repository.toLowerCase(),
    verdict,
    summary: {
      prNumber: final.number,
      targetBranch: final.baseRef,
      sourceBranch: final.headRef,
      baseSha: normalizeSha(final.baseSha),
      headSha: finalHeadSha,
      authorIdentity: final.authorIdentity,
      ciConclusion: ciConclusion(evidence.verificationSignals, finalHeadSha),
      reviewDecision: reviewDecision(evidence.reviewSignals, finalHeadSha),
      changedFiles: diffFiles.length,
      additions: diffFiles.reduce((total, file) => total + file.additions, 0),
      deletions: diffFiles.reduce((total, file) => total + file.deletions, 0),
    },
    changedFiles: diffFiles,
    findings: [...findings].sort(),
    verification: {
      checkedAt,
      expectedHeadSha: input.expectedHeadSha ? normalizeSha(input.expectedHeadSha) : null,
      expectedHeadMatches,
      identityStableAcrossRead: identityStable,
      exactHeadSignalCount: currentSignals.length,
      collectionCompleteness: 'not_proven' as const,
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
    },
  };
}
