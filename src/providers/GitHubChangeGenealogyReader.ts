import { createGitHubAppJwt } from './githubAppAuth.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const MAX_DEFAULT_BRANCH_COMMITS = 50;
const ASSOCIATION_CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 10_000;
const GITHUB_API_VERSION = '2022-11-28';
const GITHUB_API_BASE = 'https://api.github.com';
const FULL_SHA = /^[0-9a-f]{40}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const READ_ONLY_PERMISSIONS = Object.freeze({
  administration: 'read',
  checks: 'read',
  contents: 'read',
  pull_requests: 'read',
  statuses: 'read',
} as const);

type JsonRecord = Record<string, unknown>;

export type GenealogyFindingCode =
  | 'provider_timeout'
  | 'provider_rate_limited'
  | 'provider_access_denied'
  | 'provider_response_malformed'
  | 'recent_pr_collection_truncated'
  | 'pr_commit_collection_truncated'
  | 'pr_comment_collection_truncated'
  | 'pr_comment_collection_unavailable'
  | 'pr_diff_collection_truncated'
  | 'default_branch_history_truncated'
  | 'commit_pr_association_unavailable'
  | 'pull_request_changed_during_collection'
  | 'default_branch_changed_during_collection';

export interface GenealogyFinding {
  code: GenealogyFindingCode;
  scope: string;
}

export interface GenealogyPullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged' | 'unknown';
  draft: boolean;
  baseSha: string;
  headSha: string;
  mergeCommitSha: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  mergedAt: string | null;
  authorIdentity: string;
}

export interface GenealogyCommit {
  sha: string;
  parents: string[];
  message: string;
  authorIdentity: string | null;
  authoredAt: string | null;
  committedAt: string | null;
}

export interface GenealogyComment {
  id: string;
  kind: 'conversation' | 'review_comment' | 'review';
  authorIdentity: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  commitSha: string | null;
  path: string | null;
  state: string | null;
  bodyExcerpt: string;
}

export interface GenealogyDiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
}

export interface GenealogyPullRequestEvidence {
  pullRequest: GenealogyPullRequest;
  commits: GenealogyCommit[];
  comments: GenealogyComment[];
  files: GenealogyDiffFile[];
}

export interface DefaultBranchCommitEvidence extends GenealogyCommit {
  associatedPullRequests: number[];
  attribution: 'associated_pr' | 'direct_candidate' | 'unattributed_merge' | 'unknown';
}

export interface GitHubChangeGenealogyEvidence {
  repository: string;
  defaultBranch: string;
  finalDefaultBranch: string;
  initialDefaultBranchSha: string;
  finalDefaultBranchSha: string;
  observedAt: string;
  limit: number;
  includeComments: boolean;
  includeDiff: boolean;
  pullRequests: GenealogyPullRequestEvidence[];
  defaultBranchCommits: DefaultBranchCommitEvidence[];
  findings: GenealogyFinding[];
}

export interface GitHubChangeGenealogyReaderLike {
  readGenealogyEvidence(input?: {
    limit?: number;
    includeComments?: boolean;
    includeDiff?: boolean;
  }): Promise<GitHubChangeGenealogyEvidence>;
}

export interface GitHubChangeGenealogyReaderDependencies {
  fetchFn?: typeof fetch;
  now?: () => Date;
  apiBaseUrl?: string;
  tokenFactory?: (repository: string) => Promise<string>;
}

export class GitHubChangeGenealogyProviderError extends Error {
  readonly finding: Extract<
    GenealogyFindingCode,
    'provider_timeout' | 'provider_rate_limited' | 'provider_access_denied' | 'provider_response_malformed'
  >;

