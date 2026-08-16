import type {
  Diff,
  DiffFile,
  FileEntry,
  Patch,
  ProjectRepo,
  RepositoryProvider,
  RepositoryRef,
  VerificationSignal,
  VerificationSignalStatus,
} from "./RepositoryProvider.js";

export interface GitLabProviderConfig {
  token: string;
  /** Maps Control Room projectId -> GitLab "group/project" path. */
  projectMap: Record<string, string>;
  /** GitLab origin or full API v4 base URL. Defaults to gitlab.com. */
  baseUrl?: string;
  /** Injectable network boundary for behavior tests. */
  fetchImpl?: typeof fetch;
}

interface GitLabProject {
  name: string;
  path_with_namespace: string;
  default_branch: string | null;
  archived: boolean;
  empty_repo?: boolean;
}

interface GitLabTreeEntry {
  path: string;
  type: "tree" | "blob" | string;
}

interface GitLabFile {
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  last_commit_id: string;
}

interface GitLabCommit {
  id: string;
  committed_date?: string;
  authored_date?: string;
  created_at?: string;
}

interface GitLabBranch {
  name: string;
  commit: GitLabCommit;
}

interface GitLabCommitStatus {
  id: number;
  name: string;
  sha: string;
  status: string;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  target_url?: string | null;
}

interface GitLabCompareDiff {
  old_path: string;
  new_path: string;
  diff: string;
  collapsed?: boolean;
  too_large?: boolean;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
}

interface GitLabCompareResponse {
  commits: GitLabCommit[];
  diffs: GitLabCompareDiff[];
  compare_timeout?: boolean;
  compare_same_ref?: boolean;
}

interface GitLabCommitAction {
  action: "create" | "update" | "delete";
  file_path: string;
  content?: string;
  last_commit_id?: string;
}

interface GitLabMergeRequest {
  iid: number;
  sha: string;
  state: string;
  merge_commit_sha?: string | null;
  squash_commit_sha?: string | null;
}

type QueryValue = string | number | boolean | undefined;

/**
 * GitLab implementation of the provider-neutral repository contract.
 *
 * It uses GitLab's REST API directly so FCR does not gain a second provider SDK
 * dependency. GitLab.com and self-managed GitLab instances share this API.
 */
export class GitLabProvider implements RepositoryProvider {
  readonly name = "gitlab";
  private readonly token: string;
  private readonly projectMap: Record<string, string>;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly resolvedRefs = new Map<string, string>();

