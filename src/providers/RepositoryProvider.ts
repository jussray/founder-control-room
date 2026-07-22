/**
 * Provider-agnostic repository interface.
 *
 * Every other Control Room subsystem (Mission Engine, Change Proposals,
 * Council review, runners, Repo Brain) talks to a repository ONLY through
 * this interface. It must never import an SDK for a specific host directly.
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

export interface RepositoryRef {
  name: string;
  commitSha: string;
  committedAt?: string;
}

export type VerificationSignalStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "cancelled"
  | "skipped"
  | "unknown";

/**
 * A provider-neutral CI or verification signal attached to an exact commit.
 * GitHub check runs are one source; internal runners and Forgejo checks can
 * expose the same shape later.
 */
export interface VerificationSignal {
  id: string;
  name: string;
  status: VerificationSignalStatus;
  commitSha: string;
  provider: string;
  startedAt?: string;
  completedAt?: string;
  detailsUrl?: string;
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
 * Provider-agnostic repository interface. All write methods correspond to
 * separately approval-gated L99 actions. Read methods may be used by Repo
 * Brain during discussion and reconciliation, but every read is still logged.
 */
export interface RepositoryProvider {
  readonly name: string;

  getProject(projectId: string): Promise<ProjectRepo>;

  listFiles(projectId: string, ref: string, path?: string): Promise<FileEntry[]>;

  readFile(projectId: string, ref: string, path: string): Promise<string>;

  /** Resolves a mutable ref to the exact immutable commit SHA it currently names. */
  resolveRef(projectId: string, ref: string): Promise<string>;

  /** Resolves a branch/tag/ref to the exact commit being verified. */
  getRef(projectId: string, ref: string): Promise<RepositoryRef>;

  /** Returns provider CI/check evidence for the exact ref/commit. */
  listVerificationSignals(projectId: string, ref: string): Promise<VerificationSignal[]>;

  /** Creates a new branch from `baseRef`. Returns the created branch name. */
  createBranch(projectId: string, baseRef: string, name: string): Promise<string>;

  /** Commits a patch onto an existing branch. Returns the new commit SHA. */
  commitPatch(projectId: string, branch: string, patch: Patch): Promise<string>;

  /** Compares two refs and returns a structured diff. */
  compare(projectId: string, base: string, head: string): Promise<Diff>;

  /**
   * Integrates `head` into `base` (the "merge", stripped of GitHub
   * branding). Callers must resolve and validate the expected head SHA
   * immediately before invoking this method. Returns the resulting commit SHA.
   */
  integrate(projectId: string, base: string, head: string): Promise<string>;

  /** Deletes a branch — used for "reject and delete branch". */
  deleteBranch(projectId: string, branch: string): Promise<void>;
}
