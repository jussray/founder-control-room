import { createGitHubAppJwt } from './githubAppAuth.js';
import type { ReviewSignal } from './RepositoryProvider.js';
import type {
  AuditFinding,
  NormalizedCheck,
  PullRequestObservation,
  RequiredCheckDiscovery,
  RequiredCheckDiscoveryFinding,
  RequiredCheckIdentity,
} from '../mcp/github-truth/types.js';

const FCR_REPOSITORY = 'jussray/founder-control-room';
const FCR_TARGET_BRANCH = 'main';
const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const MAX_RULESET_DETAILS = 20;
const MAX_COMPARE_FILES = 300;
const REQUEST_TIMEOUT_MS = 10_000;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const GITHUB_API_VERSION = '2022-11-28';

const READ_ONLY_PERMISSIONS = Object.freeze({
  administration: 'read',
  checks: 'read',
  contents: 'read',
  pull_requests: 'read',
  statuses: 'read',
} as const);

export type GitHubAuditProviderFinding =
  | 'provider_timeout'
  | 'provider_rate_limited'
  | 'provider_access_denied'
  | 'provider_response_malformed';

export class GitHubAuditProviderError extends Error {
  readonly finding: GitHubAuditProviderFinding;

  constructor(finding: GitHubAuditProviderFinding, message: string) {
    super(message);
    this.name = 'GitHubAuditProviderError';
    this.finding = finding;
  }
}

export interface GitHubPrAuditContext {
  number: number;
  repository: string;
  headRepository: string;
  baseRef: string;
  headRef: string;
  baseShaSnapshot: string;
  headSha: string;
  authorIdentity: string;
  title: string;
  state: 'open' | 'closed' | 'merged' | 'unknown';
  draft: boolean;
  observedAt: string;
}

export interface SanitizedDiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface GitHubPrTruthEvidence {
  initialContext: GitHubPrAuditContext;
  finalContext: GitHubPrAuditContext;
  initialPr: PullRequestObservation;
  finalPr: PullRequestObservation;
  liveBaseShaInitial: string;
  liveBaseShaFinal: string;
  requiredChecks: RequiredCheckDiscovery;
  checks: NormalizedCheck[];
  reviews: ReviewSignal[];
  diff: {
    baseSha: string;
    headSha: string;
    aheadBy: number;
    behindBy: number;
    files: SanitizedDiffFile[];
  };
  kernelFindings: AuditFinding[];
  transportFindings: string[];
  diagnostics: string[];
}

export interface GitHubPrTruthReaderLike {
  readAuditEvidence(pullNumber: number): Promise<GitHubPrTruthEvidence>;
}

export interface GitHubPrTruthReaderDependencies {
  fetchFn?: typeof fetch;
  now?: () => Date;
  apiBaseUrl?: string;
  tokenFactory?: (repository: string) => Promise<string>;
}

type JsonRecord = Record<string, unknown>;