  constructor(config: GitLabProviderConfig) {
    const token = config.token.trim();
    if (!token) {
      throw new Error("GitLabProvider: token is required");
    }

    const baseUrl = (config.baseUrl?.trim() || "https://gitlab.com").replace(/\/+$/, "");
    this.token = token;
    this.projectMap = config.projectMap;
    this.apiBaseUrl = baseUrl.endsWith("/api/v4") ? baseUrl : `${baseUrl}/api/v4`;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private locate(projectId: string): string {
    const locator = this.projectMap[projectId]?.trim();
    if (!locator) {
      throw new Error(`GitLabProvider: no repo mapped for projectId "${projectId}"`);
    }
    if (!locator.includes("/")) {
      throw new Error(
        `GitLabProvider: malformed locator "${locator}" for "${projectId}" (expected "group/project")`,
      );
    }
    return locator;
  }

  private projectPath(projectId: string): string {
    return `/projects/${encodeURIComponent(this.locate(projectId))}`;
  }

  private resolvedRefKey(projectId: string, ref: string): string {
    return `${projectId}:${ref}`;
  }

  private resolvedBranchForSha(projectId: string, sha: string): string | undefined {
    const prefix = `${projectId}:`;
    for (const [key, resolvedSha] of this.resolvedRefs) {
      if (key.startsWith(prefix) && resolvedSha === sha.toLowerCase()) {
        return key.slice(prefix.length);
      }
    }
    return undefined;
  }

  private buildUrl(path: string, query: Record<string, QueryValue> = {}): string {
    const url = new URL(`${this.apiBaseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async response(
    path: string,
    options: {
      method?: string;
      query?: Record<string, QueryValue>;
      body?: unknown;
    } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "PRIVATE-TOKEN": this.token,
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    return this.fetchImpl(this.buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      query?: Record<string, QueryValue>;
      body?: unknown;
    } = {},
  ): Promise<T> {
    const response = await this.response(path, options);
    if (!response.ok) {
      throw new Error(
        `GitLabProvider: ${options.method ?? "GET"} ${path} failed with HTTP ${response.status}`,
      );
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  private async requestOptional<T>(
    path: string,
    options: {
      query?: Record<string, QueryValue>;
    } = {},
  ): Promise<T | null> {
    const response = await this.response(path, options);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`GitLabProvider: GET ${path} failed with HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  async getProject(projectId: string): Promise<ProjectRepo> {
    const project = await this.request<GitLabProject>(this.projectPath(projectId));
    if (!project.default_branch || project.empty_repo) {
      throw new Error(`GitLabProvider: repository "${this.locate(projectId)}" has no default branch`);
    }

    return {
      projectId,
      name: project.name,
      provider: this.name,
      defaultBranch: project.default_branch,
      locator: project.path_with_namespace,
      isActive: !project.archived,
    };
  }

  async listFiles(projectId: string, ref: string, path = ""): Promise<FileEntry[]> {
    const entries: GitLabTreeEntry[] = [];
    const perPage = 100;

    for (let page = 1; ; page += 1) {
      const batch = await this.request<GitLabTreeEntry[]>(
        `${this.projectPath(projectId)}/repository/tree`,
        {
          query: {
            ref,
            path: path || undefined,
            recursive: false,
            per_page: perPage,
            page,
          },
        },
      );
      entries.push(...batch);
      if (batch.length < perPage) break;
    }

    return entries.map((entry) => ({
      path: entry.path,
      type: entry.type === "tree" ? "dir" : "file",
    }));
  }

  async readFile(projectId: string, ref: string, path: string): Promise<string> {
    const file = await this.request<GitLabFile>(
      `${this.projectPath(projectId)}/repository/files/${encodeURIComponent(path)}`,
      { query: { ref } },
    );
    if (file.encoding !== "base64") {
      throw new Error(`GitLabProvider: "${path}"@${ref} uses unsupported encoding "${file.encoding}"`);
    }
    return Buffer.from(file.content, "base64").toString("utf-8");
  }

  async resolveRef(projectId: string, ref: string): Promise<string> {
    const branch = await this.request<GitLabBranch>(
      `${this.projectPath(projectId)}/repository/branches/${encodeURIComponent(ref)}`,
    );
    const sha = branch.commit.id.toLowerCase();
    this.resolvedRefs.set(this.resolvedRefKey(projectId, ref), sha);
    return sha;
  }

  async getRef(projectId: string, ref: string): Promise<RepositoryRef> {
    const commit = await this.request<GitLabCommit>(
      `${this.projectPath(projectId)}/repository/commits/${encodeURIComponent(ref)}`,
    );
    return {
      name: ref,
      commitSha: commit.id,
      committedAt: commit.committed_date ?? commit.authored_date ?? commit.created_at,
    };
  }

  async listVerificationSignals(projectId: string, ref: string): Promise<VerificationSignal[]> {
    const resolved = await this.getRef(projectId, ref);
    const statuses: GitLabCommitStatus[] = [];
    const perPage = 100;

    for (let page = 1; ; page += 1) {
      const batch = await this.request<GitLabCommitStatus[]>(
        `${this.projectPath(projectId)}/repository/commits/${encodeURIComponent(resolved.commitSha)}/statuses`,
        { query: { all: true, per_page: perPage, page } },
      );
      statuses.push(...batch);
      if (batch.length < perPage) break;
    }

    return statuses.map((status) => ({
      id: String(status.id),
      name: status.name,
      status: mapGitLabStatus(status.status),
      commitSha: status.sha,
      provider: this.name,
      startedAt: status.started_at ?? status.created_at ?? undefined,
      completedAt: status.finished_at ?? undefined,
      detailsUrl: status.target_url ?? undefined,
    }));
  }

  async createBranch(projectId: string, baseRef: string, name: string): Promise<string> {
    const branch = await this.request<GitLabBranch>(
      `${this.projectPath(projectId)}/repository/branches`,
      {
        method: "POST",
        query: { branch: name, ref: baseRef },
      },
    );
    return branch.name;
  }

  async commitPatch(projectId: string, branch: string, patch: Patch): Promise<string> {
    if (patch.changes.length === 0) {
      throw new Error("GitLabProvider: commitPatch requires at least one file change");
    }
    if (new Set(patch.changes.map((change) => change.path)).size !== patch.changes.length) {
      throw new Error("GitLabProvider: commitPatch cannot contain duplicate file paths");
    }

    const actions = await Promise.all(
      patch.changes.map(async (change): Promise<GitLabCommitAction> => {
        const filePath = `${this.projectPath(projectId)}/repository/files/${encodeURIComponent(change.path)}`;
        const existing = await this.requestOptional<GitLabFile>(filePath, { query: { ref: branch } });

        if (change.delete) {
          if (!existing) {
            throw new Error(`GitLabProvider: cannot delete missing file "${change.path}"@${branch}`);
          }
          return {
            action: "delete",
            file_path: change.path,
            last_commit_id: existing.last_commit_id,
          };
        }

        if (!existing) {
          return {
            action: "create",
            file_path: change.path,
            content: change.content ?? "",
          };
        }

        return {
          action: "update",
          file_path: change.path,
          content: change.content ?? "",
          last_commit_id: existing.last_commit_id,
        };
      }),
    );

    const commit = await this.request<GitLabCommit>(
      `${this.projectPath(projectId)}/repository/commits`,
      {
        method: "POST",
        body: {
          branch,
          commit_message: patch.message,
          author_name: patch.authorName,
          ...(patch.authorEmail ? { author_email: patch.authorEmail } : {}),
          actions,
        },
      },
    );

    return commit.id;
  }

  async compare(projectId: string, base: string, head: string): Promise<Diff> {
    const [forward, reverse] = await Promise.all([
      this.request<GitLabCompareResponse>(`${this.projectPath(projectId)}/repository/compare`, {
        query: { from: base, to: head },
      }),
      this.request<GitLabCompareResponse>(`${this.projectPath(projectId)}/repository/compare`, {
        query: { from: head, to: base },
      }),
    ]);

    if (forward.compare_timeout) {
      throw new Error(`GitLabProvider: compare(${base}, ${head}) timed out or exceeded GitLab diff limits`);
    }
    if (forward.diffs.some((diff) => diff.too_large || diff.collapsed || typeof diff.diff !== "string")) {
      throw new Error(`GitLabProvider: compare(${base}, ${head}) returned incomplete file diffs`);
    }

    const files: DiffFile[] = forward.diffs.map((diff) => {
      const { additions, deletions } = countDiffLines(diff.diff);
      return {
        path: diff.new_path || diff.old_path,
        status: mapDiffStatus(diff),
        additions,
        deletions,
        patch: diff.diff,
      };
    });

    return {
      base,
      head,
      files,
      aheadBy: forward.commits.length,
      behindBy: reverse.commits.length,
    };
  }

  async integrate(projectId: string, base: string, head: string): Promise<string> {
    const headIsSha = /^[0-9a-f]{40}$/i.test(head);
    const sourceBranch = headIsSha ? this.resolvedBranchForSha(projectId, head) : head;
    const exactHeadSha = headIsSha
      ? head.toLowerCase()
      : this.resolvedRefs.get(this.resolvedRefKey(projectId, head));

    if (!sourceBranch || !exactHeadSha) {
      throw new Error(
        `GitLabProvider: integrate(${base}, ${head}) requires resolveRef(source branch) immediately beforehand`,
      );
    }
    if (sourceBranch === base) {
      throw new Error("GitLabProvider: source and target branches must differ");
    }

    const mergeRequest = await this.request<GitLabMergeRequest>(
      `${this.projectPath(projectId)}/merge_requests`,
      {
        method: "POST",
        body: {
          source_branch: sourceBranch,
          target_branch: base,
          title: `Founder Control Room integration: ${sourceBranch} -> ${base}`,
        },
      },
    );

    if (!mergeRequest.sha || mergeRequest.sha.toLowerCase() !== exactHeadSha) {
      await this.closeMergeRequest(projectId, mergeRequest.iid);
      throw new Error(
        `GitLabProvider: merge request head changed before integration (${mergeRequest.sha || "missing"})`,
      );
    }

    this.resolvedRefs.delete(this.resolvedRefKey(projectId, sourceBranch));

    try {
      await this.request<GitLabMergeRequest>(
        `${this.projectPath(projectId)}/merge_requests/${mergeRequest.iid}/merge`,
        {
          method: "PUT",
          body: {
            sha: exactHeadSha,
            should_remove_source_branch: false,
          },
        },
      );
    } catch (error) {
      try {
        await this.closeMergeRequest(projectId, mergeRequest.iid);
      } catch (cleanupError) {
        const primary = error instanceof Error ? error.message : String(error);
        const cleanup = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        throw new Error(`${primary}; cleanup also failed: ${cleanup}`);
      }
      throw error;
    }

    return (await this.getRef(projectId, base)).commitSha;
  }

  private async closeMergeRequest(projectId: string, mergeRequestIid: number): Promise<void> {
    await this.request<GitLabMergeRequest>(
      `${this.projectPath(projectId)}/merge_requests/${mergeRequestIid}`,
      {
        method: "PUT",
        body: { state_event: "close" },
      },
    );
  }

  async deleteBranch(projectId: string, branch: string): Promise<void> {
    await this.request<void>(
      `${this.projectPath(projectId)}/repository/branches/${encodeURIComponent(branch)}`,
      { method: "DELETE" },
    );
  }
}

function mapGitLabStatus(status: string): VerificationSignalStatus {
  switch (status.toLowerCase()) {
    case "created":
    case "pending":
    case "preparing":
    case "scheduled":
    case "waiting_for_resource":
      return "queued";
    case "running":
      return "running";
    case "success":
      return "passed";
    case "failed":
      return "failed";
    case "canceled":
      return "cancelled";
    case "skipped":
      return "skipped";
    default:
      return "unknown";
  }
}

function mapDiffStatus(diff: GitLabCompareDiff): DiffFile["status"] {
  if (diff.renamed_file) return "renamed";
  if (diff.new_file) return "added";
  if (diff.deleted_file) return "removed";
  return "modified";
}

function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}
