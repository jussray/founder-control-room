import { createHash } from 'node:crypto';

export const FIRST_PARTY_SOCIAL_PLATFORMS = [
  'linkedin',
  'facebook',
  'instagram',
  'threads',
  'x',
  'tiktok',
  'youtube',
  'pinterest',
  'bluesky',
  'mastodon',
  'google_business',
] as const;

export type FirstPartySocialPlatform = (typeof FIRST_PARTY_SOCIAL_PLATFORMS)[number];
export type FirstPartyPublicationMode = 'draft' | 'queue' | 'publish';
export type FirstPartyAdapterReadiness =
  | 'direct-text'
  | 'media-required'
  | 'provider-review-required';

export interface SocialProofLink {
  label: string;
  url: string;
}

export interface SocialMediaAsset {
  type: 'image' | 'video';
  url: string;
  altText?: string | null;
}

export interface FirstPartySocialPostInput {
  platform: FirstPartySocialPlatform;
  accountId: string;
  contentField: string;
  text: string;
  traction: string;
  governanceAdvantage: string;
  audienceValue: string;
  investorSignal: string;
  proofLinks: SocialProofLink[];
  sourceRepository: string;
  sourceCommitSha: string;
  mode: FirstPartyPublicationMode;
  publishAllowed: boolean;
  founderApprovalId?: string | null;
  media?: SocialMediaAsset[];
  platformCharacterLimit?: number | null;
}

export interface FirstPartyPlatformCapability {
  platform: FirstPartySocialPlatform;
  contentField: string;
  adapterReadiness: FirstPartyAdapterReadiness;
  accountBoundary: string;
  safeCharacterLimit: number | null;
  requiresMedia: boolean;
  credentialRefs: readonly string[];
  notes: readonly string[];
}

export interface PreparedFirstPartyPublication {
  platform: FirstPartySocialPlatform;
  accountId: string;
  contentField: string;
  text: string;
  traction: string;
  governanceAdvantage: string;
  audienceValue: string;
  investorSignal: string;
  proofLinks: SocialProofLink[];
  proofUrls: string[];
  sourceRepository: string;
  sourceCommitSha: string;
  mode: FirstPartyPublicationMode;
  founderApprovalId: string | null;
  media: SocialMediaAsset[];
  characterLimit: number;
  contentHash: string;
  idempotencyKey: string;
  capability: FirstPartyPlatformCapability;
}

export interface FirstPartyPublicationReceipt {
  platform: FirstPartySocialPlatform;
  externalPostId: string;
  permalink: string;
  providerRequestId: string | null;
  publishedAt: string;
  contentHash: string;
  sourceCommitSha: string;
  proofUrls: string[];
}

export interface FirstPartyPlatformAdapter {
  platform: FirstPartySocialPlatform;
  publish(prepared: PreparedFirstPartyPublication): Promise<FirstPartyPublicationReceipt>;
}

export type FirstPartyAdapterRegistry = Partial<
  Record<FirstPartySocialPlatform, FirstPartyPlatformAdapter>
>;

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const REPOSITORY_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HTTPS_URL = /^https:\/\//i;
const SECRETISH_PATTERN =
  /(sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+|API[_-]?KEY|SERVICE[_-]?ROLE|PASSWORD|SECRET|TOKEN)/i;
const PROMPT_LEAK_PATTERNS = [
  /\byou are writing for\b/i,
  /\byou are the (analysis|content|social|copy) worker\b/i,
  /\breturn (exactly )?(one )?(valid )?json\b/i,
  /\breturn this structure\b/i,
  /\bbefore writing anything\b/i,
  /\bcreate (a|the|three) (concise|platform-specific|linkedin|facebook|instagram|social)/i,
  /\bsystem instruction\s*:/i,
  /\buser message\s*:/i,
  /\binstructions?\s*:/i,
  /\bgithub evidence\s*:/i,
  /\{\{[^}]+\}\}/,
];

export const FIRST_PARTY_PLATFORM_CAPABILITIES: Record<
  FirstPartySocialPlatform,
  FirstPartyPlatformCapability
