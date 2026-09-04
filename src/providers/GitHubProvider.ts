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

const FCR_CODE_SCANNING_TOOL = "CodeQL";
const FCR_CODE_SCANNING_SECURITY_THRESHOLD = "high_or_higher";
const FCR_CODE_SCANNING_ALERTS_THRESHOLD = "errors";

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
  private readonly pullRequestContextByProject = new Map<string, PullRequestReviewContext>();

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
      issuer: run.app?.id != null
        ? {
            kind: "app" as const,
            id: String(run.app.id),
            name: run.app.slug ?? undefined,
          }
        : undefined,
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

    const context: PullRequestReviewContext = {
      number: data.number,
      repository: `${owner}/${repo}`,
      headRepository: data.head.repo?.full_name ?? "",
      baseRef: data.base.ref,
      headRef: data.head.ref,
      baseSha: data.base.sha,
      headSha: data.head.sha,
      authorIdentity: data.user?.login ?? "",
    };
    this.pullRequestContextByProject.set(projectId, context);
    return context;
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
    const headKey = this.resolvedRefKey(projectId, head);
    const exactHeadSha = /^[0-9a-f]{40}$/i.test(head)
      ? head.toLowerCase()
      : this.resolvedRefs.get(headKey);

    if (!exactHeadSha) {
      throw new Error(
        `GitHubProvider: integrate(${base}, ${head}) requires resolveRef(${head}) immediately beforehand`,
      );
    }

    if (projectId === "founder-control-room") {
      const context = this.pullRequestContextByProject.get(projectId);
      if (!context) {
        throw new Error("GitHubProvider: FCR integration requires provider-backed pull-request context");
      }
      if (context.baseRef !== base || context.headRef !== head) {
        throw new Error(
          `GitHubProvider: FCR integration refs changed after review context: expected ${context.baseRef}<-${context.headRef}, received ${base}<-${head}`,
        );
      }

      const baseKey = this.resolvedRefKey(projectId, base);
      const exactBaseSha = this.resolvedRefs.get(baseKey);
      if (!exactBaseSha) {
        throw new Error(
          `GitHubProvider: FCR integrate(${base}, ${head}) requires resolveRef(${base}) immediately beforehand`,
        );
      }
      if (exactBaseSha !== context.baseSha.toLowerCase()) {
        throw new Error(
          `GitHubProvider: FCR base moved after review context: current ${exactBaseSha}, reviewed ${context.baseSha}`,
        );
      }
      if (exactHeadSha !== context.headSha.toLowerCase()) {
        throw new Error(
          `GitHubProvider: FCR head moved after review context: current ${exactHeadSha}, reviewed ${context.headSha}`,
        );
      }

      this.resolvedRefs.delete(baseKey);
      this.resolvedRefs.delete(headKey);
      this.pullRequestContextByProject.delete(projectId);

      const { data } = await this.octokit.pulls.merge({
        owner,
        repo,
        pull_number: context.number,
        sha: exactHeadSha,
      });
      if (!data.merged || !data.sha) {
        throw new Error(
          `GitHubProvider: pull request #${context.number} did not merge: ${data.message ?? "provider returned no merge SHA"}`,
        );
      }
      return data.sha;
    }

    this.resolvedRefs.delete(headKey);

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
    const hardenFounderControlRoomMainReview =
      projectId === "founder-control-room"
      && config.enforcement === "active"
      && config.targetRefs.includes("main");
    const requireNativeHumanReview =
      hardenFounderControlRoomMainReview && config.requiredApprovingReviewCount > 0;

    if (hardenFounderControlRoomMainReview) {
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

    const reviewRules: RepoRule[] = [];
    if (config.requirePullRequest) {
      reviewRules.push({
        type: "pull_request",
        parameters: {
          dismiss_stale_reviews_on_push: hardenFounderControlRoomMainReview,
          require_code_owner_review: requireNativeHumanReview,
          require_last_push_approval: requireNativeHumanReview,
          required_approving_review_count: config.requiredApprovingReviewCount,
          required_review_thread_resolution: true,
        },
      });
    }
    if (hardenFounderControlRoomMainReview) {
      reviewRules.push({
        type: "code_scanning",
        parameters: {
          code_scanning_tools: [{
            tool: FCR_CODE_SCANNING_TOOL,
            security_alerts_threshold: FCR_CODE_SCANNING_SECURITY_THRESHOLD,
            alerts_threshold: FCR_CODE_SCANNING_ALERTS_THRESHOLD,
          }],
        },
      });
    }
    // For FCR main, strict status/base-freshness is deliberately moved to a
    // second no-bypass ruleset below. Other projects retain the prior single
    // ruleset behavior.
    if (config.requiredStatusCheckNames.length > 0 && !hardenFounderControlRoomMainReview) {
      reviewRules.push({
        type: "required_status_checks",
        parameters: {
          do_not_enforce_on_create: false,
          required_status_checks: config.requiredStatusCheckNames.map((context) => ({ context })),
          strict_required_status_checks_policy: true,
        },
      });
    }
    if (config.blockForcePushes) reviewRules.push({ type: "non_fast_forward" });
    if (config.blockDeletion) reviewRules.push({ type: "deletion" });

    const bypassActors = (config.bypassActors ?? []).map((actor) => {
      if (actor.kind === "app") {
        return {
          actor_type: "Integration" as const,
          actor_id: Number(actor.id),
          bypass_mode: hardenFounderControlRoomMainReview ? "pull_request" as const : "always" as const,
        };
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
      rules: reviewRules,
    };

    const { data: existing } = await this.octokit.repos.getRepoRulesets({ owner, repo, per_page: 100 });
    let freshnessComponent: NonNullable<RulesetResult["components"]>[number] | undefined;
    let reviewComponent: NonNullable<RulesetResult["components"]>[number] | undefined;

    if (hardenFounderControlRoomMainReview) {
      // Apply and verify the no-bypass freshness membrane FIRST. If any provider
      // call or readback fails, the review membrane is left untouched rather
      // than creating a transient weakening while migrating the topology.
      const freshnessName = fcrMainFreshnessRulesetName(config.name);
      const freshnessRules: RepoRule[] = [{
        type: "required_status_checks",
        parameters: {
          do_not_enforce_on_create: false,
          required_status_checks: config.requiredStatusCheckNames.map((context) => ({ context })),
          strict_required_status_checks_policy: true,
        },
      }];
      const freshnessPayload = {
        owner,
        repo,
        name: freshnessName,
        target: "branch" as const,
        enforcement: config.enforcement,
        bypass_actors: [],
        conditions: {
          ref_name: {
            include: config.targetRefs.map((ref) => `refs/heads/${ref}`),
            exclude: [],
          },
        },
        rules: freshnessRules,
      };
      const freshnessMatch = existing.find((ruleset) => ruleset.name === freshnessName);
      const { data: freshnessData } = freshnessMatch
        ? await this.octokit.repos.updateRepoRuleset({ ...freshnessPayload, ruleset_id: freshnessMatch.id })
        : await this.octokit.repos.createRepoRuleset(freshnessPayload);
      const { data: freshnessReadback } = await this.octokit.repos.getRepoRuleset({
        owner,
        repo,
        ruleset_id: freshnessData.id,
      });
      const freshnessErrors = fcrMainFreshnessRulesetReadbackErrors(
        config,
        freshnessName,
        freshnessReadback,
      );
      if (freshnessErrors.length > 0) {
        throw new Error(
          `GitHubProvider: FCR strict-freshness ruleset ${freshnessData.id} read-back mismatch: ${freshnessErrors.join("; ")}`,
        );
      }
      freshnessComponent = {
        purpose: "strict_freshness",
        id: String(freshnessData.id),
        name: freshnessData.name,
        enforcement: freshnessData.enforcement,
      };
    }

    const applyReviewMembrane = async () => {
      const match = existing.find((ruleset) => ruleset.name === config.name);
      const { data } = match
        ? await this.octokit.repos.updateRepoRuleset({ ...payload, ruleset_id: match.id })
        : await this.octokit.repos.createRepoRuleset(payload);

      reviewComponent = {
        purpose: "review",
        id: String(data.id),
        name: data.name,
        enforcement: data.enforcement,
      };

      if (hardenFounderControlRoomMainReview) {
        const { data: readback } = await this.octokit.repos.getRepoRuleset({
          owner,
          repo,
          ruleset_id: data.id,
        });
        const errors = fcrMainReviewRulesetReadbackErrors(config, readback);
        if (errors.length > 0) {
          throw new Error(`GitHubProvider: FCR review ruleset ${data.id} read-back mismatch: ${errors.join("; ")}`);
        }
      }
      return data;
    };

    const data = await applyReviewMembrane().catch((error: unknown) => {
      if (!freshnessComponent) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const reviewMutation = reviewComponent
        ? `; mutated review ruleset ${reviewComponent.name} (${reviewComponent.id}) also requires reconciliation`
        : "";
      throw new Error(
        `GitHubProvider: FCR review membrane failed after verified strict-freshness ruleset ${freshnessComponent.name} (${freshnessComponent.id})${reviewMutation}: ${message}`,
      );
    });

    return {
      id: String(data.id),
      name: data.name,
      enforcement: data.enforcement,
      ...(freshnessComponent
        ? {
            components: [
              reviewComponent ?? {
                purpose: "review",
                id: String(data.id),
                name: data.name,
                enforcement: data.enforcement,
              },
              freshnessComponent,
            ],
          }
        : {}),
    };
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
  if (!config.requirePullRequest) errors.push("pull requests must be required");
  if (!Number.isInteger(config.requiredApprovingReviewCount) || config.requiredApprovingReviewCount < 0) {
    errors.push("approving review count must be a non-negative integer");
  }
  const requiredChecks = config.requiredStatusCheckNames.map((name) => name.trim());
  if (requiredChecks.length === 0) {
    errors.push("at least one required status check is required for the no-bypass freshness membrane");
  }
  if (requiredChecks.some((name) => name.length === 0)) {
    errors.push("required status check names must be non-empty");
  }
  if (new Set(requiredChecks).size !== requiredChecks.length) {
    errors.push("required status check names must be unique");
  }
  const bypassActors = config.bypassActors ?? [];
  if (
    bypassActors.length !== 1
    || bypassActors[0]?.kind !== "app"
    || !/^\d+$/.test(bypassActors[0].id.trim())
  ) {
    errors.push("exactly one numeric GitHub App bypass actor is required");
  }
  return errors;
}

function fcrMainFreshnessRulesetName(reviewRulesetName: string): string {
  return `${reviewRulesetName} [strict freshness]`;
}

function expectedBypassIdentities(config: RulesetConfig): string[] {
  return (config.bypassActors ?? [])
    .map((actor) => {
      if (actor.kind === "app") return `Integration:${Number(actor.id)}:pull_request`;
      return `unsupported:${actor.kind}:${actor.id}`;
    })
    .sort();
}

function observedBypassIdentities(readback: RulesetReadback): string[] {
  return (readback.bypass_actors ?? [])
    .map((actor) => `${String(actor.actor_type ?? "")}:${Number(actor.actor_id)}:${String(actor.bypass_mode ?? "")}`)
    .sort();
}

function observedStatusCheckNames(readback: RulesetReadback): string[] {
  const rules = Array.isArray(readback.rules) ? readback.rules : [];
  const statusChecks = rules.find((rule) => rule.type === "required_status_checks");
  const statusParameters = statusChecks?.parameters ?? {};
  return (Array.isArray(statusParameters.required_status_checks)
    ? statusParameters.required_status_checks
        .map((entry) => entry && typeof entry === "object" && "context" in entry
          ? String((entry as { context?: unknown }).context ?? "").trim()
          : "")
        .filter(Boolean)
    : [])
    .sort();
}

function fcrMainReviewRulesetReadbackErrors(config: RulesetConfig, value: unknown): string[] {
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
  const requireNativeHumanReview = config.requiredApprovingReviewCount > 0;
  if (!pullRequest) errors.push("pull request rule is missing");
  if (pullParameters.required_approving_review_count !== config.requiredApprovingReviewCount) {
    errors.push("approving review count does not match requested policy");
  }
  if (pullParameters.dismiss_stale_reviews_on_push !== true) errors.push("stale approvals are not dismissed on push");
  if (pullParameters.require_code_owner_review !== requireNativeHumanReview) {
    errors.push("Code Owner review requirement does not match the requested native-review phase");
  }
  if (pullParameters.require_last_push_approval !== requireNativeHumanReview) {
    errors.push("last-push approval requirement does not match the requested native-review phase");
  }
  if (pullParameters.required_review_thread_resolution !== true) errors.push("review-thread resolution is not required");
  if (rules.some((rule) => rule.type === "required_status_checks")) {
    errors.push("review membrane must not own bypassable required-status freshness");
  }

  const codeScanningRules = rules.filter((rule) => rule.type === "code_scanning");
  if (codeScanningRules.length !== 1) {
    errors.push("review membrane must contain exactly one CodeQL code-scanning rule");
  } else {
    const codeScanningTools = Array.isArray(codeScanningRules[0]?.parameters?.code_scanning_tools)
      ? codeScanningRules[0].parameters.code_scanning_tools
      : [];
    const exactCodeQL = codeScanningTools.length === 1
      && codeScanningTools[0]
      && typeof codeScanningTools[0] === "object"
      && (codeScanningTools[0] as { tool?: unknown }).tool === FCR_CODE_SCANNING_TOOL
      && (codeScanningTools[0] as { security_alerts_threshold?: unknown }).security_alerts_threshold
        === FCR_CODE_SCANNING_SECURITY_THRESHOLD
      && (codeScanningTools[0] as { alerts_threshold?: unknown }).alerts_threshold
        === FCR_CODE_SCANNING_ALERTS_THRESHOLD;
    if (!exactCodeQL) errors.push("CodeQL code-scanning thresholds do not match the constitutional floor");
  }

  if (config.blockForcePushes && !rules.some((rule) => rule.type === "non_fast_forward")) {
    errors.push("force-push protection is missing");
  }
  if (config.blockDeletion && !rules.some((rule) => rule.type === "deletion")) {
    errors.push("deletion protection is missing");
  }

  const expectedRuleTypes = [
    "pull_request",
    "code_scanning",
    ...(config.blockForcePushes ? ["non_fast_forward"] : []),
    ...(config.blockDeletion ? ["deletion"] : []),
  ].sort();
  const observedRuleTypes = rules.map((rule) => String(rule.type ?? "")).filter(Boolean).sort();
  if (JSON.stringify(observedRuleTypes) !== JSON.stringify(expectedRuleTypes)) {
    errors.push("review membrane contains unexpected or missing rule types");
  }
  return errors;
}

function fcrMainFreshnessRulesetReadbackErrors(
  config: RulesetConfig,
  expectedName: string,
  value: unknown,
): string[] {
  const readback = (value && typeof value === "object" && !Array.isArray(value))
    ? value as RulesetReadback
    : {};
  const errors: string[] = [];
  if (readback.name !== expectedName) errors.push("freshness ruleset name did not round-trip");
  if (readback.enforcement !== config.enforcement) errors.push("freshness enforcement did not round-trip");

  const observedTargets = readback.conditions?.ref_name?.include ?? [];
  for (const target of config.targetRefs) {
    const qualified = `refs/heads/${target}`;
    if (!observedTargets.includes(qualified)) {
      errors.push(`freshness provider read-back is missing requested target: ${qualified}`);
    }
  }

  if (observedBypassIdentities(readback).length !== 0) {
    errors.push("strict freshness ruleset must have zero bypass actors");
  }

  const rules = Array.isArray(readback.rules) ? readback.rules : [];
  const statusRules = rules.filter((rule) => rule.type === "required_status_checks");
  if (statusRules.length !== 1) errors.push("strict freshness ruleset must contain exactly one required-status rule");
  const statusParameters = statusRules[0]?.parameters ?? {};
  if (statusParameters.strict_required_status_checks_policy !== true) {
    errors.push("strict freshness required status checks are not strict");
  }
  const expectedChecks = config.requiredStatusCheckNames.map((name) => name.trim()).sort();
  const observedChecks = observedStatusCheckNames(readback);
  if (JSON.stringify(observedChecks) !== JSON.stringify(expectedChecks)) {
    errors.push("strict freshness required status checks do not exactly match the requested policy");
  }
  const unexpectedRuleTypes = rules
    .map((rule) => String(rule.type ?? ""))
    .filter((type) => type !== "required_status_checks");
  if (unexpectedRuleTypes.length > 0) {
    errors.push(`strict freshness ruleset contains unexpected rules: ${unexpectedRuleTypes.join(", ")}`);
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