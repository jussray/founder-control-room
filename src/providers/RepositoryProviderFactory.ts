import { GitHubProvider } from "./GitHubProvider.js";
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
