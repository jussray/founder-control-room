import { getGitHubInstallationToken } from "./githubAppAuth.js";
import { DeterministicReviewGitHubProvider } from "./DeterministicReviewGitHubProvider.js";
import { SecurityPreservingGitHubProvider } from "./SecurityPreservingGitHubProvider.js";
import { GitLabProvider } from "./GitLabProvider.js";
import type {
  DeterministicReviewWitnessPublication,
  Diff,
  FileEntry,
  Patch,
  ProjectRepo,
  PullRequestReviewContext,
  RepositoryProvider,
  RepositoryRef,
  ReviewSignal,
  RulesetConfig,
  RulesetResult,
  VerificationSignal,
} from "./RepositoryProvider.js";

export interface ProviderProjectConfig {
  repo_provider: string;
  slug: string;
  repo_identifier: string;
}

const FOUNDER_CONTROL_ROOM_PROJECT_ID = "founder-control-room";
const FOUNDER_CONTROL_ROOM_REPOSITORY = "jussray/founder-control-room";
const FOUNDER_CONTROL_ROOM_PROTECTED_BRANCH = "main";
export const FOUNDER_CONTROL_ROOM_CANONICAL_RULESET_NAME = "Founder Control Room main exact-head gate";
const FOUNDER_CONTROL_ROOM_REQUIRED_STATUS_CHECKS = [
  "Required Gate",
  "Verify test-ledger contract",
] as const;

function isFounderControlRoomRepository(repositoryIdentifier: string | undefined): boolean {
  return repositoryIdentifier?.trim().toLowerCase() === FOUNDER_CONTROL_ROOM_REPOSITORY;
}

export function governanceProjectIdForRepository(
  projectId: string,
  repositoryIdentifier?: string,
): string {
  return isFounderControlRoomRepository(repositoryIdentifier)
    ? FOUNDER_CONTROL_ROOM_PROJECT_ID
    : projectId;
}

export function assertFounderControlRoomTrustedBypassActor(
  config: RulesetConfig,
  trustedGitHubAppId: string | undefined,
): void {
  const protectsFounderControlRoomMain =
    config.enforcement === "active"
    && config.targetRefs.includes(FOUNDER_CONTROL_ROOM_PROTECTED_BRANCH);
  if (!protectsFounderControlRoomMain) return;

  const trustedAppId = trustedGitHubAppId?.trim() ?? "";
  if (!/^\d+$/.test(trustedAppId)) {
    throw new Error("Founder Control Room main governance requires a trusted GITHUB_APP_ID bypass identity");
  }

  const bypassActors = config.bypassActors ?? [];
  if (
    bypassActors.length !== 1
    || bypassActors[0]?.kind !== "app"
    || bypassActors[0].id.trim() !== trustedAppId
  ) {
    throw new Error("Founder Control Room main governance bypass must exactly match the trusted GitHub App identity");
  }
}

/**
 * Founder Control Room's own merge policy must fail closed before a provider
 * mutation is attempted. Other projects retain provider-neutral flexibility,
 * including evaluate-only or zero-review rulesets when their own policy allows
 * it. FCR main is the constitutional authority surface: an active policy must
 * retain the complete minimum floor, and the canonical ruleset may not be
 * disabled, demoted to evaluate mode, or retargeted away from main through the
 * generic repository-administration route. Repository identity, not a mutable
 * project slug alias, determines whether that constitutional floor applies.
 */