  constructor(finding: GitHubChangeGenealogyProviderError['finding'], message: string) {
    super(message);
    this.name = 'GitHubChangeGenealogyProviderError';
    this.finding = finding;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized || null;
}

function fullSha(value: unknown, label: string): string {
  const normalized = text(value).toLowerCase();
  if (!FULL_SHA.test(normalized)) {
    throw new GitHubChangeGenealogyProviderError(
      'provider_response_malformed',
      `${label} did not contain a full Git SHA`,
    );
  }
  return normalized;
}

function nullableSha(value: unknown): string | null {
  const normalized = text(value).toLowerCase();
  if (!normalized) return null;
  if (!FULL_SHA.test(normalized)) {
    throw new GitHubChangeGenealogyProviderError(
      'provider_response_malformed',
      'provider returned a malformed optional Git SHA',
    );
  }
  return normalized;
}

function apiBaseUrl(value: string | undefined, allowOverride: boolean): string {
  const parsed = new URL(value?.trim() || GITHUB_API_BASE);
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('GITHUB_API_BASE_URL must use http or https');
  }
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  const normalized = parsed.toString().replace(/\/$/, '');
  if (!allowOverride && normalized !== GITHUB_API_BASE) {
    throw new Error('GITHUB_API_BASE_URL overrides require an injected fetch transport');
  }
  return normalized;
}

function repositoryParts(repository: string): { owner: string; repo: string; repository: string } {
  const normalized = repository.trim();
  if (!REPOSITORY.test(normalized)) {
    throw new Error('repository must be in owner/name form');
  }
  const [owner, repo] = normalized.split('/');
  if (!owner || !repo) throw new Error('repository must be in owner/name form');
  return { owner, repo, repository: `${owner}/${repo}` };
}

function providerErrorForResponse(response: Response): GitHubChangeGenealogyProviderError {
  const remaining = response.headers.get('x-ratelimit-remaining');
  if (response.status === 429 || (response.status === 403 && remaining === '0')) {
    return new GitHubChangeGenealogyProviderError('provider_rate_limited', 'GitHub genealogy read was rate limited');
  }
  if (response.status === 401 || response.status === 403) {
    return new GitHubChangeGenealogyProviderError('provider_access_denied', 'GitHub genealogy read was denied');
  }
  return new GitHubChangeGenealogyProviderError(
    'provider_response_malformed',
    `GitHub genealogy read failed with HTTP ${response.status}`,
  );
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  if (!response.ok) throw providerErrorForResponse(response);
  try {
    return await response.json();
  } catch {
    throw new GitHubChangeGenealogyProviderError(
      'provider_response_malformed',
      'GitHub genealogy response was not valid JSON',
    );
  }
}

async function requestJson(
  fetchFn: typeof fetch,
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new GitHubChangeGenealogyProviderError('provider_timeout', 'GitHub genealogy read timed out');
    }
    throw new GitHubChangeGenealogyProviderError(
      'provider_response_malformed',
      'GitHub genealogy request failed before a response',
    );
  }
  return parseJsonResponse(response);
}

async function defaultReadOnlyTokenFactory(
  repository: string,
  env: NodeJS.ProcessEnv,
  fetchFn: typeof fetch,
  baseUrl: string,
): Promise<string> {
  const appId = env.GITHUB_APP_ID?.trim() ?? '';
  const privateKey = env.GITHUB_PRIVATE_KEY?.trim() ?? '';
  if (!/^\d+$/.test(appId) || !privateKey) {
    throw new GitHubChangeGenealogyProviderError(
      'provider_access_denied',
      'GitHub genealogy audit requires repository-scoped GitHub App credentials',
    );
  }

  const { owner, repo } = repositoryParts(repository);
  const appJwt = createGitHubAppJwt(appId, privateKey);
  const installation = await requestJson(
    fetchFn,
    `${baseUrl}/repos/${owner}/${repo}/installation`,
    appJwt,
  );
  if (!isRecord(installation)) {
    throw new GitHubChangeGenealogyProviderError('provider_response_malformed', 'GitHub App installation response was malformed');
  }
  const installationId = numberOrZero(installation.id);
  const observedAppId = String(installation.app_id ?? '');
  if (!Number.isInteger(installationId) || installationId <= 0 || observedAppId !== appId) {
    throw new GitHubChangeGenealogyProviderError(
      'provider_access_denied',
      'GitHub App installation identity did not match the configured App',
    );
  }

  const access = await requestJson(
    fetchFn,
    `${baseUrl}/app/installations/${installationId}/access_tokens`,
    appJwt,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositories: [repo], permissions: READ_ONLY_PERMISSIONS }),
    },
  );
  if (!isRecord(access) || !text(access.token) || !isRecord(access.permissions)) {
    throw new GitHubChangeGenealogyProviderError(
      'provider_response_malformed',
      'GitHub App genealogy token response was malformed',
    );
  }
  for (const [permission, expected] of Object.entries(READ_ONLY_PERMISSIONS)) {
    if (access.permissions[permission] !== expected) {
      throw new GitHubChangeGenealogyProviderError(
        'provider_access_denied',
        `GitHub App genealogy token did not prove read-only ${permission} permission`,
      );
    }
  }
  return text(access.token);
}

