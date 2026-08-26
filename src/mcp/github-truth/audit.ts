import type { GitHubPrTruthReader } from '../../providers/GitHubPrTruthReader.js';
import { evaluateGitHubPrAuditEvidence } from './verification.js';
import type { GitHubPrAuditResult } from './types.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;

export interface AuditGitHubPullRequestInput {
  repository: string;
  pullNumber: number;
  expectedHeadSha?: string;
}

export async function auditGitHubPullRequest(
  reader: GitHubPrTruthReader,
  input: AuditGitHubPullRequestInput,
  now: () => Date = () => new Date(),
): Promise<GitHubPrAuditResult> {
  if (!Number.isInteger(input.pullNumber) || input.pullNumber <= 0 || input.pullNumber > 2_147_483_647) {
    throw new Error('pullNumber must be a positive integer');
  }
  if (input.expectedHeadSha && !FULL_SHA.test(input.expectedHeadSha)) {
    throw new Error('expectedHeadSha must be a full 40-character commit SHA');
  }

  const evidence = await reader.readAuditEvidence(input.pullNumber);

  return evaluateGitHubPrAuditEvidence({
    repository: input.repository,
    initialPullRequest: evidence.initialPullRequest,
    finalPullRequest: evidence.finalPullRequest,
    checks: evidence.checks.items,
    workflows: evidence.workflows.items,
    reviews: evidence.reviews.items,
    changedFiles: evidence.changedFiles.items,
    evidenceCoverage: {
      checksComplete: evidence.checks.complete,
      workflowsComplete: evidence.workflows.complete,
      reviewsComplete: evidence.reviews.complete,
      changedFilesComplete: evidence.changedFiles.complete,
    },
    ...(input.expectedHeadSha ? { expectedHeadSha: input.expectedHeadSha } : {}),
    checkedAt: now().toISOString(),
  });
}