export function assertRulesetGovernancePolicy(
  projectId: string,
  config: RulesetConfig,
  repositoryIdentifier?: string,
): void {
  const governanceProjectId = governanceProjectIdForRepository(projectId, repositoryIdentifier);
  const isFounderControlRoom = governanceProjectId === FOUNDER_CONTROL_ROOM_PROJECT_ID;
  const targetsFounderControlRoomMain = config.targetRefs.includes(FOUNDER_CONTROL_ROOM_PROTECTED_BRANCH);
  const isCanonicalFounderControlRoomRuleset =
    isFounderControlRoom && config.name === FOUNDER_CONTROL_ROOM_CANONICAL_RULESET_NAME;

  if (isCanonicalFounderControlRoomRuleset) {
    if (config.enforcement !== "active") {
      throw new Error("Founder Control Room canonical main governance must remain actively enforced");
    }
    if (!targetsFounderControlRoomMain) {
      throw new Error("Founder Control Room canonical main governance must continue targeting main");
    }
  }

  const protectsFounderControlRoomMain =
    isFounderControlRoom
    && config.enforcement === "active"
    && targetsFounderControlRoomMain;

  if (!protectsFounderControlRoomMain && !isCanonicalFounderControlRoomRuleset) return;

  if (!config.requirePullRequest) {
    throw new Error("Founder Control Room main governance requires pull-request enforcement");
  }
  if (!Number.isInteger(config.requiredApprovingReviewCount) || config.requiredApprovingReviewCount < 1) {
    throw new Error("Founder Control Room main governance requires at least one approving review");
  }
  for (const requiredCheck of FOUNDER_CONTROL_ROOM_REQUIRED_STATUS_CHECKS) {
    if (!config.requiredStatusCheckNames.includes(requiredCheck)) {
      throw new Error(`Founder Control Room main governance requires status check: ${requiredCheck}`);
    }
  }
  if (!config.blockForcePushes) {
    throw new Error("Founder Control Room main governance must block force pushes");
  }
  if (!config.blockDeletion) {
    throw new Error("Founder Control Room main governance must block branch deletion");
  }
}

class LazyRepositoryProvider implements RepositoryProvider {
  readonly name: string;
  private readonly factory: () => Promise<RepositoryProvider>;
  private readonly repositoryIdentifier: string;
  private delegatePromise: Promise<RepositoryProvider> | null = null;
  private readonly pullRequestContextByProject = new Map<string, PullRequestReviewContext>();

  constructor(
    name: string,
    factory: () => Promise<RepositoryProvider>,
    repositoryIdentifier: string,
  ) {
    this.name = name;
    this.factory = factory;
    this.repositoryIdentifier = repositoryIdentifier;
  }

  private delegate(): Promise<RepositoryProvider> {
    this.delegatePromise ??= this.factory();
    return this.delegatePromise;
  }

  private governanceProjectId(projectId: string): string {
    return governanceProjectIdForRepository(projectId, this.repositoryIdentifier);
  }

  async getProject(projectId: string): Promise<ProjectRepo> {
    return (await this.delegate()).getProject(projectId);
  }

  async listFiles(projectId: string, ref: string, path?: string): Promise<FileEntry[]> {
    return (await this.delegate()).listFiles(projectId, ref, path);
  }

  async readFile(projectId: string, ref: string, path: string): Promise<string> {
    return (await this.delegate()).readFile(projectId, ref, path);
  }

  async resolveRef(projectId: string, ref: string): Promise<string> {
    return (await this.delegate()).resolveRef(projectId, ref);
  }

  async getRef(projectId: string, ref: string): Promise<RepositoryRef> {
    return (await this.delegate()).getRef(projectId, ref);
  }

  async listVerificationSignals(projectId: string, ref: string): Promise<VerificationSignal[]> {
    return (await this.delegate()).listVerificationSignals(projectId, ref);
  }

  async publishDeterministicReviewWitness(
    projectId: string,
    publication: DeterministicReviewWitnessPublication,
  ): Promise<void> {
    const delegate = await this.delegate();
    if (!delegate.publishDeterministicReviewWitness) {
      throw new Error(`${delegate.name}: deterministic review witness publication requires GitHub App authority`);
    }
    return delegate.publishDeterministicReviewWitness(this.governanceProjectId(projectId), publication);
  }

