import {
  buildFirstPartySocialPostInput,
  classifyRepositoryForContent,
  type DraftMaterial,
  type RepositoryEvidence,
} from './socialCampaignPolicy.js';
import {
  validateFirstPartySocialPost,
  type FirstPartySocialPostInput,
  type PreparedFirstPartyPublication,
} from './firstPartySocialPublisher.js';

/**
 * Additive Handshake/brand-media adapter for the existing first-party social pipeline.
 * Owns no provider connection, accounts, uploader, scheduling or publishing authority.
 */
export const HANDSHAKE_BRAND_CONTRACT = 'fcr/handshake-brand-social@v1' as const;
export const HANDSHAKE_PROJECTS = {
  fcr: {
    repository: 'jussray/founder-control-room',
    name: 'Founder Control Room',
    productUrl: 'https://foundercontrolroom.org/',
    logoPath: 'brand/handshake/logo.svg',
    audience: 'business',
    brandColors: ['#55c8ff', '#9b6bff', '#c26bf5'],
    publicClaim: 'Governed AI operations platform; source implementation is not equivalent to live feature proof.',
  },
  bip: {
    repository: 'jussray/Sekret-Bip',
    name: 'Se’kret Bip',
    productUrl: 'https://sekretbip.net/',
    logoPath: 'brand/handshake/logo.svg',
    audience: 'parents_educators_community',
    brandColors: ['#c58aff', '#f8a9df', '#ffe0ab'],
    publicClaim: 'Privacy-first teen and family product; no private teen or family content is marketing material.',
  },
  sync: {
    repository: 'jussray/sync-party-game',
    name: 'SYNC Party',
    productUrl: 'https://sync.jussco.company/',
    logoPath: 'brand/handshake/logo.svg',
    audience: 'business',
    brandColors: ['#21dfff', '#ff3fbd', '#ffc85a'],
    publicClaim: 'Real-time multiplayer game project; live multiplayer performance requires separate evidence.',
  },
} as const;

export type HandshakeProject = keyof typeof HANDSHAKE_PROJECTS;
export type HandshakeAudience = 'business' | 'parents_educators_community';

export interface HandshakeMediaReview {
  project: HandshakeProject;
  logoRepository: string;
  logoPath: string;
  logoSha256: string;
  coverSha256: string;
  /** Publicly reachable image/png or image/jpeg URL after uploading to a verified provider. */
  mediaUrl: string;
  altText: string;
  dimensions: { width: number; height: number };
  founderReviewedExactMediaSha256: string;
  founderReviewReceiptId: string;
  publicReadbackVerified: boolean;
}

export interface HandshakeDraftRequest {
  project: HandshakeProject;
  evidence: RepositoryEvidence;
  audience: HandshakeAudience;
  draft: DraftMaterial;
  mediaReview: HandshakeMediaReview;
  /** This is proof of a business channel binding, not authorization to publish. */
  businessAccountBindingVerified: boolean;
}

