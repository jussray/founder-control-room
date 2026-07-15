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
 */
export function providerForProject(project: ProviderProjectConfig): RepositoryProvider {
  if (project.repo_provider === "github") {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN is not set");
    return new GitHubProvider({
      token,
      projectMap: { [project.slug]: project.repo_identifier },
      baseUrl: process.env.GITHUB_API_BASE_URL,
    });
  }
  throw new Error(`No RepositoryProvider implementation for "${project.repo_provider}" yet`);
}
