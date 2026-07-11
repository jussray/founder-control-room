/**
 * Provider-agnostic repository interface.
 *
 * Every other Control Room subsystem (Mission Engine, Change Proposals,
 * Council review, runners) talks to a repository ONLY through this
 * interface. It must never import an SDK for a specific host (Octokit,
 * a Forgejo client, raw `git`, etc.) directly.
 *
 * This is what makes the Control Room GitHub-compatible without being
 * GitHub-dependent: swap the implementation, nothing else changes.
 *
 *   GitHubProvider     — Phase 1 (this repo, today)
 *   InternalGitProvider — Phase 2/3 (bare repos on Control Room storage)
 *   ForgejoProvider     — Option 2 (self-hosted forge behind the API)
 *   LocalGitProvider    — Option 3 (hybrid local-first)
 */

export interface ProjectRepo {
  /** Stable Control Room identifier, e.g. "sekret-bip". Not the host's name. */
  projectId: string;
  /** Human-readable name for display. */
  name: string;
  /** Which RepositoryProvider implementation owns this repo. */
  provider: string;
  /** Default branch, e.g. "main". */
  defaultBranch: string;
  /** Opaque, provider-specific locator (owner/repo, bare-repo path, etc.). */
  locator: string;
  /** True if this project can currently accept mission branches. */
  isActive: boolean;
}

export interface FileEntry {
  path: string;
  type: "file" | "dir";
  size?: number;
}

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  patch?: string;
}

export interface Diff {
  base: string;
  head: string;
  files: DiffFile[];
  aheadBy: number;
  behindBy: number;
}

export interface PatchFileChange {
  path: string;
  /** Full new file content. Omit + set `delete: true` to remove the file. */
  content?: string;
  delete?: boolean;
}

export interface Patch {
  message: string;
  changes: PatchFileChange[];
  /** Who/what authored this patch — an agent name, not a human identity. */
  authorName: string;
  authorEmail?: string;
}

/**
 * Provider-agnostic repository interface. All methods are read-heavy except
 * `createBranch`, `commitPatch`, and `integrate` — those correspond to the
 * L99 authority-gated actions (create sandbox workspace / create internal
 * branch / integrate into main) and callers are responsible for having
 * already obtained founder approval before invoking them. This interface
 * does not enforce approval itself — that's the Approval Engine's job,
 * one layer up.
 */
export interface RepositoryProvider {
  readonly name: string;

  getProject(projectId: string): Promise<ProjectRepo>;

  listFiles(projectId: string, ref: string, path?: string): Promise<FileEntry[]>;

  readFile(projectId: string, ref: string, path: string): Promise<string>;

  /** Creates a new branch from `baseRef`. Returns the created branch name. */
  createBranch(projectId: string, baseRef: string, name: string): Promise<string>;

  /** Commits a patch onto an existing branch. Returns the new commit SHA. */
  commitPatch(projectId: string, branch: string, patch: Patch): Promise<string>;

  /** Compares two refs and returns a structured diff. */
  compare(projectId: string, base: string, head: string): Promise<Diff>;

  /**
   * Integrates `head` into `base` (the "merge", stripped of GitHub
   * branding). Returns the resulting commit SHA on `base`.
   */
  integrate(projectId: string, base: string, head: string): Promise<string>;

  /** Deletes a branch — used for "reject and delete branch". */
  deleteBranch(projectId: string, branch: string): Promise<void>;
}
