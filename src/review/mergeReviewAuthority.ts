import type { RepositoryProvider } from '../providers/RepositoryProvider.js';
import {
  evaluateIndependentReviewGate,
  independentReviewDiffHash,
  independentReviewPolicyHash,
  type IndependentReviewGateResult,
  type IndependentReviewPolicy,
  type IndependentReviewReceipt,
} from './independentReviewGate.js';

export const FCR_REPOSITORY = 'jussray/founder-control-room';
const FCR_TRUSTED_REVIEWERS_ENV = 'FCR_TRUSTED_SEMANTIC_REVIEWER_IDS';
const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const lower = (value: unknown): string => text(value).toLowerCase();

export interface FounderPinnedMergeReviewAuthority {
  pullRequestNumber: number;
  baseSha: string;
  authorIdentity: string;
  policyHash: string;
}

export interface PrepareMergeReviewAuthorityInput {
  provider: RepositoryProvider;
  projectId: string;
  repository: string;
  baseRef: string;
  headRef: string;
  headSha: string;
  request: unknown;
  env?: NodeJS.ProcessEnv;
}

export interface MergeReviewAuthorityInput {
  provider: RepositoryProvider;
  projectId: string;
  repository: string;
  baseRef: string;
  headRef: string;
  headSha: string;
  pinned: unknown;
  payload: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
}

export interface MergeReviewAuthorityProof {
  required: boolean;
  pullRequestNumber?: number;
  baseSha?: string;
  diffHash?: string;
  policyHash?: string;
  witnessedReviewHashes: string[];
  semanticClearCount: number;
  deterministicClearCount: number;
}

function trustedSemanticReviewerIds(env: NodeJS.ProcessEnv): string[] {
  const raw = env[FCR_TRUSTED_REVIEWERS_ENV]?.trim() ?? '';
  if (!raw) {
    throw new Error(
      `FCR merge requires server-owned ${FCR_TRUSTED_REVIEWERS_ENV}; caller-supplied reviewer trust is forbidden.`,
    );
  }

  const ids = raw.split(',').map((value) => value.trim()).filter(Boolean);
  if (ids.length === 0) {
    throw new Error('FCR merge requires at least one server-configured trusted semantic reviewer identity.');
  }
  if (ids.length > 8) {
    throw new Error('FCR merge supports at most 8 server-configured trusted semantic reviewer identities.');
  }

  const normalized = ids.map(lower);
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('FCR merge trusted semantic reviewer identities must be unique.');
  }
  if (normalized.some((id) => /\[bot\]$/i.test(id))) {
    throw new Error('FCR merge trusted semantic reviewer identities cannot contain GitHub App bot identities.');
  }

  return ids;
}

export function serverOwnedIndependentReviewPolicy(
  env: NodeJS.ProcessEnv = process.env,
): IndependentReviewPolicy {
  return {
    requiredSemanticReviews: 1,
    requireDeterministicReview: true,
    blockOnP2: true,
    trustedSemanticReviewerIds: trustedSemanticReviewerIds(env),
  };
}

function pullRequestNumberFromRequest(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('FCR merge approval requires independentReview metadata with pullRequestNumber.');
  }
  const candidate = value as Record<string, unknown>;
  if (candidate['policy'] !== undefined || candidate['independentReviewPolicy'] !== undefined) {
    throw new Error('FCR merge reviewer policy is server-owned and cannot be supplied by the caller.');
  }
  const pullRequestNumber = candidate['pullRequestNumber'];
  if (!Number.isInteger(pullRequestNumber) || Number(pullRequestNumber) <= 0) {
    throw new Error('FCR merge approval requires a positive independentReview.pullRequestNumber.');
  }
  return Number(pullRequestNumber);
}

function readPinnedAuthority(value: unknown): FounderPinnedMergeReviewAuthority {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('FCR merge requires founder-pinned independent review authority.');
  }
  const candidate = value as Record<string, unknown>;
  const pullRequestNumber = candidate['pullRequestNumber'];
  const baseSha = lower(candidate['baseSha']);
  const authorIdentity = text(candidate['authorIdentity']);
  const policyHash = lower(candidate['policyHash']);
  if (!Number.isInteger(pullRequestNumber) || Number(pullRequestNumber) <= 0) {
    throw new Error('Pinned independent review PR number is invalid.');
  }
  if (!FULL_SHA.test(baseSha)) throw new Error('Pinned independent review base SHA is invalid.');
  if (!authorIdentity) throw new Error('Pinned independent review author identity is missing.');
  if (!SHA256.test(policyHash)) throw new Error('Pinned independent review policy hash is invalid.');
  return {
    pullRequestNumber: Number(pullRequestNumber),
    baseSha,
    authorIdentity,
    policyHash,
  };
}

function requiredReviewReceipts(payload: Record<string, unknown>): IndependentReviewReceipt[] {
  const reviews = payload['independentReviewReceipts'];
  if (!Array.isArray(reviews) || reviews.length === 0) {
    throw new Error('FCR merge requires independentReviewReceipts before provider integration.');
  }
  if (payload['independentReviewPolicy'] !== undefined) {
    throw new Error(
      'FCR merge independentReviewPolicy is server-owned; callers may submit review receipts but may not redefine reviewer trust.',
    );
  }
  return reviews as IndependentReviewReceipt[];
}

