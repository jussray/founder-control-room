import {
  FIRST_PARTY_PLATFORM_CAPABILITIES,
  type FirstPartySocialPlatform,
  type FirstPartySocialPostInput,
  type SocialProofLink,
} from './firstPartySocialPublisher.js';

/**
 * Repository-level eligibility for automated content generation.
 *
 * This module decides WHETHER and HOW MUCH a repository may feed the
 * first-party social pipeline. It never generates text, never calls an
 * LLM or a platform provider, and never persists anything — those are
 * separately gated (new provider/data-source scope under CLAUDE.md
 * Approval Gates) and are not part of this pass.
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
   * private health/wellness content, or other data classes this
   * organization treats as never-public. See `README.md` in this file's
   * companion doc for what's required before this can ever be false for
   * a repository that starts out true.
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
}

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;

/**
 * Pure, deterministic classification. No network calls, no side effects.
 *
 * The `containsMinorOrSensitiveData` check runs first and short-circuits
 * everything else — a repository flagged this way cannot reach eligibility
 * through any other branch, including an explicit `configuredMode` override
 * in its own policy file. A config author cannot self-approve past this
 * gate; only removing the flag (a founder decision, made outside this
 * module) can.
 */
export function classifyRepositoryForContent(repo: RepositoryEvidence): CampaignClassification {
  if (!EXACT_COMMIT_SHA.test(repo.exactHead)) {
    return {
      mode: 'not_eligible',
      reason: 'exactHead is not a valid 40-character commit SHA — refusing to classify unverified state.',
      eligibleForDraftGeneration: false,
      daysAllocated: 0,
    };
  }

  if (repo.policy.containsMinorOrSensitiveData) {
    return {
      mode: 'blocked_pending_output_safeguard',
      reason:
        'Repository is flagged containsMinorOrSensitiveData. Prompt-side instructions ("never expose X") are not a sufficient boundary for this data class — see docs/founder-signal-engine/social-campaign-policy-v1.md for what an output-side safeguard needs to look like before this repository can become eligible.',
      eligibleForDraftGeneration: false,
      daysAllocated: 0,
    };
  }

  if (repo.archived) {
    return {
      mode: 'not_eligible',
      reason: 'Repository is archived.',
      eligibleForDraftGeneration: false,
      daysAllocated: 0,
    };
  }

  if (repo.policy.configuredMode === 'not_eligible') {
    return {
      mode: 'not_eligible',
      reason: 'Repository policy explicitly excludes it from content generation.',
      eligibleForDraftGeneration: false,
      daysAllocated: 0,
    };
  }

  if (repo.visibility === 'private' && repo.policy.publicProofUrls.length === 0) {
    return {
      mode: 'not_eligible',
      reason: 'Private repository has no approved public proof URL to reference.',
      eligibleForDraftGeneration: false,
      daysAllocated: 0,
    };
  }

  if (repo.recentCommitCount === 0 && repo.recentMergedPullRequests === 0) {
    return {
      mode: 'ecosystem_only',
      reason: 'No meaningful recent repository activity to draft from.',
      eligibleForDraftGeneration: true,
      daysAllocated: 1,
    };
  }

  if (repo.policy.configuredMode === 'sanitized_product_only') {
    return {
      mode: 'sanitized_product_only',
      reason: 'Policy restricts content to verified customer-facing outcomes only.',
      eligibleForDraftGeneration: true,
      daysAllocated: 14,
    };
  }

  if (repo.policy.configuredMode === 'full_campaign') {
    return {
      mode: 'full_campaign',
      reason: 'Repository has approved public proof and an explicit full-campaign policy.',
      eligibleForDraftGeneration: true,
      daysAllocated: 14,
    };
  }

  return {
    mode: 'ecosystem_only',
    reason: 'Recent activity is meaningful but no full-campaign policy is configured for this repository.',
    eligibleForDraftGeneration: true,
    daysAllocated: 2,
  };
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
}

/**
 * Shapes classified, already-generated draft text into the exact input
 * contract `validateFirstPartySocialPost` (src/lib/firstPartySocialPublisher.ts)
 * expects, always in `draft` mode. This is the integration point a future
 * content-generation adapter (Perplexity or otherwise) would call into —
 * it does not itself generate anything, and `mode: 'draft'` never requires
 * `publishAllowed` or `founderApprovalId`, so nothing this function builds
 * can be queued or published on its own.
 */
export function buildFirstPartySocialPostInput(
  classification: CampaignClassification,
  repo: RepositoryEvidence,
  draft: DraftMaterial,
): FirstPartySocialPostInput {
  if (!classification.eligibleForDraftGeneration) {
    throw new Error(`${repo.fullName} is not eligible for draft generation: ${classification.reason}`);
  }

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
  };
}
