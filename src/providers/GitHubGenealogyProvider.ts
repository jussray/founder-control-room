import {
  GitHubChangeGenealogyReader,
  type GitHubChangeGenealogyEvidence,
} from './GitHubChangeGenealogyReader.js';
import { GitHubProvider, type GitHubProviderConfig } from './GitHubProvider.js';
import type { ChangeGenealogyReadInput } from './RepositoryProvider.js';

export interface GitHubGenealogyProviderConfig extends GitHubProviderConfig {
  env?: NodeJS.ProcessEnv;
}

/**
 * GitHub repository provider with a bounded change-genealogy read capability.
 *
 * The project map remains the isolation membrane. In App-auth production the
 * genealogy reader mints its narrower read-only installation token against
 * GitHub's canonical API host. The local GITHUB_TOKEN fallback is reused only
 * when App credentials are absent.
 */
export class GitHubGenealogyProvider extends GitHubProvider {
  private readonly genealogyProjectMap: Record<string, string>;
  private readonly genealogyToken: string;
  private readonly genealogyEnv: NodeJS.ProcessEnv;

  constructor(config: GitHubGenealogyProviderConfig) {
    super(config);
    this.genealogyProjectMap = { ...config.projectMap };
    this.genealogyToken = config.token;
    this.genealogyEnv = config.env ?? process.env;
  }

  async readChangeGenealogyEvidence(
    projectId: string,
    input: ChangeGenealogyReadInput = {},
  ): Promise<GitHubChangeGenealogyEvidence> {
    const repository = this.genealogyProjectMap[projectId];
    if (!repository) {
      throw new Error(`GitHubGenealogyProvider: no repo mapped for projectId "${projectId}"`);
    }

    const appId = this.genealogyEnv.GITHUB_APP_ID?.trim();
    const privateKey = this.genealogyEnv.GITHUB_PRIVATE_KEY?.trim();
    const hasAppCredentials = Boolean(appId && privateKey);
    const reader = new GitHubChangeGenealogyReader(
      repository,
      this.genealogyEnv,
      hasAppCredentials
        ? {}
        : { tokenFactory: async () => this.genealogyToken },
    );

    return reader.readGenealogyEvidence(input);
  }
}
