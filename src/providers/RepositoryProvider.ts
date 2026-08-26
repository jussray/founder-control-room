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

/** Provider-backed identity for the application that emitted a verification signal. */
export interface VerificationSignalIssuer {
  kind: "app";
  id: string;
  name?: string;
}

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
  /** Optional because not every provider exposes an issuer. Authority gates must fail closed when issuer identity is required. */
  issuer?: VerificationSignalIssuer;
  startedAt?: string;
  completedAt?: string;
  detailsUrl?: string;
}

/**
 * Narrow provider write used only to publish one already-produced deterministic
 * review witness. It is intentionally not a generic "create check" surface:
 * the exact head, derived signal name, full review hash, and bounded summary
 * must all survive provider validation before a host mutation is attempted.
 */
export interface DeterministicReviewWitnessPublication {
  headSha: string;
  name: string;
  reviewHash: string;
  summary: string;
}

export type ReviewSignalState =
  | "approved"
  | "changes_requested"
  | "commented"
  | "dismissed"
  | "pending"
  | "unknown";

/**
 * A provider-backed pull-request review witness. Unlike a CI check name, this
 * carries the review actor and exact commit GitHub (or a future provider)
 * recorded for the review event. receiptHash is parsed from the review body
 * and binds the provider event to one immutable Chief AI review receipt.
 */
export interface ReviewSignal {
  id: string;
  reviewerId: string;
  state: ReviewSignalState;
  commitSha: string;
  provider: string;
  receiptHash?: string;
  submittedAt?: string;
  detailsUrl?: string;
}

/**
 * Provider-backed identity for one pull/merge request under review. This is
 * intentionally read-only and exact-head aware so merge gates never have to
 * trust caller-supplied PR metadata for author, base, or head identity.
 */
export interface PullRequestReviewContext {
  number: number;
  repository: string;
  headRepository: string;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  authorIdentity: string;
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
 * A machine identity that may cross a provider ruleset under a deliberately
 * narrower authority path. The provider implementation owns the bypass mode:
 * FCR's trusted GitHub App is constrained to reviewed pull-request merges,
 * while other providers/projects may retain their existing integration mode.
 */
export interface RulesetBypassActor {
  /** "app" = this Control Room's own GitHub App installation. */
  kind: "app";
  /** Provider-specific identity, e.g. the GitHub App's numeric ID. */
  id: string;
}

/**
 * Provider-agnostic branch protection policy. Deliberately narrow — the
 * handful of protections this app's own build/merge discipline actually
 * depends on, not a full passthrough of every rule a host might support.
 */
export interface RulesetConfig {
  /** Stable name so re-applying updates the same ruleset instead of duplicating it. */
  name: string;
  /** "evaluate" reports violations without blocking anything — a safe dry run. */
  enforcement: "active" | "evaluate" | "disabled";
  /** Refs this ruleset targets, e.g. ["main"]. Host-specific pattern syntax. */
  targetRefs: string[];
  /** Require a pull request before writes to a targeted ref, blocking direct pushes. */
  requirePullRequest: boolean;
  requiredApprovingReviewCount: number;
  /** Check names that must pass at the exact head before merge. */
  requiredStatusCheckNames: string[];
  blockForcePushes: boolean;
  blockDeletion: boolean;
  /**
   * Explicit machine identities allowed to cross the host ruleset through a
   * provider-defined scoped bypass. Callers select the identity only; the
   * provider must choose and verify the narrowest supported bypass mode.
   */
  bypassActors?: RulesetBypassActor[];
}

export interface RulesetResult {
  /** Provider-specific primary ruleset identifier. */
  id: string;
  name: string;
  enforcement: string;
  /**
   * Composite provider mutations expose every durable component identity so
   * caller ledgers can reconcile partial success without guessing provider state.
   */
  components?: Array<{
    purpose: string;
    id: string;
    name: string;
    enforcement: string;
  }>;
}

/**
 * Provider-agnostic repository interface. All write methods correspond to
 * separately approval-gated L99 actions. Read methods may be used by Repo
 * Brain during discussion and reconciliation, but every read is still logged.
 *
 * Branch deletion is deliberately not ambient repository authority. A stale
 * branch is not necessarily superseded or retirable. Deletion may return only
 * through an obligation-aware retirement reconciler with a verified receipt.
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

  /**
   * Publishes one deterministic-review verification witness. Optional because
   * not every provider can mint a provider-backed App check. Review issuance
   * must fail closed when this capability is unavailable.
   */
  publishDeterministicReviewWitness?(
    projectId: string,
    publication: DeterministicReviewWitnessPublication,
  ): Promise<void>;

  /**
   * Returns provider-recorded pull-request review events. Optional because
   * not every repository provider exposes a PR-review concept. Review gates
   * must fail closed when semantic review is required and this is absent.
   */
  listReviewSignals?(projectId: string, pullRequestNumber: number): Promise<ReviewSignal[]>;

  /**
   * Returns immutable provider-backed PR identity for review gating. Optional
   * for providers that do not expose PR/MR metadata; review-gated merges fail
   * closed when this capability is required but unavailable.
   */
  getPullRequestReviewContext?(
    projectId: string,
    pullRequestNumber: number,
  ): Promise<PullRequestReviewContext>;

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

  /**
   * Applies (creates or updates, by name) a branch protection ruleset.
   * Optional: administration-tier repository configuration is a GitHub-shaped
   * concept that not every future provider (bare git, Forgejo) needs to
   * support the same way. Callers must feature-detect before calling.
   */
  applyBranchRuleset?(projectId: string, config: RulesetConfig): Promise<RulesetResult>;
}
