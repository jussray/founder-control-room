import {
  FIRST_PARTY_PLATFORM_CAPABILITIES,
  type FirstPartySocialPlatform,
  type FirstPartySocialPostInput,
  type SocialMediaAsset,
  type SocialProofLink,
} from './firstPartySocialPublisher.js';

/**
 * Repository-level eligibility for automated content generation.
 *
 * This module decides WHETHER and HOW MUCH a repository may feed the
 * first-party social pipeline. It never generates text, never calls an
 * LLM or a platform provider, and never persists anything. Those are
 * separately gated and are not part of this module.
 */

export type CampaignMode =
  | 'not_eligible'
  | 'ecosystem_only'
  | 'sanitized_product_only'
  | 'full_campaign'
  | 'blocked_pending_output_safeguard';

export interface RepositoryContentPolicy {
  /**
   * Set this true for any repository whose activity could reference minors,
   * private health/wellness content, or other data classes this organization
   * treats as never-public.
   */
  containsMinorOrSensitiveData: boolean;
  configuredMode?: CampaignMode;
  publicProofUrls: string[];
  neverClaim: string[];
  neverExpose: string[];
  hubspotDealName?: string;
}

export interface RepositoryEvidence {
  fullName: string;
  visibility: 'public' | 'private';
  archived: boolean;
  exactHead: string;
  recentCommitCount: number;
  recentMergedPullRequests: number;
  policy: RepositoryContentPolicy;
}

export interface CampaignClassification {
  mode: CampaignMode;
  reason: string;
  eligibleForDraftGeneration: boolean;
  daysAllocated: number;
  /** Immutable identity of the evidence this classification authorized. */
  authorizedRepository: string;
  authorizedExactHead: string;
}

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;

function classification(
  repo: RepositoryEvidence,
  result: Omit<CampaignClassification, 'authorizedRepository' | 'authorizedExactHead'>,
): CampaignClassification {
  return {
    ...result,
    authorizedRepository: repo.fullName,
    authorizedExactHead: repo.exactHead.toLowerCase(),
  };
}

/**
 * Pure, deterministic classification. No network calls and no side effects.
 *
 * Sensitive-data and explicit-block checks run before every eligibility path.
 * A repository cannot self-approve past either boundary through another
 * configured mode.
 */
export function classifyRepositoryForContent(repo: RepositoryEvidence): CampaignClassification {
  if (!EXACT_COMMIT_SHA.test(repo.exactHead)) {
    return classification(repo, {
      mode: 'not_eligible',
      reason: 'exactHead is not a valid 40-character commit SHA — refusing to classify unverified state.',
      eligibleForDraftGeneration: false,
      daysAllocated: 0,
    });
  }

  if (repo.policy.containsMinorOrSensitiveData) {
    return classification(repo, {
      mode: 'blocked_pending_output_safeguard',
      reason:
        'Repository is flagged containsMinorOrSensitiveData. Prompt-side instructions are not a sufficient boundary for this data class; an output-side safeguard is required before eligibility.',
      eligibleForDraftGeneration: false,
      daysAllocated: 0,
    });
  }

  if (repo.policy.configuredMode === 'blocked_pending_output_safeguard') {
    return classification(repo, {
      mode: 'blocked_pending_output_safeguard',
      reason: 'Repository policy explicitly blocks draft generation pending an output-side safeguard.',
      eligibleForDraftGeneration: false,
      daysAllocated: 0,
    });
  }

  if (repo.archived) {
    return classification(repo, {
      mode: 'not_eligible',
      reason: 'Repository is archived.',
      eligibleForDraftGeneration: false,
      daysAllocated: 0,
    });
  }

  if (repo.policy.configuredMode === 'not_eligible') {
    return classification(repo, {
      mode: 'not_eligible',
      reason: 'Repository policy explicitly excludes it from content generation.',
      eligibleForDraftGeneration: false,
      daysAllocated: 0,
    });
  }

  if (repo.visibility === 'private' && repo.policy.publicProofUrls.length === 0) {
    return classification(repo, {
      mode: 'not_eligible',
      reason: 'Private repository has no approved public proof URL to reference.',
      eligibleForDraftGeneration: false,
      daysAllocated: 0,
    });
  }

  if (repo.recentCommitCount === 0 && repo.recentMergedPullRequests === 0) {
    return classification(repo, {
      mode: 'ecosystem_only',
      reason: 'No meaningful recent repository activity to draft from.',
      eligibleForDraftGeneration: true,
      daysAllocated: 1,
    });
  }

  if (repo.policy.configuredMode === 'sanitized_product_only') {
    return classification(repo, {
      mode: 'sanitized_product_only',
      reason: 'Policy restricts content to verified customer-facing outcomes only.',
      eligibleForDraftGeneration: true,
      daysAllocated: 14,
    });
  }

  if (repo.policy.configuredMode === 'full_campaign') {
    return classification(repo, {
      mode: 'full_campaign',
      reason: 'Repository has approved public proof and an explicit full-campaign policy.',
      eligibleForDraftGeneration: true,
      daysAllocated: 14,
    });
  }

  return classification(repo, {
    mode: 'ecosystem_only',
    reason: 'Recent activity is meaningful but no full-campaign policy is configured for this repository.',
    eligibleForDraftGeneration: true,
    daysAllocated: 2,
  });
}

