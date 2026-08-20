import { Octokit } from "@octokit/rest";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import type {
  RepositoryProvider,
  ProjectRepo,
  FileEntry,
  RepositoryRef,
  VerificationSignal,
  VerificationSignalStatus,
  ReviewSignal,
  ReviewSignalState,
  PullRequestReviewContext,
  Diff,
  DiffFile,
  Patch,
  RulesetConfig,
  RulesetResult,
} from "./RepositoryProvider.js";

export interface GitHubProviderConfig {
  token: string;
  /** Maps Control Room projectId -> "owner/repo". */
  projectMap: Record<string, string>;
  /**
   * Overrides Octokit's API base URL. Only ever set via GITHUB_API_BASE_URL
   * for pointing at a fake GitHub REST server in e2e/ — never set in
   * production, where this must remain unset so Octokit talks to the real
   * api.github.com.
   */
  baseUrl?: string;
}

const FCR_MAIN_CANONICAL_RULESET_NAME = "Founder Control Room main exact-head gate";
const FCR_MAIN_REQUIRED_STATUS_CHECKS = ["Required Gate", "Verify test-ledger contract"];

/**
 * First RepositoryProvider implementation. Talks to GitHub via Octokit so
 * every other Control Room subsystem can stay repository-agnostic.
 * Nothing outside this file should import `@octokit/rest`.
 */
export class GitHubProvider implements RepositoryProvider {
  readonly name = "github";
  private octokit: Octokit;
  private projectMap: Record<string, string>;
  private readonly resolvedRefs = new Map<string, string>();