const SHA256 = /^[0-9a-f]{64}$/i;
const ACCOUNT_PERSONAL = /(?:^|[\s:@/])(?:juss_fn_ray|juss_ray)(?:$|[\s/@])/i;
const IMAGE_URL = /^https:\/\/[a-z0-9.-]+\/.+\.(?:png|jpe?g)(?:\?[^#]*)?$/i;
const REVIEW_RECEIPT = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

function fail(reason: string): never {
  throw new Error('HANDSHAKE_BRAND_BLOCKED: ' + reason);
}

function approveVisualCandidate(input: HandshakeDraftRequest): void {
  const project = HANDSHAKE_PROJECTS[input.project];
  const media = input.mediaReview;
  if (!project) fail('unknown project');
  if (input.evidence.fullName !== project.repository) fail('project repository mismatch');
  if (input.audience !== project.audience) fail('wrong target audience');
  if (input.project === 'bip' && !input.evidence.policy.containsMinorOrSensitiveData) {
    fail('Bip privacy classification missing');
  }
  if (!input.businessAccountBindingVerified) fail('business account not verified');
  if (ACCOUNT_PERSONAL.test(input.draft.accountId)) fail('personal account is not a business channel');
  if (media.project !== input.project || media.logoRepository !== project.repository ||
      media.logoPath !== project.logoPath) fail('cross-brand logo/media mismatch');
  if (!SHA256.test(media.logoSha256) || !SHA256.test(media.coverSha256) ||
      media.founderReviewedExactMediaSha256.toLowerCase() !== media.coverSha256.toLowerCase()) {
    fail('media hash must match founder-reviewed exact cover');
  }
  if (!REVIEW_RECEIPT.test(media.founderReviewReceiptId)) fail('missing founder visual review');
  if (!media.publicReadbackVerified || !IMAGE_URL.test(media.mediaUrl)) {
    fail('public raster media readback required');
  }
  const url = new URL(media.mediaUrl);
  const productHost = new URL(project.productUrl).hostname;
  const sharedHost = url.hostname === 'cdn.jussco.company' || url.hostname === 'assets.jussco.company';
  if (sharedHost && !url.pathname.toLowerCase().startsWith('/handshake/' + input.project + '/')) {
    fail('shared asset URL does not belong to selected project');
  }
  if (!sharedHost && (url.hostname !== productHost ||
      !url.pathname.startsWith('/brand/handshake/'))) {
    fail('unapproved project media origin');
  }
  if (media.dimensions.width < 1200 ||
      Math.abs(media.dimensions.width / media.dimensions.height - 1.5) > 0.01) {
    fail('Handshake cover must be 3:2 and at least 1200px wide');
  }
  if (!media.altText.trim()) fail('media alt text required');
  if (input.draft.media && input.draft.media.length > 0) {
    const supplied = input.draft.media;
    if (supplied.length !== 1 || supplied[0]?.type !== 'image' ||
        supplied[0].url !== media.mediaUrl || supplied[0].altText !== media.altText) {
      fail('draft media must equal reviewed project media');
    }
  }
}

/** Reuses existing repository classifier, output firewall and first-party draft validator. */
export function prepareHandshakeBrandSocialDraft(
  input: HandshakeDraftRequest,
): { contract: typeof HANDSHAKE_BRAND_CONTRACT; handshake: { status: 'NOT_SUBMITTED'; logoPath: string }; socialInput: FirstPartySocialPostInput; reviewedDraft: PreparedFirstPartyPublication } {
  approveVisualCandidate(input);
  const classification = classifyRepositoryForContent(input.evidence);
  const reviewedDraft = buildFirstPartySocialPostInput(classification, input.evidence, {
    ...input.draft,
    media: [{
      type: 'image',
      url: input.mediaReview.mediaUrl,
      altText: input.mediaReview.altText,
    }],
  });
  if (reviewedDraft.mode !== 'draft' || reviewedDraft.publishAllowed !== false ||
      reviewedDraft.founderApprovalId !== null) fail('draft-only authority violation');
  const validated = validateFirstPartySocialPost(reviewedDraft);
  return {
    contract: HANDSHAKE_BRAND_CONTRACT,
    handshake: { status: 'NOT_SUBMITTED', logoPath: HANDSHAKE_PROJECTS[input.project].logoPath },
    socialInput: reviewedDraft,
    reviewedDraft: validated,
  };
}

/** Safe without account access: project-owned branding / Handshake preparation metadata. */
export function getHandshakeBrandSpec(project: HandshakeProject) {
  const spec = HANDSHAKE_PROJECTS[project];
  if (!spec) fail('unknown project');
  return {
    contract: HANDSHAKE_BRAND_CONTRACT,
    ...spec,
    logoState: 'CANDIDATE_PENDING_FOUNDER_LIVE_BRAND_COMPARISON',
    handshakeSubmission: 'NOT_SUBMITTED',
    socialDistribution: 'BLOCKED_UNTIL_EXACT_MEDIA_ACCOUNT_AND_PROOF_VERIFIED',
    publishingEnabled: false,
  } as const;
}