> = {
  linkedin: {
    platform: 'linkedin',
    contentField: 'linkedin_draft',
    adapterReadiness: 'direct-text',
    accountBoundary: 'authenticated member or authorized organization',
    safeCharacterLimit: 2900,
    requiresMedia: false,
    credentialRefs: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_AUTHOR_URN'],
    notes: ['Reserve 100 characters below LinkedIn’s 3,000-character ceiling.'],
  },
  facebook: {
    platform: 'facebook',
    contentField: 'facebook_draft',
    adapterReadiness: 'direct-text',
    accountBoundary: 'authorized Facebook Page only',
    safeCharacterLimit: null,
    requiresMedia: false,
    credentialRefs: ['META_PAGE_ACCESS_TOKEN', 'META_FACEBOOK_PAGE_ID'],
    notes: ['Personal-profile posting is not treated as an API publication target.'],
  },
  instagram: {
    platform: 'instagram',
    contentField: 'instagram_draft',
    adapterReadiness: 'media-required',
    accountBoundary: 'authorized Instagram professional account',
    safeCharacterLimit: null,
    requiresMedia: true,
    credentialRefs: ['META_INSTAGRAM_ACCESS_TOKEN', 'META_INSTAGRAM_ACCOUNT_ID'],
    notes: ['Publishing uses a media-container step followed by a publish step.'],
  },
  threads: {
    platform: 'threads',
    contentField: 'threads_draft',
    adapterReadiness: 'direct-text',
    accountBoundary: 'authorized Threads account',
    safeCharacterLimit: null,
    requiresMedia: false,
    credentialRefs: ['THREADS_ACCESS_TOKEN', 'THREADS_USER_ID'],
    notes: ['Publishing uses a creation container followed by threads_publish.'],
  },
  x: {
    platform: 'x',
    contentField: 'x_draft',
    adapterReadiness: 'direct-text',
    accountBoundary: 'authenticated X user',
    safeCharacterLimit: 270,
    requiresMedia: false,
    credentialRefs: ['X_USER_ACCESS_TOKEN'],
    notes: ['Reserve 10 characters below the standard 280-character ceiling.'],
  },
  tiktok: {
    platform: 'tiktok',
    contentField: 'tiktok_caption',
    adapterReadiness: 'provider-review-required',
    accountBoundary: 'authorized TikTok creator account',
    safeCharacterLimit: null,
    requiresMedia: true,
    credentialRefs: ['TIKTOK_ACCESS_TOKEN', 'TIKTOK_OPEN_ID'],
    notes: ['Direct Post requires official app setup, creator consent, media, and provider review.'],
  },
  youtube: {
    platform: 'youtube',
    contentField: 'youtube_shorts_draft',
    adapterReadiness: 'provider-review-required',
    accountBoundary: 'authorized YouTube channel',
    safeCharacterLimit: null,
    requiresMedia: true,
    credentialRefs: ['YOUTUBE_OAUTH_REFRESH_TOKEN', 'YOUTUBE_CHANNEL_ID'],
    notes: ['Video upload uses resumable media upload and may require API-project audit.'],
  },
  pinterest: {
    platform: 'pinterest',
    contentField: 'pinterest_draft',
    adapterReadiness: 'media-required',
    accountBoundary: 'authorized Pinterest account and board',
    safeCharacterLimit: null,
    requiresMedia: true,
    credentialRefs: ['PINTEREST_ACCESS_TOKEN', 'PINTEREST_BOARD_ID'],
    notes: ['A Pin requires a board and publishable media source.'],
  },
  bluesky: {
    platform: 'bluesky',
    contentField: 'bluesky_draft',
    adapterReadiness: 'direct-text',
    accountBoundary: 'authenticated AT Protocol repository',
    safeCharacterLimit: null,
    requiresMedia: false,
    credentialRefs: ['BLUESKY_PDS_URL', 'BLUESKY_DID', 'BLUESKY_APP_PASSWORD'],
    notes: ['Posts are app.bsky.feed.post records written to the account PDS.'],
  },
  mastodon: {
    platform: 'mastodon',
    contentField: 'mastodon_draft',
    adapterReadiness: 'direct-text',
    accountBoundary: 'authenticated account on a configured Mastodon instance',
    safeCharacterLimit: null,
    requiresMedia: false,
    credentialRefs: ['MASTODON_INSTANCE_URL', 'MASTODON_ACCESS_TOKEN'],
    notes: ['Character limits are instance-configurable and must be supplied per account.'],
  },
  google_business: {
    platform: 'google_business',
    contentField: 'google_business_draft',
    adapterReadiness: 'provider-review-required',
    accountBoundary: 'verified Google Business Profile location',
    safeCharacterLimit: null,
    requiresMedia: false,
    credentialRefs: ['GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN', 'GOOGLE_BUSINESS_LOCATION_ID'],
    notes: ['Keep blocked until current provider publishing authority is reverified.'],
  },
};