export interface DraftMaterial {
  platform: FirstPartySocialPlatform;
  accountId: string;
  text: string;
  traction: string;
  governanceAdvantage: string;
  audienceValue: string;
  investorSignal: string;
  proofLinks: SocialProofLink[];
  media?: SocialMediaAsset[];
  platformCharacterLimit?: number | null;
}

function assertClassificationMatchesRepository(
  classificationResult: CampaignClassification,
  repo: RepositoryEvidence,
): void {
  if (
    classificationResult.authorizedRepository !== repo.fullName ||
    classificationResult.authorizedExactHead !== repo.exactHead.toLowerCase()
  ) {
    throw new Error(
      `Campaign classification does not authorize ${repo.fullName}@${repo.exactHead}; ` +
        `it authorizes ${classificationResult.authorizedRepository}@${classificationResult.authorizedExactHead}.`,
    );
  }
}

function assertRepositoryPolicyAllowsDraft(repo: RepositoryEvidence, draft: DraftMaterial): void {
  const publicCopy = [
    draft.text,
    draft.traction,
    draft.governanceAdvantage,
    draft.audienceValue,
    draft.investorSignal,
    ...draft.proofLinks.map((proof) => proof.label),
  ].join('\n');

  for (const prohibited of repo.policy.neverClaim) {
    const term = prohibited.trim();
    if (term && publicCopy.toLocaleLowerCase().includes(term.toLocaleLowerCase())) {
      throw new Error(`Draft violates neverClaim policy: ${term}`);
    }
  }

  for (const prohibited of repo.policy.neverExpose) {
    const term = prohibited.trim();
    if (term && publicCopy.toLocaleLowerCase().includes(term.toLocaleLowerCase())) {
      throw new Error(`Draft violates neverExpose policy: ${term}`);
    }
  }
}

function assertPlatformRequirements(draft: DraftMaterial): void {
  const capability = FIRST_PARTY_PLATFORM_CAPABILITIES[draft.platform];

  if (capability.safeCharacterLimit === null) {
    if (!Number.isInteger(draft.platformCharacterLimit) || Number(draft.platformCharacterLimit) <= 0) {
      throw new Error(`${draft.platform} requires a verified platformCharacterLimit.`);
    }
  }

  if (capability.requiresMedia && (!draft.media || draft.media.length === 0)) {
    throw new Error(`${draft.platform} requires at least one media asset.`);
  }
}

/**
 * Shapes classified, already-generated draft text into the exact input
 * contract validateFirstPartySocialPost expects, always in draft mode.
 */
export function buildFirstPartySocialPostInput(
  classificationResult: CampaignClassification,
  repo: RepositoryEvidence,
  draft: DraftMaterial,
): FirstPartySocialPostInput {
  assertClassificationMatchesRepository(classificationResult, repo);

  if (!classificationResult.eligibleForDraftGeneration) {
    throw new Error(`${repo.fullName} is not eligible for draft generation: ${classificationResult.reason}`);
  }

  assertRepositoryPolicyAllowsDraft(repo, draft);
  assertPlatformRequirements(draft);

  return {
    platform: draft.platform,
    accountId: draft.accountId,
    contentField: FIRST_PARTY_PLATFORM_CAPABILITIES[draft.platform].contentField,
    text: draft.text,
    traction: draft.traction,
    governanceAdvantage: draft.governanceAdvantage,
    audienceValue: draft.audienceValue,
    investorSignal: draft.investorSignal,
    proofLinks: draft.proofLinks,
    sourceRepository: repo.fullName,
    sourceCommitSha: repo.exactHead,
    mode: 'draft',
    publishAllowed: false,
    founderApprovalId: null,
    media: draft.media,
    platformCharacterLimit: draft.platformCharacterLimit,
  };
}
