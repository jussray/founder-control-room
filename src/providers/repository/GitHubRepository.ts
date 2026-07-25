/**
 * GitHub Repository Provider Implementation
 * Concrete implementation of RepositoryProvider interface
 * Can be swapped with GitLabRepository or GitBucketRepository
 */

import { Octokit } from '@octokit/rest'
import {
  RepositoryProvider,
  Repository,
  Branch,
  Commit,
  PullRequest,
  CreatePRPayload,
} from '../../core/interfaces'

export class GitHubRepository implements RepositoryProvider {
  constructor(private octokit: Octokit) {}

  async listRepositories(): Promise<Repository[]> {
    const { data } = await this.octokit.repos.listForAuthenticatedUser()
    return data.map((repo) => this.toRepository(repo))
  }

  async getRepository(owner: string, repo: string): Promise<Repository> {
    const { data } = await this.octokit.repos.get({ owner, repo })
    return this.toRepository(data)
  }

  async listPullRequests(owner: string, repo: string): Promise<PullRequest[]> {
    const { data } = await this.octokit.pulls.list({
      owner,
      repo,
      state: 'all',
    })
    return data.map((pr) => this.toPullRequest(pr))
  }

  async createBranch(owner: string, repo: string, branch: string): Promise<Branch> {
    // Get default branch SHA
    const { data: repoData } = await this.octokit.repos.get({ owner, repo })
    const { data: refData } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${repoData.default_branch}`,
    })

    // Create new branch
    const { data } = await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: refData.object.sha,
    })

    return {
      name: branch,
      sha: data.object.sha,
      protected: false,
    }
  }

  async createPullRequest(
    owner: string,
    repo: string,
    payload: CreatePRPayload
  ): Promise<PullRequest> {
    const { data } = await this.octokit.pulls.create({
      owner,
      repo,
      title: payload.title,
      body: payload.body,
      head: payload.head,
      base: payload.base,
    })
    return this.toPullRequest(data)
  }

  async mergePullRequest(owner: string, repo: string, prNumber: number): Promise<void> {
    await this.octokit.pulls.merge({
      owner,
      repo,
      pull_number: prNumber,
    })
  }

  async getCommits(owner: string, repo: string): Promise<Commit[]> {
    const { data } = await this.octokit.repos.listCommits({ owner, repo })
    return data.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author?.name || 'Unknown',
      timestamp: new Date(commit.commit.author?.date || Date.now()),
    }))
  }

  private toRepository(data: any): Repository {
    return {
      id: String(data.id),
      name: data.name,
      owner: data.owner.login,
      url: data.html_url,
      isPrivate: data.private,
      description: data.description,
    }
  }

  private toPullRequest(data: any): PullRequest {
    return {
      number: data.number,
      title: data.title,
      body: data.body,
      state: data.state,
      author: data.user.login,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    }
  }
}

/**
 * Factory function to create GitHub repository provider
 */
export function createGitHubRepository(): RepositoryProvider {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('Missing GitHub token')
  const octokit = new Octokit({ auth: token })
  return new GitHubRepository(octokit)
}