function stateOfPull(value: JsonRecord): GenealogyPullRequest['state'] {
  if (Boolean(value.merged_at)) return 'merged';
  const state = text(value.state).toLowerCase();
  if (state === 'open' || state === 'closed') return state;
  return 'unknown';
}

function pullRequest(value: JsonRecord): GenealogyPullRequest {
  if (!isRecord(value.base) || !isRecord(value.head)) {
    throw new GitHubChangeGenealogyProviderError('provider_response_malformed', 'GitHub pull request response was malformed');
  }
  const user = isRecord(value.user) ? value.user : {};
  const number = numberOrZero(value.number);
  if (!Number.isInteger(number) || number <= 0) {
    throw new GitHubChangeGenealogyProviderError('provider_response_malformed', 'GitHub pull request number was malformed');
  }
  return {
    number,
    title: text(value.title),
    state: stateOfPull(value),
    draft: value.draft === true,
    baseSha: fullSha(value.base.sha, 'pull request base'),
    headSha: fullSha(value.head.sha, 'pull request head'),
    mergeCommitSha: nullableSha(value.merge_commit_sha),
    createdAt: nullableText(value.created_at),
    updatedAt: nullableText(value.updated_at),
    mergedAt: nullableText(value.merged_at),
    authorIdentity: text(user.login).toLowerCase(),
  };
}

function samePullRequestObservation(left: GenealogyPullRequest, right: GenealogyPullRequest): boolean {
  return left.number === right.number
    && left.state === right.state
    && left.draft === right.draft
    && left.baseSha === right.baseSha
    && left.headSha === right.headSha
    && left.mergeCommitSha === right.mergeCommitSha
    && left.updatedAt === right.updatedAt
    && left.mergedAt === right.mergedAt
    && left.authorIdentity === right.authorIdentity;
}

function commit(value: JsonRecord): GenealogyCommit {
  const commitObject = isRecord(value.commit) ? value.commit : {};
  const author = isRecord(value.author) ? value.author : {};
  const commitAuthor = isRecord(commitObject.author) ? commitObject.author : {};
  const committer = isRecord(commitObject.committer) ? commitObject.committer : {};
  const parents = Array.isArray(value.parents)
    ? value.parents.filter(isRecord).map((parent) => fullSha(parent.sha, 'commit parent'))
    : [];
  return {
    sha: fullSha(value.sha, 'commit'),
    parents,
    message: text(commitObject.message).slice(0, 500),
    authorIdentity: nullableText(author.login)?.toLowerCase() ?? null,
    authoredAt: nullableText(commitAuthor.date),
    committedAt: nullableText(committer.date),
  };
}

function redactCommentBody(value: unknown): string {
  const body = text(value)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}=*\b/gi, 'Bearer [REDACTED]')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_API_KEY]');
  return body.slice(0, 1200);
}

function commentFromConversation(value: JsonRecord): GenealogyComment {
  const user = isRecord(value.user) ? value.user : {};
  return {
    id: String(value.id ?? ''),
    kind: 'conversation',
    authorIdentity: nullableText(user.login)?.toLowerCase() ?? null,
    createdAt: nullableText(value.created_at),
    updatedAt: nullableText(value.updated_at),
    commitSha: null,
    path: null,
    state: null,
    bodyExcerpt: redactCommentBody(value.body),
  };
}

function commentFromReviewComment(value: JsonRecord): GenealogyComment {
  const user = isRecord(value.user) ? value.user : {};
  return {
    id: String(value.id ?? ''),
    kind: 'review_comment',
    authorIdentity: nullableText(user.login)?.toLowerCase() ?? null,
    createdAt: nullableText(value.created_at),
    updatedAt: nullableText(value.updated_at),
    commitSha: nullableSha(value.commit_id),
    path: nullableText(value.path),
    state: null,
    bodyExcerpt: redactCommentBody(value.body),
  };
}