  async listReviewSignals(projectId: string, pullRequestNumber: number): Promise<ReviewSignal[]> {
    const delegate = await this.delegate();
    if (!delegate.listReviewSignals) {
      throw new Error(`${delegate.name}: does not support provider-backed pull-request reviews`);
    }
    return delegate.listReviewSignals(this.governanceProjectId(projectId), pullRequestNumber);
  }

  async getPullRequestReviewContext(
    projectId: string,
    pullRequestNumber: number,
  ): Promise<PullRequestReviewContext> {
    const delegate = await this.delegate();
    if (!delegate.getPullRequestReviewContext) {
      throw new Error(`${delegate.name}: does not support provider-backed pull-request context`);
    }
    const governanceProjectId = this.governanceProjectId(projectId);
    const context = await delegate.getPullRequestReviewContext(governanceProjectId, pullRequestNumber);
    if (governanceProjectId === FOUNDER_CONTROL_ROOM_PROJECT_ID) {
      this.pullRequestContextByProject.set(governanceProjectId, context);
    }
    return context;
  }

  async createBranch(projectId: string, baseRef: string, name: string): Promise<string> {
    return (await this.delegate()).createBranch(projectId, baseRef, name);
  }

  async commitPatch(projectId: string, branch: string, patch: Patch): Promise<string> {
    return (await this.delegate()).commitPatch(projectId, branch, patch);
  }

  async compare(projectId: string, base: string, head: string): Promise<Diff> {
    return (await this.delegate()).compare(this.governanceProjectId(projectId), base, head);
  }

  async integrate(projectId: string, base: string, head: string): Promise<string> {
    const delegate = await this.delegate();
    const governanceProjectId = this.governanceProjectId(projectId);
    if (governanceProjectId !== FOUNDER_CONTROL_ROOM_PROJECT_ID) {
      return delegate.integrate(projectId, base, head);
    }

    const context = this.pullRequestContextByProject.get(governanceProjectId);
    if (!context) {
      throw new Error(
        "Founder Control Room integration requires provider-backed pull-request context in the same execution",
      );
    }
    if (base !== FOUNDER_CONTROL_ROOM_PROTECTED_BRANCH || context.baseRef !== FOUNDER_CONTROL_ROOM_PROTECTED_BRANCH) {
      throw new Error(
        `Founder Control Room reviewed integration authority is pinned to ${FOUNDER_CONTROL_ROOM_PROTECTED_BRANCH}`,
      );
    }
    if (base !== context.baseRef || head !== context.headRef) {
      throw new Error(
        `Founder Control Room integration refs changed after review context: expected ${context.baseRef}<-${context.headRef}, received ${base}<-${head}`,
      );
    }

    // Last-mile TOCTOU membrane: re-read BOTH mutable refs immediately before
    // handing control to the provider mutation. The semantic review is bound to
    // context.baseSha/context.headSha; moving either ref invalidates that review.
    const currentBaseSha = await delegate.resolveRef(governanceProjectId, base);
    const currentHeadSha = await delegate.resolveRef(governanceProjectId, head);
    if (currentBaseSha.toLowerCase() !== context.baseSha.toLowerCase()) {
      throw new Error(
        `Founder Control Room base moved after review context: current ${currentBaseSha}, reviewed ${context.baseSha}`,
      );
    }
    if (currentHeadSha.toLowerCase() !== context.headSha.toLowerCase()) {
      throw new Error(
        `Founder Control Room head moved after review context: current ${currentHeadSha}, reviewed ${context.headSha}`,
      );
    }

    this.pullRequestContextByProject.delete(governanceProjectId);
    return delegate.integrate(governanceProjectId, base, head);
  }

  async applyBranchRuleset(projectId: string, config: RulesetConfig): Promise<RulesetResult> {
    const governanceProjectId = this.governanceProjectId(projectId);
    assertRulesetGovernancePolicy(governanceProjectId, config, this.repositoryIdentifier);
    if (governanceProjectId === FOUNDER_CONTROL_ROOM_PROJECT_ID) {
      assertFounderControlRoomTrustedBypassActor(config, process.env.GITHUB_APP_ID);
    }
    const delegate = await this.delegate();
    if (!delegate.applyBranchRuleset) {
      throw new Error(`${delegate.name}: does not support applyBranchRuleset`);
    }
    return delegate.applyBranchRuleset(governanceProjectId, config);
  }
}

