import { Octokit } from '@octokit/rest';
import { getGitHubInstallationToken } from './githubAppAuth.js';
import type {
  GitHubPrChangedFile,
  GitHubPrCheckObservation,
  GitHubPrObservation,
  GitHubPrReviewObservation,
  GitHubPrWorkflowObservation,
} from '../mcp/github-truth/types.js';

export interface GitHubPrTruthReaderDependencies {
  getInstallationToken?: typeof getGitHubInstallationToken;
}

function repositoryParts(repositoryIdentifier: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = repositoryIdentifier.split('/');
  if (!owner || !repo || rest.length > 0 || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error(`Malformed GitHub repository identifier: ${repositoryIdentifier}`);
  }
  return { owner, repo };
}

async function repositoryToken(
  repositoryIdentifier: string,
  env: NodeJS.ProcessEnv,
  dependencies: GitHubPrTruthReaderDependencies,
): Promise<string> {
  const appId = env.GITHUB_APP_ID?.trim();
  const privateKey = env.GITHUB_PRIVATE_KEY?.trim();
  const fallbackToken = env.GITHUB_TOKEN?.trim();
  if (Boolean(appId) !== Boolean(privateKey)) {
    throw new Error('GITHUB_APP_ID and GITHUB_PRIVATE_KEY must be configured together');
  }
  if (appId && privateKey) {
    return (dependencies.getInstallationToken ?? getGitHubInstallationToken)(
      appId,
      privateKey,
      repositoryIdentifier,
    );
  }
  if (fallbackToken) return fallbackToken;
  throw new Error('GitHub authentication is not configured for PR audit');
}

export class GitHubPrTruthReader {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(token: string, repositoryIdentifier: string, baseUrl?: string) {
    const { owner, repo } = repositoryParts(repositoryIdentifier);
    this.owner = owner;
    this.repo = repo;
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'founder-control-room-github-truth-mcp',
      ...(baseUrl ? { baseUrl } : {}),
    });
  }

  async getPullRequest(pullNumber: number): Promise<GitHubPrObservation> {
    const { data } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: pullNumber,
    });
    return {
      number: data.number,
      title: data.title,
      state: data.state === 'closed' ? 'closed' : 'open',
      draft: data.draft === true,
      baseRef: data.base.ref,
      headRef: data.head.ref,
      baseSha: data.base.sha,
      headSha: data.head.sha,
      ...(data.merge_commit_sha ? { mergeCommitSha: data.merge_commit_sha } : {}),
      mergeable: data.mergeable,
      changedFiles: data.changed_files,
      additions: data.additions,
      deletions: data.deletions,
      commits: data.commits,
      updatedAt: data.updated_at,
      url: data.html_url,
    };
  }

  async listChecks(commitSha: string): Promise<GitHubPrCheckObservation[]> {
    const { data } = await this.octokit.checks.listForRef({
      owner: this.owner,
      repo: this.repo,
      ref: commitSha,
      per_page: 100,
      filter: 'latest',
    });
    return data.check_runs.slice(0, 100).map((run) => ({
      id: String(run.id),
      name: run.name,
      status: run.status,
      ...(run.conclusion ? { conclusion: run.conclusion } : {}),
      headSha: run.head_sha,
      ...(run.completed_at ? { completedAt: run.completed_at } : {}),
      ...(run.details_url ? { detailsUrl: run.details_url } : {}),
    }));
  }

  async listWorkflowRuns(commitSha: string): Promise<GitHubPrWorkflowObservation[]> {
    const { data } = await this.octokit.actions.listWorkflowRunsForRepo({
      owner: this.owner,
      repo: this.repo,
      head_sha: commitSha,
      per_page: 100,
    });
    return data.workflow_runs.slice(0, 100).map((run) => ({
      id: String(run.id),
      name: run.name ?? run.display_title ?? `workflow-${run.id}`,
      status: run.status ?? 'unknown',
      ...(run.conclusion ? { conclusion: run.conclusion } : {}),
      headSha: run.head_sha,
      updatedAt: run.updated_at,
      detailsUrl: run.html_url,
    }));
  }

  async listReviews(pullNumber: number): Promise<GitHubPrReviewObservation[]> {
    const reviews = await this.octokit.paginate(this.octokit.pulls.listReviews, {
      owner: this.owner,
      repo: this.repo,
      pull_number: pullNumber,
      per_page: 100,
    });
    return reviews.slice(0, 100).map((review) => ({
      id: String(review.id),
      reviewer: review.user?.login ?? 'unknown',
      state: review.state.toLowerCase(),
      ...(review.commit_id ? { commitSha: review.commit_id } : {}),
      ...(review.submitted_at ? { submittedAt: review.submitted_at } : {}),
      ...(review.html_url ? { detailsUrl: review.html_url } : {}),
    }));
  }

  async listChangedFiles(baseSha: string, headSha: string): Promise<GitHubPrChangedFile[]> {
    const { data } = await this.octokit.repos.compareCommits({
      owner: this.owner,
      repo: this.repo,
      base: baseSha,
      head: headSha,
      per_page: 100,
    });
    return (data.files ?? []).slice(0, 100).map((file) => ({
      path: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
    }));
  }
}

export async function createGitHubPrTruthReader(
  repositoryIdentifier: string,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: GitHubPrTruthReaderDependencies = {},
): Promise<GitHubPrTruthReader> {
  const token = await repositoryToken(repositoryIdentifier, env, dependencies);
  return new GitHubPrTruthReader(token, repositoryIdentifier, env.GITHUB_API_BASE_URL);
}