export class FirstPartySocialPublisherError extends Error {
  readonly code = 'FIRST_PARTY_SOCIAL_POST_REJECTED';
  readonly details: string[];

  constructor(details: string[]) {
    super(`${'FIRST_PARTY_SOCIAL_POST_REJECTED'}: ${details.join('; ')}`);
    this.details = details;
  }
}

function trimmed(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validHttpsUrl(value: string): boolean {
  if (!HTTPS_URL.test(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function effectiveCharacterLimit(
  capability: FirstPartyPlatformCapability,
  override: number | null | undefined,
): number | null {
  if (override !== undefined && override !== null) {
    return Number.isInteger(override) && override > 0 ? override : null;
  }
  return capability.safeCharacterLimit;
}

function normalizedProofLinks(proofLinks: SocialProofLink[]): SocialProofLink[] {
  return proofLinks.map((proof) => ({
    label: trimmed(proof.label),
    url: trimmed(proof.url),
  }));
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function validateFirstPartySocialPost(
  input: FirstPartySocialPostInput,
): PreparedFirstPartyPublication {
  const errors: string[] = [];
  const capability = FIRST_PARTY_PLATFORM_CAPABILITIES[input.platform];
  const text = trimmed(input.text);
  const accountId = trimmed(input.accountId);
  const contentField = trimmed(input.contentField);
  const traction = trimmed(input.traction);
  const governanceAdvantage = trimmed(input.governanceAdvantage);
  const audienceValue = trimmed(input.audienceValue);
  const investorSignal = trimmed(input.investorSignal);
  const sourceRepository = trimmed(input.sourceRepository);
  const sourceCommitSha = trimmed(input.sourceCommitSha).toLowerCase();
  const founderApprovalId = trimmed(input.founderApprovalId) || null;
  const proofLinks = normalizedProofLinks(input.proofLinks ?? []);
  const proofUrls = proofLinks.map((proof) => proof.url);
  const media = (input.media ?? []).map((asset) => ({
    type: asset.type,
    url: trimmed(asset.url),
    altText: trimmed(asset.altText) || null,
  }));
  const characterLimit = effectiveCharacterLimit(capability, input.platformCharacterLimit);

  if (!accountId) errors.push('accountId is required');
  if (SECRETISH_PATTERN.test(accountId)) errors.push('accountId must not contain secret material');
  if (contentField !== capability.contentField) {
    errors.push(`${input.platform} must use contentField ${capability.contentField}`);
  }
  if (text.length < 80) errors.push('text must contain at least 80 characters of finished copy');
  if (!traction) errors.push('traction is required');
  if (!governanceAdvantage) errors.push('governanceAdvantage is required');
  if (!audienceValue) errors.push('audienceValue is required');
  if (!investorSignal) errors.push('investorSignal is required');
  if (!REPOSITORY_NAME.test(sourceRepository)) {
    errors.push('sourceRepository must be in owner/name form');
  }
  if (!EXACT_COMMIT_SHA.test(sourceCommitSha)) {
    errors.push('sourceCommitSha must be an exact 40-character commit SHA');
  }
  if (proofLinks.length === 0) errors.push('at least one clickable proof link is required');
  for (const proof of proofLinks) {
    if (!proof.label) errors.push('every proof link requires a label');
    if (!validHttpsUrl(proof.url)) errors.push('every proof link must be a valid HTTPS URL');
  }
  if (proofUrls.length > 0 && !proofUrls.some((url) => text.includes(url))) {
    errors.push('text must contain at least one supplied clickable proof URL');
  }
  if (SECRETISH_PATTERN.test(text)) {
    errors.push('text must not contain credential-like or secret-like material');
  }
  if (PROMPT_LEAK_PATTERNS.some((pattern) => pattern.test(text))) {
    errors.push('text resembles instructions, a prompt, or unresolved automation input');
  }
  if (characterLimit === null) {
    errors.push(`platformCharacterLimit is required for ${input.platform}`);
  } else if (text.length > characterLimit) {
    errors.push(`text exceeds the configured ${input.platform} limit of ${characterLimit} characters`);
  }
  if (capability.requiresMedia && media.length === 0) {
    errors.push(`${input.platform} requires at least one media asset`);
  }
  for (const asset of media) {
    if (!validHttpsUrl(asset.url)) errors.push('every media asset must use a valid HTTPS URL');
  }
  if ((input.mode === 'queue' || input.mode === 'publish') && !input.publishAllowed) {
    errors.push('queue or publish mode requires publishAllowed=true');
  }
  if ((input.mode === 'queue' || input.mode === 'publish') && !founderApprovalId) {
    errors.push('queue or publish mode requires founderApprovalId');
  }
  if (input.mode === 'publish' && capability.adapterReadiness === 'provider-review-required') {
    errors.push(`${input.platform} remains blocked until provider review is verified`);
  }

  if (errors.length > 0 || characterLimit === null) {
    throw new FirstPartySocialPublisherError(errors);
  }

  const normalized = {
    platform: input.platform,
    accountId,
    contentField,
    text,
    traction,
    governanceAdvantage,
    audienceValue,
    investorSignal,
    proofLinks,
    sourceRepository,
    sourceCommitSha,
    mode: input.mode,
    founderApprovalId,
    media,
    characterLimit,
  };
  const contentHash = stableHash(normalized);
  const idempotencyKey = stableHash({
    platform: input.platform,
    accountId,
    sourceRepository,
    sourceCommitSha,
    contentHash,
  });

  return {
    ...normalized,
    proofUrls,
    contentHash,
    idempotencyKey,
    capability,
  };
}

function validReceipt(receipt: FirstPartyPublicationReceipt): boolean {
  return (
    trimmed(receipt.externalPostId).length > 0 &&
    validHttpsUrl(trimmed(receipt.permalink)) &&
    Number.isFinite(Date.parse(receipt.publishedAt))
  );
}

export async function executeFirstPartyPublication(
  prepared: PreparedFirstPartyPublication,
  adapters: FirstPartyAdapterRegistry,
): Promise<FirstPartyPublicationReceipt> {
  if (prepared.mode !== 'publish') {
    throw new FirstPartySocialPublisherError(['only publish mode may execute a platform adapter']);
  }
  const adapter = adapters[prepared.platform];
  if (!adapter || adapter.platform !== prepared.platform) {
    throw new FirstPartySocialPublisherError([
      `no first-party adapter is registered for ${prepared.platform}`,
    ]);
  }

  const receipt = await adapter.publish(prepared);
  const errors: string[] = [];
  if (receipt.platform !== prepared.platform) errors.push('receipt platform does not match request');
  if (receipt.contentHash !== prepared.contentHash) errors.push('receipt contentHash does not match');
  if (receipt.sourceCommitSha.toLowerCase() !== prepared.sourceCommitSha) {
    errors.push('receipt sourceCommitSha does not match');
  }
  if (JSON.stringify(receipt.proofUrls) !== JSON.stringify(prepared.proofUrls)) {
    errors.push('receipt proof URLs do not match');
  }
  if (!validReceipt(receipt)) errors.push('receipt is missing a valid post ID, permalink, or timestamp');
  if (errors.length > 0) throw new FirstPartySocialPublisherError(errors);

  return receipt;
}
