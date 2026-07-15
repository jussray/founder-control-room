import { getGitHubInstallationToken } from "./githubAppAuth.js";
import { GitHubProvider } from "./GitHubProvider.js";
import type {
  Diff,
  FileEntry,
  Patch,
  ProjectRepo,
  RepositoryProvider,
  RepositoryRef,
  VerificationSignal,
} from "./RepositoryProvider.js";

export interface ProviderProjectConfig {
  repo_provider: string;
  slug: string;
  repo_identifier: string;
}

class LazyRepositoryProvider implements RepositoryProvider {
  readonly name: string;
  private readonly delegatePromise: Promise<RepositoryProvider>;

  constructor(name: string, factory: () => Promise<RepositoryProvider>) {
    this.name = name;
    this.delegatePromise = factory();
  }

  private delegate(): Promise<RepositoryProvider> {
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
}

async function githubProvider(project: ProviderProjectConfig): Promise<RepositoryProvider> {
  const fallbackToken = process.env.GITHUB_TOKEN?.trim();
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_PRIVATE_KEY?.trim();

  const token = appId && privateKey
    ? await getGitHubInstallationToken(appId, privateKey, project.repo_identifier)
    : fallbackToken;
  if (!token) {
    throw new Error(
      "GitHub authentication is not configured; set GITHUB_APP_ID and GITHUB_PRIVATE_KEY or a local GITHUB_TOKEN fallback",
    );
  }

  return new GitHubProvider({
    token,
    projectMap: { [project.slug]: project.repo_identifier },
    baseUrl: process.env.GITHUB_API_BASE_URL,
  });
}

/**
 * Provider construction belongs in one place so routes, reconcilers, and
 * mission runners do not grow direct GitHub dependencies.
 *
 * Production prefers a repository-scoped GitHub App installation token.
 * GITHUB_TOKEN remains a local/development fallback only. Authentication is
 * lazy so callers keep the same provider-neutral synchronous factory contract.
 */
export function providerForProject(project: ProviderProjectConfig): RepositoryProvider {
  if (project.repo_provider === "github") {
    return new LazyRepositoryProvider("github", () => githubProvider(project));
  }
  throw new Error(`No RepositoryProvider implementation for "${project.repo_provider}" yet`);
}