function failedReviewError(result: IndependentReviewGateResult): Error {
  return new Error(
    `Independent review authority gate failed: ${result.blockers.length ? result.blockers.join('; ') : 'review gate not satisfied'}`,
  );
}

export async function prepareMergeReviewAuthority(
  input: PrepareMergeReviewAuthorityInput,
): Promise<FounderPinnedMergeReviewAuthority | null> {
  if (lower(input.repository) !== FCR_REPOSITORY) return null;
  if (!FULL_SHA.test(input.headSha)) {
    throw new Error('FCR independent review authority requires an exact 40-character head SHA.');
  }
  const pullRequestNumber = pullRequestNumberFromRequest(input.request);
  const policy = serverOwnedIndependentReviewPolicy(input.env ?? process.env);
  if (typeof input.provider.getPullRequestReviewContext !== 'function') {
    throw new Error('Repository provider cannot supply exact pull request review context.');
  }

  const pullRequest = await input.provider.getPullRequestReviewContext(input.projectId, pullRequestNumber);
  const identityMatches =
    lower(pullRequest.repository) === FCR_REPOSITORY
    && lower(pullRequest.headRepository) === FCR_REPOSITORY
    && pullRequest.baseRef === input.baseRef
    && pullRequest.headRef === input.headRef
    && lower(pullRequest.headSha) === lower(input.headSha);
  if (!identityMatches) {
    throw new Error('Founder approval PR does not match the exact FCR repository/base/head being approved.');
  }
  if (!FULL_SHA.test(text(pullRequest.baseSha)) || !text(pullRequest.authorIdentity)) {
    throw new Error('Provider PR identity is missing an exact base SHA or author identity.');
  }

  const currentBaseSha = await input.provider.resolveRef(input.projectId, input.baseRef);
  if (lower(currentBaseSha) !== lower(pullRequest.baseSha)) {
    throw new Error('FCR base branch moved before founder review authority could be pinned.');
  }

  return {
    pullRequestNumber,
    baseSha: lower(pullRequest.baseSha),
    authorIdentity: text(pullRequest.authorIdentity),
    policyHash: independentReviewPolicyHash(policy),
  };
}

export async function enforceMergeReviewAuthority(
  input: MergeReviewAuthorityInput,
): Promise<MergeReviewAuthorityProof> {
  if (lower(input.repository) !== FCR_REPOSITORY) {
    return {
      required: false,
      witnessedReviewHashes: [],
      semanticClearCount: 0,
      deterministicClearCount: 0,
    };
  }
  if (!FULL_SHA.test(input.headSha)) {
    throw new Error('FCR independent review authority requires an exact 40-character head SHA.');
  }

  const pinned = readPinnedAuthority(input.pinned);
  const reviews = requiredReviewReceipts(input.payload);
  const policy = serverOwnedIndependentReviewPolicy(input.env ?? process.env);
  const policyHash = independentReviewPolicyHash(policy);
  if (policyHash !== pinned.policyHash) {
    throw new Error('FCR server-owned independent review policy changed after founder approval.');
  }
  if (typeof input.provider.getPullRequestReviewContext !== 'function') {
    throw new Error('Repository provider cannot supply exact pull request review context.');
  }

  const pullRequest = await input.provider.getPullRequestReviewContext(input.projectId, pinned.pullRequestNumber);
  const identityMatches =
    lower(pullRequest.repository) === FCR_REPOSITORY
    && lower(pullRequest.headRepository) === FCR_REPOSITORY
    && pullRequest.baseRef === input.baseRef
    && pullRequest.headRef === input.headRef
    && lower(pullRequest.baseSha) === pinned.baseSha
    && lower(pullRequest.headSha) === lower(input.headSha)
    && lower(pullRequest.authorIdentity) === lower(pinned.authorIdentity);
  if (!identityMatches) {
    throw new Error('Independent review authority gate failed: provider PR identity changed after founder approval.');
  }

  const diff = await input.provider.compare(input.projectId, pinned.baseSha, input.headSha);
  if (diff.behindBy !== 0 || diff.aheadBy < 1) {
    throw new Error(
      `Independent review authority gate failed: reviewed head must descend from the pinned base (ahead=${diff.aheadBy}, behind=${diff.behindBy}).`,
    );
  }
  const diffHash = independentReviewDiffHash(diff);

  const result = await evaluateIndependentReviewGate(
    input.provider,
    {
      projectId: input.projectId,
      repository: input.repository,
      pullRequestNumber: pinned.pullRequestNumber,
      baseSha: pinned.baseSha,
      headSha: input.headSha,
      diffHash,
      policyHash,
      authorIdentity: pinned.authorIdentity,
    },
    reviews,
    policy,
  );
  if (!result.reviewGateSatisfied) throw failedReviewError(result);

  return {
    required: true,
    pullRequestNumber: pinned.pullRequestNumber,
    baseSha: pinned.baseSha,
    diffHash,
    policyHash,
    witnessedReviewHashes: result.witnessedReviewHashes,
    semanticClearCount: result.semanticClearCount,
    deterministicClearCount: result.deterministicClearCount,
  };
}