  constructor(config: GitHubProviderConfig) {
    this.octokit = new Octokit({ auth: config.token, ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}) });
    this.projectMap = config.projectMap;
  }

  private locate(projectId: string): { owner: string; repo: string } {
    const locator = this.projectMap[projectId];
    if (!locator) {
      throw new Error(
        `GitHubProvider: no repo mapped for projectId "${projectId}"`,
      );
    }
    const [owner, repo] = locator.split("/");
    if (!owner || !repo) {
      throw new Error(
        `GitHubProvider: malformed locator "${locator}" for "${projectId}" (expected "owner/repo")`,
      );
    }
    return { owner, repo };
  }

  private resolvedRefKey(projectId: string, ref: string): string {
    return `${projectId}:${ref}`;
  }

  async getProject(projectId: string): Promise<ProjectRepo> {
    const { owner, repo } = this.locate(projectId);
    const { data } = await this.octokit.repos.get({ owner, repo });
    return {
      projectId,
      name: data.name,
      provider: this.name,
      defaultBranch: data.default_branch,
      locator: `${owner}/${repo}`,
      isActive: !data.archived,
    };
  }

  async listFiles(
    projectId: string,
    ref: string,
    path = "",
  ): Promise<FileEntry[]> {
    const { owner, repo } = this.locate(projectId);
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      ref,
      path,
    });
    const entries = Array.isArray(data) ? data : [data];
    return entries.map((entry) => ({
      path: entry.path,
      type: entry.type === "dir" ? "dir" : "file",
      size: "size" in entry ? entry.size : undefined,
    }));
  }

  async readFile(projectId: string, ref: string, path: string): Promise<string> {
    const { owner, repo } = this.locate(projectId);
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      ref,
      path,
    });
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      throw new Error(`GitHubProvider: "${path}"@${ref} is not a readable file`);
    }
    return Buffer.from(data.content, "base64").toString("utf-8");
  }

  async resolveRef(projectId: string, ref: string): Promise<string> {
    const { owner, repo } = this.locate(projectId);
    const { data } = await this.octokit.repos.getBranch({
      owner,
      repo,
      branch: ref,
    });
    const sha = data.commit.sha.toLowerCase();
    this.resolvedRefs.set(this.resolvedRefKey(projectId, ref), sha);
    return sha;
  }

  async getRef(projectId: string, ref: string): Promise<RepositoryRef> {
    const { owner, repo } = this.locate(projectId);
    const { data } = await this.octokit.repos.getCommit({ owner, repo, ref });
    return {
      name: ref,
      commitSha: data.sha,
      committedAt: data.commit.committer?.date ?? data.commit.author?.date ?? undefined,
    };
  }

  async listVerificationSignals(
    projectId: string,
    ref: string,
  ): Promise<VerificationSignal[]> {
    const { owner, repo } = this.locate(projectId);
    const resolved = await this.getRef(projectId, ref);
    const { data } = await this.octokit.checks.listForRef({
      owner,
      repo,
      ref: resolved.commitSha,
      per_page: 100,
      filter: "latest",
    });

    return data.check_runs.map((run) => ({
      id: String(run.id),
      name: run.name,
      status: mapCheckStatus(run.status, run.conclusion),
      commitSha: run.head_sha,
      provider: this.name,
      startedAt: run.started_at ?? undefined,
      completedAt: run.completed_at ?? undefined,
      detailsUrl: run.details_url ?? undefined,
    }));
  }

  async listReviewSignals(
    projectId: string,
    pullRequestNumber: number,
  ): Promise<ReviewSignal[]> {
    const { owner, repo } = this.locate(projectId);
    if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
      throw new Error("GitHubProvider: pullRequestNumber must be a positive integer");
    }

    const reviews = await this.octokit.paginate(this.octokit.pulls.listReviews, {
      owner,
      repo,
      pull_number: pullRequestNumber,
      per_page: 100,
    });

    return reviews.map((review) => ({
      id: String(review.id),
      reviewerId: review.user?.login ?? "",
      state: mapReviewState(review.state),
      commitSha: review.commit_id ?? "",
      provider: this.name,
      receiptHash: extractSingleReviewReceiptHash(review.body),
      submittedAt: review.submitted_at ?? undefined,
      detailsUrl: review._links?.html?.href ?? undefined,
    }));
  }

  async getPullRequestReviewContext(
    projectId: string,
    pullRequestNumber: number,
  ): Promise<PullRequestReviewContext> {
    const { owner, repo } = this.locate(projectId);
    if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
      throw new Error("GitHubProvider: pullRequestNumber must be a positive integer");
    }

    const { data } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });
    if (data.state !== "open") {
      throw new Error(`GitHubProvider: pull request #${pullRequestNumber} must be open for independent review`);
    }
    if (data.draft === true) {
      throw new Error(`GitHubProvider: pull request #${pullRequestNumber} must be ready for review, not draft`);
    }

    return {
      number: data.number,
      repository: `${owner}/${repo}`,
      headRepository: data.head.repo?.full_name ?? "",
      baseRef: data.base.ref,
      headRef: data.head.ref,
      baseSha: data.base.sha,
      headSha: data.head.sha,
      authorIdentity: data.user?.login ?? "",
    };
  }

  async createBranch(
    projectId: string,
    baseRef: string,
    name: string,
  ): Promise<string> {
    const { owner, repo } = this.locate(projectId);
    const base = await this.octokit.repos.getBranch({
      owner,
      repo,
      branch: baseRef,
    });
    await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${name}`,
      sha: base.data.commit.sha,
    });
    return name;
  }

  async commitPatch(
    projectId: string,
    branch: string,
    patch: Patch,
  ): Promise<string> {
    const { owner, repo } = this.locate(projectId);

    const branchData = await this.octokit.repos.getBranch({
      owner,
      repo,
      branch,
    });
    const baseTreeSha = branchData.data.commit.commit.tree.sha;
    const parentSha = branchData.data.commit.sha;

    const treeEntries = await Promise.all(
      patch.changes.map(async (change) => {
        if (change.delete) {
          return {
            path: change.path,
            mode: "100644" as const,
            type: "blob" as const,
            sha: null,
          };
        }
        const blob = await this.octokit.git.createBlob({
          owner,
          repo,
          content: change.content ?? "",
          encoding: "utf-8",
        });
        return {
          path: change.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blob.data.sha,
        };
      }),
    );

    const newTree = await this.octokit.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: treeEntries,
    });

    const commit = await this.octokit.git.createCommit({
      owner,
      repo,
      message: patch.message,
      tree: newTree.data.sha,
      parents: [parentSha],
      author: patch.authorEmail
        ? { name: patch.authorName, email: patch.authorEmail }
        : undefined,
    });

    await this.octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commit.data.sha,
    });

    return commit.data.sha;
  }

  async compare(projectId: string, base: string, head: string): Promise<Diff> {
    const { owner, repo } = this.locate(projectId);
    const { data } = await this.octokit.repos.compareCommits({
      owner,
      repo,
      base,
      head,
    });

    const files: DiffFile[] = (data.files ?? []).map((file) => ({
      path: file.filename,
      status: mapFileStatus(file.status),
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch,
    }));

    return {
      base,
      head,
      files,
      aheadBy: data.ahead_by,
      behindBy: data.behind_by,
    };
  }

  async integrate(projectId: string, base: string, head: string): Promise<string> {
    const { owner, repo } = this.locate(projectId);
    const key = this.resolvedRefKey(projectId, head);
    const exactHeadSha = /^[0-9a-f]{40}$/i.test(head)
      ? head.toLowerCase()
      : this.resolvedRefs.get(key);

    if (!exactHeadSha) {
      throw new Error(
        `GitHubProvider: integrate(${base}, ${head}) requires resolveRef(${head}) immediately beforehand`
      );
    }

    this.resolvedRefs.delete(key);

    const { data } = await this.octokit.repos.merge({
      owner,
      repo,
      base,
      head: exactHeadSha,
    });
    if (!data) {
      throw new Error(
        `GitHubProvider: integrate(${base}, ${exactHeadSha}) produced no merge commit — likely already up to date or conflicting`,
      );
    }
    return data.sha;
  }

  async deleteBranch(projectId: string, branch: string): Promise<void> {
    const { owner, repo } = this.locate(projectId);
    await this.octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
  }

  async applyBranchRuleset(
    projectId: string,
    config: RulesetConfig,
  ): Promise<RulesetResult> {
    const { owner, repo } = this.locate(projectId);
    const hardenFounderControlRoomMainGovernance =
      projectId === "founder-control-room"
      && config.enforcement === "active"
      && config.targetRefs.includes("main");

    if (hardenFounderControlRoomMainGovernance) {
      const errors = fcrMainRulesetConfigErrors(config);
      if (errors.length > 0) {
        throw new Error(`GitHubProvider: FCR main ruleset config rejected: ${errors.join("; ")}`);
      }
    }

    type RepoRule = NonNullable<
      RestEndpointMethodTypes["repos"]["createRepoRuleset"]["parameters"]
    >["rules"] extends (infer R)[] | undefined
      ? R
      : never;
    const rules: RepoRule[] = [];
    if (config.requirePullRequest) {
      rules.push({
        type: "pull_request",
        parameters: {
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_approving_review_count: config.requiredApprovingReviewCount,
          required_review_thread_resolution: true,
        },
      });
    }
    if (config.requiredStatusCheckNames.length > 0) {
      rules.push({
        type: "required_status_checks",
        parameters: {
          do_not_enforce_on_create: false,
          required_status_checks: config.requiredStatusCheckNames.map((context) => ({ context })),
          strict_required_status_checks_policy: true,
        },
      });
    }
    if (config.blockForcePushes) rules.push({ type: "non_fast_forward" });
    if (config.blockDeletion) rules.push({ type: "deletion" });

    const bypassActors = (config.bypassActors ?? []).map((actor) => {
      if (actor.kind === "app") {
        return { actor_type: "Integration" as const, actor_id: Number(actor.id), bypass_mode: "always" as const };
      }
      throw new Error(`GitHubProvider: unsupported bypass actor kind "${actor.kind}"`);
    });

    const payload = {
      owner,
      repo,
      name: config.name,
      target: "branch" as const,
      enforcement: config.enforcement,
      bypass_actors: bypassActors,
      conditions: {
        ref_name: {
          include: config.targetRefs.map((ref) => `refs/heads/${ref}`),
          exclude: [],
        },
      },
      rules,
    };

    const { data: existing } = await this.octokit.repos.getRepoRulesets({ owner, repo, per_page: 100 });
    const match = existing.find((ruleset) => ruleset.name === config.name);

    const { data } = match
      ? await this.octokit.repos.updateRepoRuleset({ ...payload, ruleset_id: match.id })
      : await this.octokit.repos.createRepoRuleset(payload);

    if (hardenFounderControlRoomMainGovernance) {
      const { data: readback } = await this.octokit.repos.getRepoRuleset({
        owner,
        repo,
        ruleset_id: data.id,
      });
      const errors = fcrMainRulesetReadbackErrors(config, readback);
      if (errors.length > 0) {
        throw new Error(`GitHubProvider: FCR main ruleset read-back mismatch: ${errors.join("; ")}`);
      }
    }

    return { id: String(data.id), name: data.name, enforcement: data.enforcement };
  }
}

type RulesetReadback = {
  name?: string;
  enforcement?: string;
  bypass_actors?: Array<{
    actor_type?: string;
    actor_id?: number;
    bypass_mode?: string;
  }>;
  conditions?: {
    ref_name?: {
      include?: string[];
    };
  };
  rules?: Array<{
    type?: string;
    parameters?: Record<string, unknown>;
  }>;
};

function fcrMainRulesetConfigErrors(config: RulesetConfig): string[] {
  const errors: string[] = [];
  if (config.name !== FCR_MAIN_CANONICAL_RULESET_NAME) {
    errors.push(`ruleset name must remain canonical: ${FCR_MAIN_CANONICAL_RULESET_NAME}`);
  }
  if (!config.requirePullRequest) errors.push("pull requests must be required");
  if (!Number.isInteger(config.requiredApprovingReviewCount) || config.requiredApprovingReviewCount !== 0) {
    errors.push("approving review count must be 0 under founder-final authority");
  }
  for (const check of FCR_MAIN_REQUIRED_STATUS_CHECKS) {
    if (!config.requiredStatusCheckNames.includes(check)) {
      errors.push(`required status check is missing: ${check}`);
    }
  }
  if (!config.blockForcePushes) errors.push("force pushes must be blocked");
  if (!config.blockDeletion) errors.push("branch deletion must be blocked");
  return errors;
}

function expectedBypassIdentities(config: RulesetConfig): string[] {
  return (config.bypassActors ?? [])
    .map((actor) => {
      if (actor.kind === "app") return `Integration:${Number(actor.id)}:always`;
      return `unsupported:${actor.kind}:${actor.id}`;
    })
    .sort();
}

function observedBypassIdentities(readback: RulesetReadback): string[] {
  return (readback.bypass_actors ?? [])
    .map((actor) => `${String(actor.actor_type ?? "")}:${Number(actor.actor_id)}:${String(actor.bypass_mode ?? "")}`)
    .sort();
}

function fcrMainRulesetReadbackErrors(config: RulesetConfig, value: unknown): string[] {
  const readback = (value && typeof value === "object" && !Array.isArray(value))
    ? value as RulesetReadback
    : {};
  const errors: string[] = [];
  if (readback.name !== config.name) errors.push("ruleset name did not round-trip");
  if (readback.enforcement !== config.enforcement) errors.push("ruleset enforcement did not round-trip");

  const observedTargets = readback.conditions?.ref_name?.include ?? [];
  for (const target of config.targetRefs) {
    const qualified = `refs/heads/${target}`;
    if (!observedTargets.includes(qualified)) errors.push(`provider read-back is missing requested target: ${qualified}`);
  }

  const expectedBypasses = expectedBypassIdentities(config);
  const observedBypasses = observedBypassIdentities(readback);
  if (JSON.stringify(observedBypasses) !== JSON.stringify(expectedBypasses)) {
    errors.push("provider read-back bypass actors do not match the requested policy");
  }

  const rules = Array.isArray(readback.rules) ? readback.rules : [];
  const pullRequest = rules.find((rule) => rule.type === "pull_request");
  const pullParameters = pullRequest?.parameters ?? {};
  if (!pullRequest) errors.push("pull request rule is missing");
  if (pullParameters.required_approving_review_count !== config.requiredApprovingReviewCount) {
    errors.push("approving review count does not match requested policy");
  }
  if (pullParameters.dismiss_stale_reviews_on_push !== false) {
    errors.push("stale-review dismissal must remain disabled when no human approvals are required");
  }
  if (pullParameters.require_last_push_approval !== false) {
    errors.push("last-push human approval must remain disabled under founder-final authority");
  }
  if (pullParameters.required_review_thread_resolution !== true) errors.push("review-thread resolution is not required");

  if (config.requiredStatusCheckNames.length > 0) {
    const statusChecks = rules.find((rule) => rule.type === "required_status_checks");
    const statusParameters = statusChecks?.parameters ?? {};
    if (!statusChecks) errors.push("required status checks rule is missing");
    if (statusParameters.strict_required_status_checks_policy !== true) errors.push("required status checks are not strict");
    const requiredChecks = Array.isArray(statusParameters.required_status_checks)
      ? statusParameters.required_status_checks
          .map((entry) => entry && typeof entry === "object" && "context" in entry ? String((entry as { context?: unknown }).context ?? "") : "")
          .filter(Boolean)
      : [];
    for (const required of config.requiredStatusCheckNames) {
      if (!requiredChecks.includes(required)) errors.push(`provider read-back is missing requested check: ${required}`);
    }
  }

  if (config.blockForcePushes && !rules.some((rule) => rule.type === "non_fast_forward")) {
    errors.push("force-push protection is missing");
  }
  if (config.blockDeletion && !rules.some((rule) => rule.type === "deletion")) {
    errors.push("deletion protection is missing");
  }
  return errors;
}

function extractSingleReviewReceiptHash(body: string | null | undefined): string | undefined {
  if (typeof body !== "string") return undefined;
  const matches = [...body.matchAll(/(?:^|\n)Review-Receipt:\s*([0-9a-f]{64})(?=\s|$)/gi)];
  if (matches.length !== 1) return undefined;
  return matches[0]?.[1]?.toLowerCase();
}

function mapReviewState(state: string): ReviewSignalState {
  switch (state.toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes_requested";
    case "COMMENTED":
      return "commented";
    case "DISMISSED":
      return "dismissed";
    case "PENDING":
      return "pending";
    default:
      return "unknown";
  }
}

function mapCheckStatus(
  status: string,
  conclusion: string | null,
): VerificationSignalStatus {
  if (status === "queued" || status === "requested" || status === "waiting") {
    return "queued";
  }
  if (status === "in_progress" || status === "pending") return "running";
  if (status !== "completed") return "unknown";

  switch (conclusion) {
    case "success":
    case "neutral":
      return "passed";
    case "skipped":
      return "skipped";
    case "cancelled":
    case "stale":
      return "cancelled";
    case "failure":
    case "timed_out":
    case "action_required":
    case "startup_failure":
      return "failed";
    default:
      return "unknown";
  }
}

function mapFileStatus(status: string): DiffFile["status"] {
  switch (status) {
    case "added":
      return "added";
    case "removed":
      return "removed";
    case "renamed":
      return "renamed";
    default:
      return "modified";
  }
}