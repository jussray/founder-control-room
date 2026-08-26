import { Octokit } from '@octokit/rest';
import { SecurityPreservingGitHubProvider } from './SecurityPreservingGitHubProvider.js';
import type { GitHubProviderConfig } from './GitHubProvider.js';
import type {
  BoundedProviderEvidence,
  PullRequestAuditChangedFile,
  PullRequestAuditCheckObservation,
  PullRequestAuditEvidence,
  PullRequestAuditObservation,
  PullRequestAuditReviewObservation,
  PullRequestAuditWorkflowObservation,
} from './PullRequestAuditEvidence.js';

function lastPageFromLink(link: string | undefined): number | null {
  if (!link) return null;
  for (const part of link.split(',')) {
    if (!part.includes('rel="last"')) continue;
    const match = part.match(/[?&]page=(\d+)/);
    if (!match) return null;
    const page = Number.parseInt(match[1] ?? '', 10);
    return Number.isInteger(page) && page > 0 ? page : null;
  }
  return null;
}

export class GitHubAuditRepositoryProvider extends SecurityPreservingGitHubProvider {
  private readonly auditOctokit: Octokit;
  private readonly auditProjectMap: Record<string, string>;

  constructor(config: GitHubProviderConfig) {
    super(config);
    this.auditOctokit = new Octokit({
      auth: config.token,
      userAgent: 'founder-control-room-repository-provider-pr-audit',
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    });
    this.auditProjectMap = config.projectMap;
  }

  private locateAuditRepository(projectId: string): { owner: string; repo: string } {
    const locator = this.auditProjectMap[projectId];
    if (!locator) {
      throw new Error(`GitHubAuditRepositoryProvider: no repo mapped for projectId "${projectId}"`);
    }
    const [owner, repo, ...rest] = locator.split('/');
    if (!owner || !repo || rest.length > 0) {
      throw new Error(`GitHubAuditRepositoryProvider: malformed locator "${locator}"`);
    }
    return { owner, repo };
  }

  private async pullRequest(
    owner: string,
    repo: string,
    pullRequestNumber: number,
  ): Promise<PullRequestAuditObservation> {
    const { data } = await this.auditOctokit.pulls.get({
      owner,
      repo,
      pull_number: pullRequestNumber,
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

  private async checks(
    owner: string,
    repo: string,
    headSha: string,
  ): Promise<BoundedProviderEvidence<PullRequestAuditCheckObservation>> {
    const { data } = await this.auditOctokit.checks.listForRef({
      owner,
      repo,
      ref: headSha,
      per_page: 100,
      filter: 'latest',
    });
    const items = data.check_runs.slice(0, 100).map((run) => ({
      id: String(run.id),
      name: run.name,
      status: run.status,
      ...(run.conclusion ? { conclusion: run.conclusion } : {}),
      headSha: run.head_sha,
      ...(run.completed_at ? { completedAt: run.completed_at } : {}),
      ...(run.details_url ? { detailsUrl: run.details_url } : {}),
    }));
    return {
      items,
      complete: data.total_count <= items.length,
      observedCount: items.length,
      totalCount: data.total_count,
    };
  }

  private async workflows(
    owner: string,
    repo: string,
    headSha: string,
  ): Promise<BoundedProviderEvidence<PullRequestAuditWorkflowObservation>> {
    const { data } = await this.auditOctokit.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      head_sha: headSha,
      per_page: 100,
    });
    const items = data.workflow_runs.slice(0, 100).map((run) => ({
      id: String(run.id),
      name: run.name ?? run.display_title ?? `workflow-${run.id}`,
      status: run.status ?? 'unknown',
      ...(run.conclusion ? { conclusion: run.conclusion } : {}),
      headSha: run.head_sha,
      updatedAt: run.updated_at,
      detailsUrl: run.html_url,
    }));
    return {
      items,
      complete: data.total_count <= items.length,
      observedCount: items.length,
      totalCount: data.total_count,
    };
  }

  private async reviews(
    owner: string,
    repo: string,
    pullRequestNumber: number,
  ): Promise<BoundedProviderEvidence<PullRequestAuditReviewObservation>> {
    const first = await this.auditOctokit.pulls.listReviews({
      owner,
      repo,
      pull_number: pullRequestNumber,
      per_page: 100,
      page: 1,
    });
    const hasNext = typeof first.headers.link === 'string' && first.headers.link.includes('rel="next"');
    const lastPage = hasNext ? lastPageFromLink(first.headers.link) : 1;
    let page = first.data;
    let totalCount: number | undefined = first.data.length;

    if (hasNext) {
      if (!lastPage || lastPage <= 1) {
        return { items: [], complete: false, observedCount: 0 };
      }
      const last = await this.auditOctokit.pulls.listReviews({
        owner,
        repo,
        pull_number: pullRequestNumber,
        per_page: 100,
        page: lastPage,
      });
      page = last.data;
      totalCount = ((lastPage - 1) * 100) + last.data.length;
    }

    const items = page.slice(-100).map((review) => ({
      id: String(review.id),
      reviewer: review.user?.login ?? 'unknown',
      state: review.state.toLowerCase(),
      ...(review.commit_id ? { commitSha: review.commit_id } : {}),
      ...(review.submitted_at ? { submittedAt: review.submitted_at } : {}),
      ...(review._links?.html?.href ? { detailsUrl: review._links.html.href } : {}),
    }));
    return {
      items,
      complete: !hasNext,
      observedCount: items.length,
      ...(totalCount !== undefined ? { totalCount } : {}),
    };
  }

  private async changedFiles(
    owner: string,
    repo: string,
    baseSha: string,
    headSha: string,
    expectedTotalCount: number,
  ): Promise<BoundedProviderEvidence<PullRequestAuditChangedFile>> {
    const { data } = await this.auditOctokit.repos.compareCommits({
      owner,
      repo,
      base: baseSha,
      head: headSha,
      per_page: 100,
    });
    const items = (data.files ?? []).slice(0, 100).map((file) => ({
      path: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
    }));
    return {
      items,
      complete: expectedTotalCount <= items.length,
      observedCount: items.length,
      totalCount: expectedTotalCount,
    };
  }

  async auditPullRequestEvidence(
    projectId: string,
    pullRequestNumber: number,
  ): Promise<PullRequestAuditEvidence> {
    if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0 || pullRequestNumber > 2_147_483_647) {
      throw new Error('GitHubAuditRepositoryProvider: pullRequestNumber must be a positive integer');
    }
    const { owner, repo } = this.locateAuditRepository(projectId);
    const initialPullRequest = await this.pullRequest(owner, repo, pullRequestNumber);
    const [checks, workflows, reviews, changedFiles] = await Promise.all([
      this.checks(owner, repo, initialPullRequest.headSha),
      this.workflows(owner, repo, initialPullRequest.headSha),
      this.reviews(owner, repo, pullRequestNumber),
      this.changedFiles(
        owner,
        repo,
        initialPullRequest.baseSha,
        initialPullRequest.headSha,
        initialPullRequest.changedFiles,
      ),
    ]);
    const finalPullRequest = await this.pullRequest(owner, repo, pullRequestNumber);

    return {
      initialPullRequest,
      finalPullRequest,
      checks,
      workflows,
      reviews,
      changedFiles,
    };
  }
}