function commentFromReview(value: JsonRecord): GenealogyComment {
  const user = isRecord(value.user) ? value.user : {};
  return {
    id: String(value.id ?? ''),
    kind: 'review',
    authorIdentity: nullableText(user.login)?.toLowerCase() ?? null,
    createdAt: nullableText(value.submitted_at),
    updatedAt: nullableText(value.submitted_at),
    commitSha: nullableSha(value.commit_id),
    path: null,
    state: nullableText(value.state)?.toLowerCase() ?? null,
    bodyExcerpt: redactCommentBody(value.body),
  };
}

function diffFile(value: JsonRecord): GenealogyDiffFile {
  return {
    path: text(value.filename),
    status: text(value.status),
    additions: numberOrZero(value.additions),
    deletions: numberOrZero(value.deletions),
    changes: numberOrZero(value.changes),
  };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

export class GitHubChangeGenealogyReader implements GitHubChangeGenealogyReaderLike {
  private readonly repository: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;
  private readonly baseUrl: string;
  private readonly tokenFactory: () => Promise<string>;

  constructor(
    repository: string,
    env: NodeJS.ProcessEnv = process.env,
    dependencies: GitHubChangeGenealogyReaderDependencies = {},
  ) {
    const parts = repositoryParts(repository);
    this.repository = parts.repository;
    this.owner = parts.owner;
    this.repo = parts.repo;
    this.fetchFn = dependencies.fetchFn ?? fetch;
    this.now = dependencies.now ?? (() => new Date());
    this.baseUrl = apiBaseUrl(
      dependencies.apiBaseUrl ?? env.GITHUB_API_BASE_URL,
      Boolean(dependencies.fetchFn),
    );
    this.tokenFactory = dependencies.tokenFactory
      ? () => dependencies.tokenFactory!(this.repository)
      : () => defaultReadOnlyTokenFactory(this.repository, env, this.fetchFn, this.baseUrl);
  }

  private url(path: string): string {
    return `${this.baseUrl}/repos/${this.owner}/${this.repo}${path}`;
  }

  private async pagedArray(
    token: string,
    path: (page: number) => string,
  ): Promise<{ values: JsonRecord[]; truncated: boolean }> {
    const values: JsonRecord[] = [];
    let exhausted = false;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await requestJson(this.fetchFn, this.url(path(page)), token);
      if (!Array.isArray(result)) {
        throw new GitHubChangeGenealogyProviderError('provider_response_malformed', 'GitHub paged genealogy response was malformed');
      }
      values.push(...result.filter(isRecord));
      if (result.length < PAGE_SIZE) {
        exhausted = true;
        break;
      }
    }
    return { values, truncated: !exhausted };
  }

  private async repositoryDefaultBranch(token: string): Promise<string> {
    const value = await requestJson(this.fetchFn, this.url(''), token);
    if (!isRecord(value)) {
      throw new GitHubChangeGenealogyProviderError('provider_response_malformed', 'GitHub repository response was malformed');
    }
    const defaultBranch = text(value.default_branch);
    if (!defaultBranch) {
      throw new GitHubChangeGenealogyProviderError('provider_response_malformed', 'GitHub repository omitted default branch');
    }
    return defaultBranch;
  }

  private async branchSha(token: string, branch: string): Promise<string> {
    const value = await requestJson(
      this.fetchFn,
      this.url(`/branches/${encodeURIComponent(branch)}`),
      token,
    );
    if (!isRecord(value) || !isRecord(value.commit)) {
      throw new GitHubChangeGenealogyProviderError('provider_response_malformed', 'GitHub branch response was malformed');
    }
    return fullSha(value.commit.sha, 'default branch');
  }

  private async recentPullRequests(token: string, limit: number) {
    const result = await requestJson(
      this.fetchFn,
      this.url(`/pulls?state=all&sort=updated&direction=desc&per_page=${limit}`),
      token,
    );
    if (!Array.isArray(result)) {
      throw new GitHubChangeGenealogyProviderError('provider_response_malformed', 'GitHub recent pull request response was malformed');
    }
    return result.filter(isRecord).slice(0, limit).map(pullRequest);
  }

  private async pullRequestByNumber(token: string, pullNumber: number): Promise<GenealogyPullRequest> {
    const value = await requestJson(
      this.fetchFn,
      this.url(`/pulls/${pullNumber}`),
      token,
    );
    if (!isRecord(value)) {
      throw new GitHubChangeGenealogyProviderError('provider_response_malformed', 'GitHub pull request reread response was malformed');
    }
    return pullRequest(value);
  }

  private async pullCommits(token: string, pullNumber: number) {
    const packet = await this.pagedArray(
      token,
      (page) => `/pulls/${pullNumber}/commits?per_page=${PAGE_SIZE}&page=${page}`,
    );
    return { commits: packet.values.map(commit), truncated: packet.truncated };
  }

  private async pullComments(token: string, pullNumber: number) {
    const comments: GenealogyComment[] = [];
    let truncated = false;
    let unavailable = false;

    const collectors: Array<{
      path: (page: number) => string;
      map: (value: JsonRecord) => GenealogyComment;
    }> = [
      {
        path: (page) => `/issues/${pullNumber}/comments?per_page=${PAGE_SIZE}&page=${page}`,
        map: commentFromConversation,
      },
      {
        path: (page) => `/pulls/${pullNumber}/comments?per_page=${PAGE_SIZE}&page=${page}`,
        map: commentFromReviewComment,
      },
      {
        path: (page) => `/pulls/${pullNumber}/reviews?per_page=${PAGE_SIZE}&page=${page}`,
        map: commentFromReview,
      },
    ];

    for (const collector of collectors) {
      try {
        const packet = await this.pagedArray(token, collector.path);
        comments.push(...packet.values.map(collector.map));
        truncated ||= packet.truncated;
      } catch (error) {
        if (error instanceof GitHubChangeGenealogyProviderError && error.finding === 'provider_access_denied') {
          unavailable = true;
          continue;
        }
        throw error;
      }
    }

    return {
      comments: comments.sort((left, right) => `${left.createdAt ?? ''}:${left.id}`.localeCompare(`${right.createdAt ?? ''}:${right.id}`)),
      truncated,
      unavailable,
    };
  }

  private async pullFiles(token: string, pullNumber: number) {
    const packet = await this.pagedArray(
      token,
      (page) => `/pulls/${pullNumber}/files?per_page=${PAGE_SIZE}&page=${page}`,
    );
    return { files: packet.values.map(diffFile), truncated: packet.truncated };
  }

  private async defaultBranchHistory(token: string, branch: string, maxCommits: number) {
    const result = await requestJson(
      this.fetchFn,
      this.url(`/commits?sha=${encodeURIComponent(branch)}&per_page=${Math.min(maxCommits, PAGE_SIZE)}`),
      token,
    );
    if (!Array.isArray(result)) {
      throw new GitHubChangeGenealogyProviderError('provider_response_malformed', 'GitHub default-branch commit response was malformed');
    }
    return result.filter(isRecord).slice(0, maxCommits).map(commit);
  }

  private async associatedPullRequests(token: string, sha: string): Promise<number[]> {
    const value = await requestJson(
      this.fetchFn,
      this.url(`/commits/${sha}/pulls?per_page=100`),
      token,
    );
    if (!Array.isArray(value)) {
      throw new GitHubChangeGenealogyProviderError('provider_response_malformed', 'GitHub commit-to-PR association response was malformed');
    }
    return [...new Set(value.filter(isRecord)
      .map((item) => numberOrZero(item.number))
      .filter((number) => Number.isInteger(number) && number > 0))]
      .sort((left, right) => left - right);
  }

  async readGenealogyEvidence(input: {
    limit?: number;
    includeComments?: boolean;
    includeDiff?: boolean;
  } = {}): Promise<GitHubChangeGenealogyEvidence> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new Error(`limit must be an integer between 1 and ${MAX_LIMIT}`);
    }
    const includeComments = input.includeComments ?? true;
    const includeDiff = input.includeDiff ?? true;
    if (typeof includeComments !== 'boolean' || typeof includeDiff !== 'boolean') {
      throw new Error('includeComments and includeDiff must be booleans');
    }

    const token = await this.tokenFactory();
    const findings: GenealogyFinding[] = [];
    const defaultBranch = await this.repositoryDefaultBranch(token);
    const initialDefaultBranchSha = await this.branchSha(token, defaultBranch);
    const recentPulls = await this.recentPullRequests(token, limit);
    if (recentPulls.length === limit && limit === MAX_LIMIT) {
      findings.push({ code: 'recent_pr_collection_truncated', scope: 'repository:pull_requests' });
    }

    const pullRequests = await mapWithConcurrency(recentPulls, 3, async (pull) => {
      const commitPacket = await this.pullCommits(token, pull.number);
      if (commitPacket.truncated) {
        findings.push({ code: 'pr_commit_collection_truncated', scope: `pr:${pull.number}:commits` });
      }

      let comments: GenealogyComment[] = [];
      if (includeComments) {
        const commentPacket = await this.pullComments(token, pull.number);
        comments = commentPacket.comments;
        if (commentPacket.truncated) {
          findings.push({ code: 'pr_comment_collection_truncated', scope: `pr:${pull.number}:comments` });
        }
        if (commentPacket.unavailable) {
          findings.push({ code: 'pr_comment_collection_unavailable', scope: `pr:${pull.number}:comments` });
        }
      }

      let files: GenealogyDiffFile[] = [];
      if (includeDiff) {
        const diffPacket = await this.pullFiles(token, pull.number);
        files = diffPacket.files;
        if (diffPacket.truncated) {
          findings.push({ code: 'pr_diff_collection_truncated', scope: `pr:${pull.number}:files` });
        }
      }

      const finalPull = await this.pullRequestByNumber(token, pull.number);
      if (!samePullRequestObservation(pull, finalPull)) {
        findings.push({ code: 'pull_request_changed_during_collection', scope: `pr:${pull.number}` });
      }

      return {
        pullRequest: pull,
        commits: commitPacket.commits,
        comments,
        files,
      } satisfies GenealogyPullRequestEvidence;
    });

    const maxBranchCommits = Math.min(MAX_DEFAULT_BRANCH_COMMITS, Math.max(10, limit * 5));
    const branchHistory = await this.defaultBranchHistory(token, defaultBranch, maxBranchCommits);
    if (branchHistory.length >= maxBranchCommits) {
      findings.push({ code: 'default_branch_history_truncated', scope: `branch:${defaultBranch}:commits` });
    }

    const defaultBranchCommits = await mapWithConcurrency(
      branchHistory,
      ASSOCIATION_CONCURRENCY,
      async (branchCommit): Promise<DefaultBranchCommitEvidence> => {
        try {
          const associatedPullRequests = await this.associatedPullRequests(token, branchCommit.sha);
          const attribution: DefaultBranchCommitEvidence['attribution'] = associatedPullRequests.length > 0
            ? 'associated_pr'
            : branchCommit.parents.length === 1
              ? 'direct_candidate'
              : branchCommit.parents.length > 1
                ? 'unattributed_merge'
                : 'unknown';
          return { ...branchCommit, associatedPullRequests, attribution };
        } catch (error) {
          if (error instanceof GitHubChangeGenealogyProviderError) {
            findings.push({ code: 'commit_pr_association_unavailable', scope: `commit:${branchCommit.sha}` });
            return { ...branchCommit, associatedPullRequests: [], attribution: 'unknown' };
          }
          throw error;
        }
      },
    );

    const finalDefaultBranch = await this.repositoryDefaultBranch(token);
    const finalDefaultBranchSha = await this.branchSha(token, finalDefaultBranch);
    if (defaultBranch !== finalDefaultBranch || initialDefaultBranchSha !== finalDefaultBranchSha) {
      findings.push({ code: 'default_branch_changed_during_collection', scope: 'repository:default_branch' });
    }

    return {
      repository: this.repository,
      defaultBranch,
      finalDefaultBranch,
      initialDefaultBranchSha,
      finalDefaultBranchSha,
      observedAt: this.now().toISOString(),
      limit,
      includeComments,
      includeDiff,
      pullRequests,
      defaultBranchCommits,
      findings: findings.sort((left, right) => `${left.scope}:${left.code}`.localeCompare(`${right.scope}:${right.code}`)),
    };
  }
}

export function createGitHubChangeGenealogyReader(
  repository: string,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: GitHubChangeGenealogyReaderDependencies = {},
): GitHubChangeGenealogyReader {
  return new GitHubChangeGenealogyReader(repository, env, dependencies);
}
