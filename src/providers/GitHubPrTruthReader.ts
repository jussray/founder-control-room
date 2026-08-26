import { providerForProject } from './providerFactory.js';
import type { PullRequestAuditEvidence } from './PullRequestAuditEvidence.js';
import type { RepositoryProvider } from './RepositoryProvider.js';

const FOUNDER_CONTROL_ROOM_PROJECT_ID = 'founder-control-room';
const FOUNDER_CONTROL_ROOM_REPOSITORY = 'jussray/founder-control-room';

export interface GitHubPrTruthReaderDependencies {
  providerFactory?: typeof providerForProject;
}

export class GitHubPrTruthReader {
  private readonly provider: RepositoryProvider;
  private readonly projectId: string;

  constructor(provider: RepositoryProvider, projectId: string) {
    this.provider = provider;
    this.projectId = projectId;
  }

  async readAuditEvidence(pullNumber: number): Promise<PullRequestAuditEvidence> {
    if (!this.provider.auditPullRequestEvidence) {
      throw new Error(`${this.provider.name}: does not support bounded pull-request audit evidence`);
    }
    return this.provider.auditPullRequestEvidence(this.projectId, pullNumber);
  }
}

export async function createGitHubPrTruthReader(
  repositoryIdentifier: string,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: GitHubPrTruthReaderDependencies = {},
): Promise<GitHubPrTruthReader> {
  const normalizedRepository = repositoryIdentifier.trim().toLowerCase();
  if (normalizedRepository !== FOUNDER_CONTROL_ROOM_REPOSITORY) {
    throw new Error('GitHub PR truth v0 is restricted to jussray/founder-control-room');
  }

  // Authentication and host SDK construction belong to providerFactory and the
  // configured RepositoryProvider implementation. The MCP-facing adapter never
  // accepts, returns, or mints provider credentials itself.
  void env;
  const createProvider = dependencies.providerFactory ?? providerForProject;
  const provider = createProvider({
    repo_provider: 'github',
    slug: FOUNDER_CONTROL_ROOM_PROJECT_ID,
    repo_identifier: FOUNDER_CONTROL_ROOM_REPOSITORY,
  });
  return new GitHubPrTruthReader(provider, FOUNDER_CONTROL_ROOM_PROJECT_ID);
}
