import { providerForProject } from './providerFactory.js';
import type {
  Diff,
  PullRequestReviewContext,
  RepositoryProvider,
  ReviewSignal,
  VerificationSignal,
} from './RepositoryProvider.js';

const FOUNDER_CONTROL_ROOM_PROJECT_ID = 'founder-control-room';
const FOUNDER_CONTROL_ROOM_REPOSITORY = 'jussray/founder-control-room';

export interface GitHubPrTruthEvidence {
  initialPullRequest: PullRequestReviewContext;
  finalPullRequest: PullRequestReviewContext;
  verificationSignals: VerificationSignal[];
  reviewSignals: ReviewSignal[];
  diff: Diff;
}

export interface GitHubPrTruthReaderLike {
  readAuditEvidence(pullNumber: number): Promise<GitHubPrTruthEvidence>;
}

export interface GitHubPrTruthReaderDependencies {
  providerFactory?: typeof providerForProject;
}

/**
 * Narrow read-only adapter for one Founder Control Room pull request.
 * Host credentials and SDK construction stay behind RepositoryProvider.
 */
export class GitHubPrTruthReader implements GitHubPrTruthReaderLike {
  constructor(
    private readonly provider: RepositoryProvider,
    private readonly projectId: string,
  ) {}

  async readAuditEvidence(pullNumber: number): Promise<GitHubPrTruthEvidence> {
    if (!Number.isInteger(pullNumber) || pullNumber <= 0 || pullNumber > 2_147_483_647) {
      throw new Error('pullNumber must be a positive integer');
    }
    if (!this.provider.getPullRequestReviewContext) {
      throw new Error(`${this.provider.name}: provider-backed pull-request context is unavailable`);
    }

    const initialPullRequest = await this.provider.getPullRequestReviewContext(
      this.projectId,
      pullNumber,
    );

    const [verificationSignals, reviewSignals, diff] = await Promise.all([
      this.provider.listVerificationSignals(this.projectId, initialPullRequest.headSha),
      this.provider.listReviewSignals
        ? this.provider.listReviewSignals(this.projectId, pullNumber)
        : Promise.resolve([]),
      this.provider.compare(
        this.projectId,
        initialPullRequest.baseSha,
        initialPullRequest.headSha,
      ),
    ]);

    const finalPullRequest = await this.provider.getPullRequestReviewContext(
      this.projectId,
      pullNumber,
    );

    return {
      initialPullRequest,
      finalPullRequest,
      verificationSignals,
      reviewSignals,
      diff,
    };
  }
}

export async function createGitHubPrTruthReader(
  repositoryIdentifier: string,
  _env: NodeJS.ProcessEnv = process.env,
  dependencies: GitHubPrTruthReaderDependencies = {},
): Promise<GitHubPrTruthReader> {
  if (repositoryIdentifier.trim().toLowerCase() !== FOUNDER_CONTROL_ROOM_REPOSITORY) {
    throw new Error('GitHub PR truth is restricted to jussray/founder-control-room');
  }

  const createProvider = dependencies.providerFactory ?? providerForProject;
  const provider = createProvider({
    repo_provider: 'github',
    slug: FOUNDER_CONTROL_ROOM_PROJECT_ID,
    repo_identifier: FOUNDER_CONTROL_ROOM_REPOSITORY,
  });

  return new GitHubPrTruthReader(provider, FOUNDER_CONTROL_ROOM_PROJECT_ID);
}
