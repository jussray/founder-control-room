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

  const initialPullRequest = await reader.getPullRequest(input.pullNumber);
  const [checks, workflows, reviews, changedFiles] = await Promise.all([
    reader.listChecks(initialPullRequest.headSha),
    reader.listWorkflowRuns(initialPullRequest.headSha),
    reader.listReviews(input.pullNumber),
    reader.listChangedFiles(initialPullRequest.baseSha, initialPullRequest.headSha),
  ]);
  const finalPullRequest = await reader.getPullRequest(input.pullNumber);

  return evaluateGitHubPrAuditEvidence({
    repository: input.repository,
    initialPullRequest,
    finalPullRequest,
    checks,
    workflows,
    reviews,
    changedFiles,
    ...(input.expectedHeadSha ? { expectedHeadSha: input.expectedHeadSha } : {}),
    checkedAt: now().toISOString(),
  });
}