type RequiredContext = {
  context: string;
  appId?: number;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function fullSha(value: unknown, label: string): string {
  const normalized = text(value).toLowerCase();
  if (!FULL_SHA.test(normalized)) {
    throw new GitHubAuditProviderError('provider_response_malformed', `${label} did not contain a full Git SHA`);
  }
  return normalized;
}

function apiBaseUrl(value: string | undefined): string {
  const parsed = new URL(value?.trim() || 'https://api.github.com');
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('GITHUB_API_BASE_URL must use http or https');
  }
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function repositoryParts(repository: string): { owner: string; repo: string } {
  const normalized = repository.trim().toLowerCase();
  if (normalized !== FCR_REPOSITORY) {
    throw new Error(`GitHub PR truth is restricted to ${FCR_REPOSITORY}`);
  }
  return { owner: 'jussray', repo: 'founder-control-room' };
}

function providerErrorForResponse(response: Response): GitHubAuditProviderError {
  const remaining = response.headers.get('x-ratelimit-remaining');
  if (response.status === 429 || (response.status === 403 && remaining === '0')) {
    return new GitHubAuditProviderError('provider_rate_limited', 'GitHub audit read was rate limited');
  }
  if (response.status === 401 || response.status === 403) {
    return new GitHubAuditProviderError('provider_access_denied', 'GitHub audit read was denied');
  }
  return new GitHubAuditProviderError(
    'provider_response_malformed',
    `GitHub audit read failed with HTTP ${response.status}`,
  );
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  if (!response.ok) throw providerErrorForResponse(response);
  try {
    return await response.json();
  } catch {
    throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub audit response was not valid JSON');
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
      throw new GitHubAuditProviderError('provider_timeout', 'GitHub audit read timed out');
    }
    throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub audit request failed before a response');
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
    throw new GitHubAuditProviderError(
      'provider_access_denied',
      'GitHub PR audit requires the repository-scoped GitHub App credentials',
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
    throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub App installation response was malformed');
  }
  const installationId = numberOrZero(installation.id);
  const observedAppId = String(installation.app_id ?? '');
  if (!Number.isInteger(installationId) || installationId <= 0 || observedAppId !== appId) {
    throw new GitHubAuditProviderError('provider_access_denied', 'GitHub App installation identity did not match the configured App');
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
  if (!isRecord(access) || !text(access.token)) {
    throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub App returned no repository-scoped audit token');
  }
  if (!isRecord(access.permissions)) {
    throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub App audit token omitted permission readback');
  }
  for (const [permission, expected] of Object.entries(READ_ONLY_PERMISSIONS)) {
    if (access.permissions[permission] !== expected) {
      throw new GitHubAuditProviderError(
        'provider_access_denied',
        `GitHub App audit token did not prove read-only ${permission} permission`,
      );
    }
  }
  return text(access.token);
}

function prContext(value: unknown, repository: string, observedAt: string): GitHubPrAuditContext {
  if (!isRecord(value) || !isRecord(value.base) || !isRecord(value.head)) {
    throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub pull-request response was malformed');
  }
  const baseRepo = isRecord(value.base.repo) ? value.base.repo : {};
  const headRepo = isRecord(value.head.repo) ? value.head.repo : {};
  const user = isRecord(value.user) ? value.user : {};
  const number = numberOrZero(value.number);
  const stateText = text(value.state).toLowerCase();
  const merged = Boolean(value.merged_at);
  const state: GitHubPrAuditContext['state'] = merged
    ? 'merged'
    : stateText === 'open'
      ? 'open'
      : stateText === 'closed'
        ? 'closed'
        : 'unknown';

  if (!Number.isInteger(number) || number <= 0) {
    throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub pull-request number was malformed');
  }
  const repositoryName = text(baseRepo.full_name).toLowerCase();
  if (repositoryName !== repository) {
    throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub pull-request repository identity changed');
  }

  return {
    number,
    repository: repositoryName,
    headRepository: text(headRepo.full_name).toLowerCase(),
    baseRef: text(value.base.ref),
    headRef: text(value.head.ref),
    baseShaSnapshot: fullSha(value.base.sha, 'pull-request base snapshot'),
    headSha: fullSha(value.head.sha, 'pull-request head'),
    authorIdentity: text(user.login).toLowerCase(),
    title: text(value.title),
    state,
    draft: value.draft === true,
    observedAt,
  };
}

function sameMutablePrIdentity(left: GitHubPrAuditContext, right: GitHubPrAuditContext): boolean {
  return left.number === right.number
    && left.repository === right.repository
    && left.headRepository === right.headRepository
    && left.baseRef === right.baseRef
    && left.headRef === right.headRef
    && left.authorIdentity === right.authorIdentity;
}

function pullObservation(context: GitHubPrAuditContext): PullRequestObservation {
  return {
    number: context.number,
    state: context.state,
    headSha: context.headSha,
    observedAt: context.observedAt,
  };
}

function statusFinding(error: unknown): RequiredCheckDiscoveryFinding {
  if (error instanceof GitHubAuditProviderError) {
    if (error.finding === 'provider_timeout') return 'required_check_discovery_timeout';
    if (error.finding === 'provider_rate_limited') return 'required_check_discovery_rate_limited';
    if (error.finding === 'provider_access_denied') return 'required_check_discovery_access_denied';
  }
  return 'required_check_discovery_response_malformed';
}

function patternMatchesBranch(pattern: string, branch: string, defaultBranch: string): 'yes' | 'no' | 'unknown' {
  if (pattern === '~ALL') return 'yes';
  if (pattern === '~DEFAULT_BRANCH') return branch === defaultBranch ? 'yes' : 'no';
  if (pattern === `refs/heads/${branch}`) return 'yes';
  if (pattern.startsWith('refs/heads/') && !/[?*\[\]{}]/.test(pattern)) return 'no';
  return 'unknown';
}

function rulesetAppliesToBranch(
  value: JsonRecord,
  branch: string,
  defaultBranch: string,
): { applies: boolean; ambiguous: boolean } {
  const conditions = isRecord(value.conditions) ? value.conditions : {};
  const refName = isRecord(conditions.ref_name) ? conditions.ref_name : {};
  const includes = Array.isArray(refName.include) ? refName.include.filter((item): item is string => typeof item === 'string') : [];
  const excludes = Array.isArray(refName.exclude) ? refName.exclude.filter((item): item is string => typeof item === 'string') : [];
  if (includes.length === 0) return { applies: false, ambiguous: true };

  let included = false;
  let ambiguous = false;
  for (const pattern of includes) {
    const result = patternMatchesBranch(pattern, branch, defaultBranch);
    if (result === 'yes') included = true;
    if (result === 'unknown') ambiguous = true;
  }
  if (!included && ambiguous) return { applies: false, ambiguous: true };
  if (!included) return { applies: false, ambiguous: false };

  for (const pattern of excludes) {
    const result = patternMatchesBranch(pattern, branch, defaultBranch);
    if (result === 'yes') return { applies: false, ambiguous: false };
    if (result === 'unknown') ambiguous = true;
  }
  return { applies: true, ambiguous };
}

function requiredContextsFromRule(value: unknown): RequiredContext[] {
  if (!isRecord(value) || value.type !== 'required_status_checks' || !isRecord(value.parameters)) return [];
  const required = Array.isArray(value.parameters.required_status_checks)
    ? value.parameters.required_status_checks
    : [];
  return required.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const context = text(entry.context);
    if (!context) return [];
    const integrationId = numberOrZero(entry.integration_id);
    return [{ context, ...(Number.isInteger(integrationId) && integrationId > 0 ? { appId: integrationId } : {}) }];
  });
}