export function providerConfigurationError(
  project: ProviderProjectConfig,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (project.repo_provider === "github") {
    const fallbackToken = env.GITHUB_TOKEN?.trim();
    const appId = env.GITHUB_APP_ID?.trim();
    const privateKey = env.GITHUB_PRIVATE_KEY?.trim();
    const hasAppId = Boolean(appId);
    const hasPrivateKey = Boolean(privateKey);
    if (hasAppId !== hasPrivateKey) {
      return "GitHub App authentication is incomplete; set both GITHUB_APP_ID and GITHUB_PRIVATE_KEY or neither";
    }
    return fallbackToken || (hasAppId && hasPrivateKey)
      ? null
      : "GitHub authentication is not configured; set GITHUB_APP_ID and GITHUB_PRIVATE_KEY or a local GITHUB_TOKEN fallback";
  }

  if (project.repo_provider === "gitlab") {
    return env.GITLAB_TOKEN?.trim()
      ? null
      : "GitLab authentication is not configured; set GITLAB_TOKEN";
  }

  return `No RepositoryProvider implementation for "${project.repo_provider}" yet`;
}

async function githubProvider(project: ProviderProjectConfig): Promise<RepositoryProvider> {
  const configError = providerConfigurationError(project);
  if (configError) throw new Error(configError);

  const fallbackToken = process.env.GITHUB_TOKEN?.trim();
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_PRIVATE_KEY?.trim();
  // GITHUB_TOKEN remains a local/development fallback only; production prefers
  // repository-scoped GitHub App installation credentials minted on demand.
  const hasAppAuthority = Boolean(appId && privateKey);
  const token = hasAppAuthority
    ? await getGitHubInstallationToken(appId!, privateKey!, project.repo_identifier)
    : fallbackToken!;

  const projectMap: Record<string, string> = { [project.slug]: project.repo_identifier };
  if (isFounderControlRoomRepository(project.repo_identifier)) {
    projectMap[FOUNDER_CONTROL_ROOM_PROJECT_ID] = project.repo_identifier;
  }

  const config = {
    token,
    projectMap,
    baseUrl: process.env.GITHUB_API_BASE_URL,
  };

  return hasAppAuthority && isFounderControlRoomRepository(project.repo_identifier)
    ? new DeterministicReviewGitHubProvider(config)
    : new SecurityPreservingGitHubProvider(config);
}

async function gitlabProvider(project: ProviderProjectConfig): Promise<RepositoryProvider> {
  const configError = providerConfigurationError(project);
  if (configError) throw new Error(configError);

  return new GitLabProvider({
    token: process.env.GITLAB_TOKEN!.trim(),
    projectMap: { [project.slug]: project.repo_identifier },
    baseUrl: process.env.GITLAB_BASE_URL,
  });
}

/**
 * Provider construction belongs in one place so routes, reconcilers, and
 * mission runners do not grow direct host dependencies.
 *
 * GitHub prefers a repository-scoped App installation token, while GitLab
 * consumes its own provider token and optional self-managed instance URL.
 * Authentication is demand-driven and cached so callers retain the synchronous
 * factory contract without coupling project existence to either provider.
 */
export function providerForProject(project: ProviderProjectConfig): RepositoryProvider {
  if (project.repo_provider === "github") {
    return new LazyRepositoryProvider("github", () => githubProvider(project), project.repo_identifier);
  }
  if (project.repo_provider === "gitlab") {
    return new LazyRepositoryProvider("gitlab", () => gitlabProvider(project), project.repo_identifier);
  }
  throw new Error(`No RepositoryProvider implementation for "${project.repo_provider}" yet`);
}
