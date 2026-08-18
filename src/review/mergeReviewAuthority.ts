import type { RepositoryProvider } from '../providers/RepositoryProvider.js';
import {
  evaluateIndependentReviewGate,
  type IndependentReviewGateResult,
  type IndependentReviewPolicy,
  type IndependentReviewReceipt,
} from './independentReviewGate.js';

export const FCR_REPOSITORY = 'jussray/founder-control-room';

export interface MergeReviewAuthorityInput {
  provider: RepositoryProvider;
  projectId: string;
  repository: string;
  baseRef: string;
  headSha: string;
  payload: Record<string, unknown>;
}

export interface MergeReviewAuthorityProof {
  required: boolean;
  witnessedReviewHashes: string[];
  semanticClearCount: number;
  deterministicClearCount: number;
}

function requiredReviewInputs(payload: Record<string, unknown>): {
  reviews: IndependentReviewReceipt[];
  policy: IndependentReviewPolicy;
} {
  const reviews = payload['independentReviewReceipts'];
  const policy = payload['independentReviewPolicy'];

  if (!Array.isArray(reviews) || reviews.length === 0) {
    throw new Error('FCR merge requires independentReviewReceipts before provider integration.');
  }
  if (!policy || typeof policy !== 'object') {
    throw new Error('FCR merge requires independentReviewPolicy before provider integration.');
  }

  return {
    reviews: reviews as IndependentReviewReceipt[],
    policy: policy as IndependentReviewPolicy,
  };
}

function failedReviewError(result: IndependentReviewGateResult): Error {
  return new Error(
    `Independent review authority gate failed: ${result.blockers.length ? result.blockers.join('; ') : 'review gate not satisfied'}`,
  );
}

export async function enforceMergeReviewAuthority(
  input: MergeReviewAuthorityInput,
): Promise<MergeReviewAuthorityProof> {
  if (input.repository.toLowerCase() !== FCR_REPOSITORY) {
    return {
      required: false,
      witnessedReviewHashes: [],
      semanticClearCount: 0,
      deterministicClearCount: 0,
    };
  }

  if (!/^[0-9a-f]{40}$/i.test(input.headSha)) {
    throw new Error('FCR independent review authority requires an exact 40-character head SHA.');
  }

  const { reviews, policy } = requiredReviewInputs(input.payload);
  const firstReview = reviews[0];
  if (!firstReview) {
    throw new Error('FCR merge requires at least one independent review receipt.');
  }

  const base = await input.provider.getRef(input.projectId, input.baseRef);
  const repositoryOwner = input.repository.split('/')[0]?.trim();
  if (!repositoryOwner) {
    throw new Error('FCR independent review authority cannot resolve repository owner identity.');
  }

  const result = await evaluateIndependentReviewGate(
    input.provider,
    {
      projectId: input.projectId,
      repository: input.repository,
      pullRequestNumber: firstReview.pullRequestNumber,
      baseSha: base.commitSha,
      headSha: input.headSha,
      diffHash: firstReview.diffHash,
      policyHash: firstReview.policyHash,
      authorIdentity: repositoryOwner,
    },
    reviews,
    policy,
  );

  if (!result.reviewGateSatisfied) throw failedReviewError(result);

  return {
    required: true,
    witnessedReviewHashes: result.witnessedReviewHashes,
    semanticClearCount: result.semanticClearCount,
    deterministicClearCount: result.deterministicClearCount,
  };
}
