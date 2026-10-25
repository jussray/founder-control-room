import { fingerprintNormalized } from '../../security/attack20V3.js';
import {
  GitHubChangeGenealogyProviderError,
  type GitHubChangeGenealogyEvidence,
  type GitHubChangeGenealogyReaderLike,
  type GenealogyFinding,
} from '../../providers/GitHubChangeGenealogyReader.js';

const CONTRACT = 'founder-control-room/github-change-genealogy@v1' as const;
const RECEIPT_CONTRACT = 'founder-control-room/genealogy-failure-receipt@v1' as const;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const FULL_SHA = /^[0-9a-f]{40}$/i;

export interface AuditGitHubChangeGenealogyInput {
  repository: string;
  limit?: number;
  includeComments?: boolean;
  includeDiff?: boolean;
}

function failedProviderResult(input: AuditGitHubChangeGenealogyInput, finding: string, checkedAt: string) {
  const repository = input.repository.trim();
  const receiptId = fingerprintNormalized({
    contract: RECEIPT_CONTRACT,
    repository,
    scope: 'repository',
    finding,
    checkedAt,
  });
  return {
    contract: CONTRACT,
    repository,
    verdict: 'evidence_incomplete' as const,
    checkedAt,
    window: {
      limit: input.limit ?? DEFAULT_LIMIT,
      includeComments: input.includeComments ?? true,
      includeDiff: input.includeDiff ?? true,
    },
    defaultBranch: null,
    finalDefaultBranch: null,
    initialDefaultBranchSha: null,
    finalDefaultBranchSha: null,
    pullRequests: [],
    defaultBranchCommits: [],
    findings: [{ code: finding, scope: 'repository' }],
    failureReceipts: [{
      contract: RECEIPT_CONTRACT,
      receiptId,
      repository,
      scope: 'repository',
      code: finding,
      observedAt: checkedAt,
      authority: 'observation_only' as const,
    }],
    proof: null,
    boundary: {
      evidenceAuditOnly: true as const,
      patchBodiesReturned: false as const,
      commentsBoundedAndRedacted: true as const,
      commitIdentitiesIndexed: true as const,
      directCommitClassificationIsCandidateOnly: true as const,
      mergeApproved: false as const,
      mutationPerformed: false as const,
      proofGrantsAuthority: false as const,
    },
  };
}

function failureReceipt(repository: string, finding: GenealogyFinding, observedAt: string) {
  return {
    contract: RECEIPT_CONTRACT,
    receiptId: fingerprintNormalized({
      contract: RECEIPT_CONTRACT,
      repository,
      scope: finding.scope,
      code: finding.code,
      observedAt,
    }),
    repository,
    scope: finding.scope,
    code: finding.code,
    observedAt,
    authority: 'observation_only' as const,
  };
}

function summarizeEvidence(evidence: GitHubChangeGenealogyEvidence) {
  return evidence.pullRequests.map((entry) => ({
    pullRequest: entry.pullRequest,
    commits: entry.commits,
    comments: entry.comments,
    files: entry.files,
    proof: {
      commitLineageFingerprint: fingerprintNormalized({
        pullRequest: entry.pullRequest.number,
        baseSha: entry.pullRequest.baseSha,
        headSha: entry.pullRequest.headSha,
        mergeCommitSha: entry.pullRequest.mergeCommitSha,
        commits: entry.commits.map((commit) => ({ sha: commit.sha, parents: commit.parents })),
      }),
      diffFingerprint: fingerprintNormalized({
        pullRequest: entry.pullRequest.number,
        files: entry.files,
      }),
      commentFingerprint: fingerprintNormalized({
        pullRequest: entry.pullRequest.number,
        comments: entry.comments.map((comment) => ({
          id: comment.id,
          kind: comment.kind,
          authorIdentity: comment.authorIdentity,
          commitSha: comment.commitSha,
          path: comment.path,
          state: comment.state,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          bodyExcerpt: comment.bodyExcerpt,
        })),
      }),
    },
  }));
}

