import { Octokit } from "@octokit/rest";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import type {
  RepositoryProvider,
  ProjectRepo,
  FileEntry,
  RepositoryRef,
  VerificationSignal,
  VerificationSignalStatus,
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

    // Consume the attestation once. A retry must resolve the branch again and
    // therefore cannot accidentally reuse an old approval after the ref moves.
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

    // Idempotent by name: re-applying the same config updates the existing
    // ruleset rather than creating a duplicate with the same intent.
    const { data: existing } = await this.octokit.repos.getRepoRulesets({ owner, repo, per_page: 100 });
    const match = existing.find((ruleset) => ruleset.name === config.name);

    const { data } = match
      ? await this.octokit.repos.updateRepoRuleset({ ...payload, ruleset_id: match.id })
      : await this.octokit.repos.createRepoRuleset(payload);

    return { id: String(data.id), name: data.name, enforcement: data.enforcement };
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
