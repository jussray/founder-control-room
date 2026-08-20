import { createAppAwareRepositoryProvider } from '../providers/RepositoryProviderFactory.js';
import type { CurrentMainRevalidation } from './currentTruth.js';

const EXACT_SHA = /^[0-9a-f]{40}$/i;

export interface CurrentTruthProjectConnection {
  slug: string;
  repo_identifier: string | null;
  repo_provider: string | null;
}

/**
 * Resolve the enrolled repository's mutable main branch at read time. This
 * result is deliberately ephemeral: persisting it would turn a time-bounded
 * provider observation back into a stale event-log assertion.
 */
export async function revalidateCurrentProjectMain(
  project: CurrentTruthProjectConnection,
): Promise<CurrentMainRevalidation> {
  const repository = project.repo_identifier?.trim();
  const providerName = project.repo_provider?.trim();
  if (!repository || !providerName) throw new Error('project_repository_connection_unavailable');

  const provider = await createAppAwareRepositoryProvider({
    slug: project.slug,
    repoProvider: providerName,
    repoIdentifier: repository,
  });
  const providerProject = await provider.getProject(project.slug);
  if (
    provider.name !== 'github'
    || providerProject.defaultBranch !== 'main'
    || providerProject.locator.trim().toLowerCase() !== repository.toLowerCase()
  ) {
    throw new Error('project_repository_main_identity_mismatch');
  }

  // Keep the provider read immediately adjacent to projection construction.
  const commitSha = await provider.resolveRef(project.slug, 'main');
  if (!EXACT_SHA.test(commitSha)) throw new Error('project_repository_main_sha_invalid');

  return {
    repository,
    branch: 'main',
    commitSha: commitSha.toLowerCase(),
    provider: 'github',
    observedAt: new Date().toISOString(),
  };
}
