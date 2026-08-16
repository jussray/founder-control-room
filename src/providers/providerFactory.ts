import { getGitHubInstallationToken } from "./githubAppAuth.js";
import { GitHubProvider } from "./GitHubProvider.js";
import { GitLabProvider } from "./GitLabProvider.js";
import type {
  Diff,
  FileEntry,
  Patch,
  ProjectRepo,
  RepositoryProvider,
  RepositoryRef,
  RulesetConfig,
  RulesetResult,
  VerificationSignal,
} from "./RepositoryProvider.js";

export interface ProviderProjectConfig {
  repo_provider: string;
  slug: string;
  repo_identifier: string;
}

class LazyRepositoryProvider implements RepositoryProvider {
  readonly name: string;
  private readonly factory: () => Promise<RepositoryProvider>;
  private delegatePromise: Promise<RepositoryProvider> | null = null;

  constructor(name: string, factory: () => Promise<RepositoryProvider>) {
    this.name = name;
    this.factory = factory;
  }

  private delegate(): Promise<RepositoryProvider> {
    this.delegatePromise ??= this.factory();
    return this.delegatePromise;
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

  async createBranch(projectId: string, baseRef: string, name: string): Promise<string> {
    return (await this.delegate()).createBranch(projectId, baseRef, name);
  }

  async commitPatch(projectId: string, branch: string, patch: Patch): Promise<string> {
    return (await this.delegate()).commitPatch(projectId, branch, patch);
  }

  async compare(projectId: string, base: string, head: string): Promise<Diff> {
    return (await this.delegate()).compare(projectId, base, head);
  }

  async integrate(projectId: string, base: string, head: string): Promise<string> {
    return (await this.delegate()).integrate(projectId, base, head);
  }

  async deleteBranch(projectId: string, branch: string): Promise<void> {
    return (await this.delegate()).deleteBranch(projectId, branch);
  }

  async applyBranchRuleset(projectId: string, config: RulesetConfig): Promise<RulesetResult> {
    const delegate = await this.delegate();
    if (!delegate.applyBranchRuleset) {
      throw new Error(`${delegate.name}: does not support applyBranchRuleset`);
    }
    return delegate.applyBranchRuleset(projectId, config);
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
    return fallbackToken || (appId && privateKey)
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
  const token = appId && privateKey
    ? await getGitHubInstallationToken(appId, privateKey, project.repo_identifier)
    : fallbackToken!;

  return new GitHubProvider({
    token,
    projectMap: { [project.slug]: project.repo_identifier },
    baseUrl: process.env.GITHUB_API_BASE_URL,
  });
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
    return new LazyRepositoryProvider("github", () => githubProvider(project));
  }
  if (project.repo_provider === "gitlab") {
    return new LazyRepositoryProvider("gitlab", () => gitlabProvider(project));
  }
  throw new Error(`No RepositoryProvider implementation for "${project.repo_provider}" yet`);
}