export async function auditGitHubChangeGenealogy(
  reader: GitHubChangeGenealogyReaderLike,
  input: AuditGitHubChangeGenealogyInput,
  now: () => Date = () => new Date(),
) {
  const repository = input.repository.trim();
  if (!repository || !repository.includes('/')) throw new Error('repository must be in owner/name form');
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  if (input.includeComments !== undefined && typeof input.includeComments !== 'boolean') {
    throw new Error('includeComments must be a boolean');
  }
  if (input.includeDiff !== undefined && typeof input.includeDiff !== 'boolean') {
    throw new Error('includeDiff must be a boolean');
  }

  let evidence: GitHubChangeGenealogyEvidence;
  try {
    evidence = await reader.readGenealogyEvidence({
      limit,
      includeComments: input.includeComments ?? true,
      includeDiff: input.includeDiff ?? true,
    });
  } catch (error) {
    const checkedAt = now().toISOString();
    const finding = error instanceof GitHubChangeGenealogyProviderError
      ? error.finding
      : 'provider_response_malformed';
    return failedProviderResult(input, finding, checkedAt);
  }

  const checkedAt = now().toISOString();
  const defaultBranchChanged = evidence.defaultBranch !== evidence.finalDefaultBranch
    || evidence.initialDefaultBranchSha !== evidence.finalDefaultBranchSha;
  const findings = [...evidence.findings];
  const evidenceMovedDuringCollection = findings.some((finding) =>
    finding.code === 'pull_request_changed_during_collection'
      || finding.code === 'default_branch_changed_during_collection');
  const failureReceipts = findings.map((finding) => failureReceipt(repository, finding, evidence.observedAt));
  const pullRequests = summarizeEvidence(evidence);

  const windowFingerprint = fingerprintNormalized({
    repository,
    defaultBranch: evidence.defaultBranch,
    finalDefaultBranch: evidence.finalDefaultBranch,
    initialDefaultBranchSha: evidence.initialDefaultBranchSha,
    finalDefaultBranchSha: evidence.finalDefaultBranchSha,
    limit: evidence.limit,
    includeComments: evidence.includeComments,
    includeDiff: evidence.includeDiff,
    pullRequests: pullRequests.map((entry) => ({
      number: entry.pullRequest.number,
      headSha: entry.pullRequest.headSha,
      mergeCommitSha: entry.pullRequest.mergeCommitSha,
      commitLineageFingerprint: entry.proof.commitLineageFingerprint,
      diffFingerprint: entry.proof.diffFingerprint,
      commentFingerprint: entry.proof.commentFingerprint,
    })),
    defaultBranchCommits: evidence.defaultBranchCommits.map((commit) => ({
      sha: commit.sha,
      parents: commit.parents,
      associatedPullRequests: commit.associatedPullRequests,
      attribution: commit.attribution,
    })),
  });

  const validHeads = FULL_SHA.test(evidence.initialDefaultBranchSha)
    && FULL_SHA.test(evidence.finalDefaultBranchSha);
  const verdict = !validHeads || defaultBranchChanged || evidenceMovedDuringCollection
    ? 'evidence_conflicted' as const
    : findings.length > 0
      ? 'evidence_incomplete' as const
      : 'evidence_complete' as const;

  return {
    contract: CONTRACT,
    repository,
    verdict,
    checkedAt,
    window: {
      limit: evidence.limit,
      includeComments: evidence.includeComments,
      includeDiff: evidence.includeDiff,
      returnedPullRequests: pullRequests.length,
      indexedPullRequestCommits: pullRequests.reduce((total, entry) => total + entry.commits.length, 0),
      scannedDefaultBranchCommits: evidence.defaultBranchCommits.length,
    },
    defaultBranch: evidence.defaultBranch,
    finalDefaultBranch: evidence.finalDefaultBranch,
    initialDefaultBranchSha: evidence.initialDefaultBranchSha,
    finalDefaultBranchSha: evidence.finalDefaultBranchSha,
    pullRequests,
    defaultBranchCommits: evidence.defaultBranchCommits,
    findings,
    failureReceipts,
    proof: {
      windowFingerprint,
      defaultBranchStableAcrossRead: !defaultBranchChanged,
      evidenceStableAcrossRead: !evidenceMovedDuringCollection,
      observedAt: evidence.observedAt,
    },
    boundary: {
      evidenceAuditOnly: true as const,
      patchBodiesReturned: false as const,
      commentsBoundedAndRedacted: true as const,
      commitIdentitiesIndexed: true as const,
      directCommitClassificationIsCandidateOnly: true as const,
      mergeApproved: false as const,
      mutationPerformed: false as const,
      proofGrantsAuthority: false as const,
    },
  };
}
