import { GitHubProvider } from "./GitHubProvider.js";
import {
  getGitHubInstallationToken,
  observeGitHubRepositoryInstallation,
  type GitHubRepositoryInstallationEvidence,
  type GitHubInstallationTokenPermissions,
} from "./githubAppAuth.js";
import {
  deriveGitHubAppRepositoryCapabilities,
  requireGitHubAppRepositoryPermissions,
  type GitHubAppRepositoryCapabilityContract,
  type GitHubAppRequiredPermissionLevel,
} from "./githubAppCapabilities.js";
import type { RepositoryProvider } from "./RepositoryProvider.js";

export interface RepositoryConnectionInput {
  slug: string;
  repoProvider?: string | null;
  repoIdentifier?: string | null;
  provider?: string | null;
  connectionConfig?: Record<string, unknown> | null;
}

export interface NormalizedRepositoryConnection {
  projectId: string;
  provider: string;
  repository: string;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Accept both project-row fields (`repo_provider`, `repo_identifier`) and the
 * newer `project_connections` shape (`provider`, `connection_config`). This is
 * intentionally the only compatibility seam; callers receive one normalized
 * provider contract.
 */
export function normalizeRepositoryConnection(
  input: RepositoryConnectionInput,
): NormalizedRepositoryConnection {
  const provider = stringValue(input.repoProvider) ?? stringValue(input.provider);
  const config = input.connectionConfig ?? {};
  const repository =
    stringValue(input.repoIdentifier) ??
    stringValue(config.repository) ??
    stringValue(config.repo_identifier) ??
    stringValue(config.locator);

  if (!provider) {
    throw new Error(`Repository provider is missing for project "${input.slug}"`);
  }
  if (!repository) {
    throw new Error(`Repository identifier is missing for project "${input.slug}"`);
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(
      `Repository identifier "${repository}" is invalid; expected owner/repo`,
    );
  }

  return {
    projectId: input.slug,
    provider: provider.toLowerCase(),
    repository,
  };
}

export function createRepositoryProvider(
  input: RepositoryConnectionInput,
  env: NodeJS.ProcessEnv = process.env,
): RepositoryProvider {
  const connection = normalizeRepositoryConnection(input);

  if (connection.provider === "github") {
    const token = env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN is not set");
    }
    return new GitHubProvider({
      token,
      projectMap: { [connection.projectId]: connection.repository },
    });
  }

  throw new Error(
    `No RepositoryProvider implementation for "${connection.provider}" yet`,
  );
}

export interface AppAwareRepositoryProviderDependencies {
  getInstallationToken?: (
    appId: string,
    privateKey: string,
    repositoryIdentifier: string,
    requiredPermissions?: GitHubInstallationTokenPermissions,
  ) => Promise<string>;
  observeInstallation?: (
    appId: string,
    privateKey: string,
    repositoryIdentifier: string,
  ) => Promise<GitHubRepositoryInstallationEvidence>;
}

/**
 * Builds a repository-scoped provider with the canonical credential precedence:
 * a GitHub App installation token in production, then an explicit local
 * development token. The returned RepositoryProvider may expose writes, but
 * callers that need mutation authority should prefer
 * createCapabilityAwareAppRepositoryProvider so GitHub's observed installation
 * permissions are verified before the provider is handed to them.
 */
export async function createAppAwareRepositoryProvider(
  input: RepositoryConnectionInput,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: AppAwareRepositoryProviderDependencies = {},
): Promise<RepositoryProvider> {
  const connection = normalizeRepositoryConnection(input);

  if (connection.provider === "github") {
    const fallbackToken = env.GITHUB_TOKEN?.trim();
    const appId = env.GITHUB_APP_ID?.trim();
    const privateKey = env.GITHUB_PRIVATE_KEY?.trim();
    if (Boolean(appId) !== Boolean(privateKey)) {
      throw new Error("GITHUB_APP_ID and GITHUB_PRIVATE_KEY must be configured together");
    }
    if (!fallbackToken && !(appId && privateKey)) {
      throw new Error(
        "GitHub authentication is not configured; set GITHUB_APP_ID and GITHUB_PRIVATE_KEY or a local GITHUB_TOKEN fallback",
      );
    }
    const getInstallationToken = dependencies.getInstallationToken ?? getGitHubInstallationToken;
    const token = appId && privateKey
      ? await getInstallationToken(appId, privateKey, connection.repository)
      : fallbackToken!;
    return new GitHubProvider({
      token,
      projectMap: { [connection.projectId]: connection.repository },
      baseUrl: env.GITHUB_API_BASE_URL,
    });
  }

  throw new Error(
    `No RepositoryProvider implementation for "${connection.provider}" yet`,
  );
}

export interface CapabilityAwareAppRepositoryProviderResult {
  provider: RepositoryProvider;
  authority: GitHubAppRepositoryCapabilityContract;
}

/**
 * Production mutation/read entrypoint for GitHub App authority.
 *
 * It deliberately has no GITHUB_TOKEN fallback. The caller declares the exact
 * GitHub repository permissions its operation requires; FCR observes the live
 * installation grant, fails closed if any permission is missing, and only then
 * mints a repository- and permission-scoped App token and returns a provider
 * plus immutable authority evidence.
 */
export async function createCapabilityAwareAppRepositoryProvider(
  input: RepositoryConnectionInput,
  requiredPermissions: Readonly<Record<string, GitHubAppRequiredPermissionLevel>>,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: AppAwareRepositoryProviderDependencies = {},
): Promise<CapabilityAwareAppRepositoryProviderResult> {
  const connection = normalizeRepositoryConnection(input);
  if (connection.provider !== "github") {
    throw new Error(
      `Capability-aware App authority is only implemented for github, received "${connection.provider}"`,
    );
  }

  const appId = env.GITHUB_APP_ID?.trim();
  const privateKey = env.GITHUB_PRIVATE_KEY?.trim();
  if (!appId || !privateKey) {
    throw new Error(
      "Capability-aware GitHub App authority requires GITHUB_APP_ID and GITHUB_PRIVATE_KEY",
    );
  }

  const observeInstallation = dependencies.observeInstallation ?? observeGitHubRepositoryInstallation;
  const evidence = await observeInstallation(appId, privateKey, connection.repository);
  const authority = deriveGitHubAppRepositoryCapabilities(evidence);
  requireGitHubAppRepositoryPermissions(authority, requiredPermissions);

  const getInstallationToken = dependencies.getInstallationToken ?? getGitHubInstallationToken;
  const token = await getInstallationToken(
    appId,
    privateKey,
    connection.repository,
    requiredPermissions,
  );
  const provider = new GitHubProvider({
    token,
    projectMap: { [connection.projectId]: connection.repository },
    baseUrl: env.GITHUB_API_BASE_URL,
  });

  return { provider, authority };
}