function requiredContextsFromProtection(value: unknown): RequiredContext[] {
  if (!isRecord(value) || !isRecord(value.required_status_checks)) return [];
  const required = value.required_status_checks;
  const checks = Array.isArray(required.checks) ? required.checks : [];
  if (checks.length > 0) {
    return checks.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const context = text(entry.context);
      if (!context) return [];
      const appId = numberOrZero(entry.app_id);
      return [{ context, ...(Number.isInteger(appId) && appId > 0 ? { appId } : {}) }];
    });
  }
  const contexts = Array.isArray(required.contexts) ? required.contexts : [];
  return contexts.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((context) => ({ context: context.trim() }));
}

function uniqueRequiredContexts(values: RequiredContext[]): RequiredContext[] {
  const seen = new Set<string>();
  const result: RequiredContext[] = [];
  for (const value of values) {
    const key = `${value.context}:${value.appId ?? '*'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result.sort((left, right) => `${left.context}:${left.appId ?? 0}`.localeCompare(`${right.context}:${right.appId ?? 0}`));
}

function requiredIdentity(
  required: RequiredContext,
  observations: readonly NormalizedCheck[],
  findings: RequiredCheckDiscoveryFinding[],
): RequiredCheckIdentity {
  if (required.appId !== undefined) {
    return { kind: 'check_run', context: required.context, appId: required.appId };
  }
  const kinds = new Set(
    observations.filter((item) => item.context === required.context).map((item) => item.kind),
  );
  if (kinds.size === 1) {
    return { kind: [...kinds][0]!, context: required.context };
  }
  if (kinds.size > 1) findings.push('required_check_visibility_incomplete');
  // No exact-head observation means the requirement is missing either way. Use
  // check_run as the conservative FCR default while completeness remains fail-closed.
  return { kind: 'check_run', context: required.context };
}

export class GitHubPrTruthReader implements GitHubPrTruthReaderLike {
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
    dependencies: GitHubPrTruthReaderDependencies = {},
  ) {
    const parts = repositoryParts(repository);
    this.repository = FCR_REPOSITORY;
    this.owner = parts.owner;
    this.repo = parts.repo;
    this.fetchFn = dependencies.fetchFn ?? fetch;
    this.now = dependencies.now ?? (() => new Date());
    this.baseUrl = apiBaseUrl(dependencies.apiBaseUrl ?? env.GITHUB_API_BASE_URL);
    this.tokenFactory = dependencies.tokenFactory
      ? () => dependencies.tokenFactory!(this.repository)
      : () => defaultReadOnlyTokenFactory(this.repository, env, this.fetchFn, this.baseUrl);
  }

  private url(path: string): string {
    return `${this.baseUrl}/repos/${this.owner}/${this.repo}${path}`;
  }

  private async pull(token: string, pullNumber: number): Promise<GitHubPrAuditContext> {
    const observedAt = this.now().toISOString();
    const value = await requestJson(this.fetchFn, this.url(`/pulls/${pullNumber}`), token);
    return prContext(value, this.repository, observedAt);
  }

  private async branchSha(token: string, branch: string): Promise<string> {
    const value = await requestJson(
      this.fetchFn,
      this.url(`/branches/${encodeURIComponent(branch)}`),
      token,
    );
    if (!isRecord(value) || !isRecord(value.commit)) {
      throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub branch response was malformed');
    }
    return fullSha(value.commit.sha, 'live base branch');
  }

  private async checks(token: string, headSha: string): Promise<{ observations: NormalizedCheck[]; truncated: boolean }> {
    const observedAt = this.now().toISOString();
    const observations: NormalizedCheck[] = [];
    let totalCount = 0;
    let exhausted = false;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const value = await requestJson(
        this.fetchFn,
        this.url(`/commits/${headSha}/check-runs?filter=latest&per_page=${PAGE_SIZE}&page=${page}`),
        token,
      );
      if (!isRecord(value) || !Array.isArray(value.check_runs)) {
        throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub check-run response was malformed');
      }
      totalCount = Math.max(totalCount, numberOrZero(value.total_count));
      for (const item of value.check_runs) {
        if (!isRecord(item)) continue;
        const app = isRecord(item.app) ? item.app : {};
        const appId = numberOrZero(app.id);
        observations.push({
          kind: 'check_run',
          context: text(item.name),
          ...(Number.isInteger(appId) && appId > 0 ? { appId } : {}),
          headSha: fullSha(item.head_sha, 'check-run head'),
          observedAt,
          status: text(item.status) || null,
          conclusion: text(item.conclusion) || null,
          providerRunId: String(item.id ?? ''),
        });
      }
      if (value.check_runs.length < PAGE_SIZE) {
        exhausted = true;
        break;
      }
    }
    return {
      observations,
      truncated: !exhausted || (totalCount > 0 && observations.length < totalCount),
    };
  }

  private async statuses(token: string, headSha: string): Promise<{ observations: NormalizedCheck[]; truncated: boolean }> {
    const observedAt = this.now().toISOString();
    const observations: NormalizedCheck[] = [];
    let exhausted = false;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const value = await requestJson(
        this.fetchFn,
        this.url(`/commits/${headSha}/statuses?per_page=${PAGE_SIZE}&page=${page}`),
        token,
      );
      if (!Array.isArray(value)) {
        throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub commit-status response was malformed');
      }
      for (const item of value) {
        if (!isRecord(item)) continue;
        observations.push({
          kind: 'commit_status',
          context: text(item.context),
          headSha,
          observedAt,
          status: text(item.state) || null,
          conclusion: null,
          providerRunId: String(item.id ?? ''),
        });
      }
      if (value.length < PAGE_SIZE) {
        exhausted = true;
        break;
      }
    }
    return { observations, truncated: !exhausted };
  }

  private async reviews(token: string, pullNumber: number): Promise<{ reviews: ReviewSignal[]; truncated: boolean }> {
    const reviews: ReviewSignal[] = [];
    let exhausted = false;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const value = await requestJson(
        this.fetchFn,
        this.url(`/pulls/${pullNumber}/reviews?per_page=${PAGE_SIZE}&page=${page}`),
        token,
      );
      if (!Array.isArray(value)) {
        throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub review response was malformed');
      }
      for (const item of value) {
        if (!isRecord(item)) continue;
        const user = isRecord(item.user) ? item.user : {};
        const rawState = text(item.state).toLowerCase();
        const state: ReviewSignal['state'] = rawState === 'approved'
          ? 'approved'
          : rawState === 'changes_requested'
            ? 'changes_requested'
            : rawState === 'commented'
              ? 'commented'
              : rawState === 'dismissed'
                ? 'dismissed'
                : rawState === 'pending'
                  ? 'pending'
                  : 'unknown';
        reviews.push({
          id: String(item.id ?? ''),
          reviewerId: text(user.login),
          state,
          commitSha: text(item.commit_id).toLowerCase(),
          provider: 'github',
          submittedAt: text(item.submitted_at) || undefined,
          detailsUrl: text(item.html_url) || undefined,
        });
      }
      if (value.length < PAGE_SIZE) {
        exhausted = true;
        break;
      }
    }
    return { reviews, truncated: !exhausted };
  }

  private async rulesetSummaries(token: string): Promise<{ values: JsonRecord[]; truncated: boolean }> {
    const values: JsonRecord[] = [];
    let exhausted = false;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const value = await requestJson(
        this.fetchFn,
        this.url(`/rulesets?per_page=${PAGE_SIZE}&page=${page}`),
        token,
      );
      if (!Array.isArray(value)) {
        throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub ruleset response was malformed');
      }
      values.push(...value.filter(isRecord));
      if (value.length < PAGE_SIZE) {
        exhausted = true;
        break;
      }
    }
    return { values, truncated: !exhausted };
  }

  private async branchProtection(token: string, branch: string): Promise<unknown | null> {
    const url = this.url(`/branches/${encodeURIComponent(branch)}/protection`);
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new GitHubAuditProviderError('provider_timeout', 'GitHub branch-protection read timed out');
      }
      throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub branch-protection request failed');
    }
    if (response.status === 404) return null;
    return parseJsonResponse(response);
  }

  private async requiredChecks(
    token: string,
    branch: string,
    observations: readonly NormalizedCheck[],
  ): Promise<RequiredCheckDiscovery> {
    const observedAt = this.now().toISOString();
    const findings: RequiredCheckDiscoveryFinding[] = [];
    const required: RequiredContext[] = [];
    let sawRulesetRequirement = false;
    let sawProtectionRequirement = false;

    try {
      const summaries = await this.rulesetSummaries(token);
      if (summaries.truncated) findings.push('required_check_discovery_truncated');
      const activeBranchRulesets = summaries.values.filter((value) =>
        text(value.enforcement) === 'active' && text(value.target) === 'branch');
      if (activeBranchRulesets.length > MAX_RULESET_DETAILS) {
        findings.push('required_check_discovery_truncated');
      }
      for (const summary of activeBranchRulesets.slice(0, MAX_RULESET_DETAILS)) {
        const id = numberOrZero(summary.id);
        if (!Number.isInteger(id) || id <= 0) {
          findings.push('required_check_discovery_response_malformed');
          continue;
        }
        const detail = await requestJson(this.fetchFn, this.url(`/rulesets/${id}`), token);
        if (!isRecord(detail)) {
          findings.push('required_check_discovery_response_malformed');
          continue;
        }
        const applicability = rulesetAppliesToBranch(detail, branch, FCR_TARGET_BRANCH);
        if (applicability.ambiguous) findings.push('required_check_visibility_incomplete');
        if (!applicability.applies) continue;
        const rules = Array.isArray(detail.rules) ? detail.rules : [];
        for (const rule of rules) {
          const contexts = requiredContextsFromRule(rule);
          if (contexts.length > 0) sawRulesetRequirement = true;
          required.push(...contexts);
        }
      }
    } catch (error) {
      findings.push(statusFinding(error));
    }

    try {
      const protection = await this.branchProtection(token, branch);
      const contexts = requiredContextsFromProtection(protection);
      if (contexts.length > 0) sawProtectionRequirement = true;
      required.push(...contexts);
    } catch (error) {
      findings.push(statusFinding(error));
    }

    const unique = uniqueRequiredContexts(required);
    const identities = unique.map((item) => requiredIdentity(item, observations, findings));
    const normalizedFindings = [...new Set(findings)].sort();
    const source = sawRulesetRequirement
      ? 'ruleset' as const
      : sawProtectionRequirement
        ? 'branch_protection' as const
        : 'ruleset' as const;

    if (normalizedFindings.length > 0) {
      return {
        state: 'partial',
        source,
        requiredChecks: identities,
        observedAt,
        findings: normalizedFindings,
      };
    }
    return {
      state: 'complete',
      source,
      requiredChecks: identities,
      observedAt,
      findings: [],
    };
  }

  private async compare(token: string, baseSha: string, headSha: string) {
    const value = await requestJson(
      this.fetchFn,
      this.url(`/compare/${baseSha}...${headSha}?per_page=100&page=1`),
      token,
    );
    if (!isRecord(value) || !Array.isArray(value.files)) {
      throw new GitHubAuditProviderError('provider_response_malformed', 'GitHub compare response was malformed');
    }
    const files = value.files.filter(isRecord).map((file) => ({
      path: text(file.filename),
      status: text(file.status),
      additions: numberOrZero(file.additions),
      deletions: numberOrZero(file.deletions),
    }));
    return {
      baseSha,
      headSha,
      aheadBy: numberOrZero(value.ahead_by),
      behindBy: numberOrZero(value.behind_by),
      files,
      truncated: files.length >= MAX_COMPARE_FILES,
    };
  }

  async readAuditEvidence(pullNumber: number): Promise<GitHubPrTruthEvidence> {
    if (!Number.isInteger(pullNumber) || pullNumber <= 0 || pullNumber > 2_147_483_647) {
      throw new Error('pullNumber must be a positive integer');
    }
    const token = await this.tokenFactory();
    const kernelFindings: AuditFinding[] = [];
    const transportFindings: string[] = [];
    const diagnostics: string[] = [];

    const initialContext = await this.pull(token, pullNumber);
    if (initialContext.baseRef !== FCR_TARGET_BRANCH) transportFindings.push('target_branch_not_main');
    if (initialContext.state !== 'open' || initialContext.draft) kernelFindings.push('pr_not_open');
    const liveBaseShaInitial = await this.branchSha(token, initialContext.baseRef);
    if (initialContext.baseShaSnapshot !== liveBaseShaInitial) diagnostics.push('pr_base_snapshot_stale');

    const checkRuns = await this.checks(token, initialContext.headSha);
    const statuses = await this.statuses(token, initialContext.headSha);
    const checks = [...checkRuns.observations, ...statuses.observations];
    if (checkRuns.truncated || statuses.truncated) kernelFindings.push('collection_truncated');

    const requiredChecks = await this.requiredChecks(token, initialContext.baseRef, checks);
    const reviewPacket = await this.reviews(token, pullNumber);
    if (reviewPacket.truncated) transportFindings.push('review_collection_truncated');
    const diff = await this.compare(token, liveBaseShaInitial, initialContext.headSha);
    if (diff.truncated) kernelFindings.push('collection_truncated');
    if (diff.behindBy > 0) transportFindings.push('candidate_behind_live_base');

    const finalContext = await this.pull(token, pullNumber);
    const liveBaseShaFinal = await this.branchSha(token, finalContext.baseRef);
    if (!sameMutablePrIdentity(initialContext, finalContext)) {
      kernelFindings.push('pr_identity_changed_during_collection');
    }
    if (liveBaseShaInitial !== liveBaseShaFinal) {
      kernelFindings.push('pr_identity_changed_during_collection');
      transportFindings.push('live_base_changed_during_collection');
    }
    if (finalContext.baseShaSnapshot !== liveBaseShaFinal) diagnostics.push('pr_base_snapshot_stale');

    return {
      initialContext,
      finalContext,
      initialPr: pullObservation(initialContext),
      finalPr: pullObservation(finalContext),
      liveBaseShaInitial,
      liveBaseShaFinal,
      requiredChecks,
      checks,
      reviews: reviewPacket.reviews,
      diff,
      kernelFindings: [...new Set(kernelFindings)],
      transportFindings: [...new Set(transportFindings)].sort(),
      diagnostics: [...new Set(diagnostics)].sort(),
    };
  }
}

export function createGitHubPrTruthReader(
  repository: string,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: GitHubPrTruthReaderDependencies = {},
): GitHubPrTruthReader {
  return new GitHubPrTruthReader(repository, env, dependencies);
}
