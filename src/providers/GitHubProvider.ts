import { Octokit } from "@octokit/rest";
import type {
  RepositoryProvider,
  ProjectRepo,
  FileEntry,
  Diff,
  DiffFile,
  Patch,
} from "./RepositoryProvider.js";

export interface GitHubProviderConfig {
  token: string;
  /** Maps Control Room projectId -> "owner/repo". */
  projectMap: Record<string, string>;
}

/**
 * First RepositoryProvider implementation. Talks to GitHub via Octokit so
 * that every other Control Room subsystem can stay repository-agnostic.
 *
 * Nothing outside this file should import `@octokit/rest`.
 */
export class GitHubProvider implements RepositoryProvider {
  readonly name = "github";
  private octokit: Octokit;
  private projectMap: Record<string, string>;

  constructor(config: GitHubProviderConfig) {
    this.octokit = new Octokit({ auth: config.token });
    this.projectMap = config.projectMap;
  }

  private locate(projectId: string): { owner: string; repo: string } {
    const locator = this.projectMap[projectId];
    if (!locator) {
      throw new Error(
        `GitHubProvider: no repo mapped for projectId "${projectId}"`
      );
    }
    const [owner, repo] = locator.split("/");
    if (!owner || !repo) {
      throw new Error(
        `GitHubProvider: malformed locator "${locator}" for "${projectId}" (expected "owner/repo")`
      );
    }
    return { owner, repo };
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
    path = ""
  ): Promise<FileEntry[]> {
    const { owner, repo } = this.locate(projectId);
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      ref,
      path,
    });
    const entries = Array.isArray(data) ? data : [data];
    return entries.map((e) => ({
      path: e.path,
      type: e.type === "dir" ? "dir" : "file",
      size: "size" in e ? e.size : undefined,
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

  async createBranch(
    projectId: string,
    baseRef: string,
    name: string
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
    patch: Patch
  ): Promise<string> {
    const { owner, repo } = this.locate(projectId);

    // Resolve current tree for the branch.
    const branchData = await this.octokit.repos.getBranch({
      owner,
      repo,
      branch,
    });
    const baseTreeSha = branchData.data.commit.commit.tree.sha;
    const parentSha = branchData.data.commit.sha;

    // Build blobs for every changed (non-deleted) file.
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
      })
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

    const files: DiffFile[] = (data.files ?? []).map((f) => ({
      path: f.filename,
      status: mapFileStatus(f.status),
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
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
    const { data } = await this.octokit.repos.merge({
      owner,
      repo,
      base,
      head,
    });
    if (!data) {
      throw new Error(
        `GitHubProvider: integrate(${base}, ${head}) produced no merge commit — likely already up to date or conflicting`
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
