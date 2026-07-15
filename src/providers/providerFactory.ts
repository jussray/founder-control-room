import { getGitHubInstallationToken } from "./githubAppAuth.js";
import { GitHubProvider } from "./GitHubProvider.js";
import type { RepositoryProvider } from "./RepositoryProvider.js";

export interface ProviderProjectConfig {
  repo_provider: string;
  slug: string;
  repo_identifier: string;
}

/**
 * Provider construction belongs in one place so routes, reconcilers, and
 * mission runners do not grow direct GitHub dependencies.
 *
 * Production prefers the repository-scoped GitHub App installation token.
 * GITHUB_TOKEN remains a local/development fallback only.
 */
export async function providerForProject(
  project: ProviderProjectConfig,
): Promise<RepositoryProvider> {
  if (project.repo_provider === "github") {
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
  throw new Error(`No RepositoryProvider implementation for "${project.repo_provider}" yet`);
}
