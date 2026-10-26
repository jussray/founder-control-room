import { createHash } from 'node:crypto';
import {
  FIRST_PARTY_PLATFORM_CAPABILITIES,
  FIRST_PARTY_SOCIAL_PLATFORMS,
  validateFirstPartySocialPost,
  type FirstPartySocialPlatform,
  type SocialMediaAsset,
} from './firstPartySocialPublisher.js';
import { planFounderSignalCampaign } from './founderSignalCampaignPlanner.js';

/**
 * An offline preview of the CURRENT first-party draft payload, never a provider
 * handoff, independent evidence verdict, approval or published artifact.
 */
export const FSE_HANDOFF_TOOL = 'review_founder_signal_draft_handoff' as const;
export const FSE_HANDOFF_CONTRACT = 'fcr/founder-signal-draft-handoff@v1' as const;
const SHA256 = /^[0-9a-f]{64}$/i;
const ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,119}$/;
type Json = Record<string, unknown>;
const record = (v: unknown): Json => v && typeof v === 'object' && !Array.isArray(v) ? v as Json : {};
const string = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const stableHash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const SEC = /(sk-[a-z0-9_-]{12,}|bearer\s+\S+|access[_-]?token|password|api[_-]?key|secret|private[_-]?key)/i;

function externalUrl(value: unknown): boolean {
  const raw = string(value);
  if (!raw || raw.length > 700 || SEC.test(raw)) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.internal') || host.endsWith('.local')) return false;
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return false;
    if (host.startsWith('[') || host.includes(':')) return false;
    return host.includes('.');
  } catch { return false; }
}

function fail(reason: string): never {
  throw new Error('FSE_HANDOFF_REJECTED: ' + reason);
}

export function reviewFounderSignalDraftHandoff(raw: unknown) {
  const input = record(raw);
  if (Object.keys(input).some(k => !['campaign', 'platform', 'accountId', 'platformCharacterLimit', 'media'].includes(k))) {
    fail('unexpected handoff property');
  }

  // Rebuild the canonical campaign from the original brief; do not trust a
  // caller-supplied "approved campaign" object or arbitrary copy.
  const campaign = planFounderSignalCampaign(input.campaign);
  const platform = string(input.platform) as FirstPartySocialPlatform;
  if (!FIRST_PARTY_SOCIAL_PLATFORMS.includes(platform)) fail('unsupported platform');
  const variant = campaign.variants.find(v => v.platform === platform);
  if (!variant) fail('platform missing from original campaign');
  const accountId = string(input.accountId);
  if (!ACCOUNT.test(accountId) || SEC.test(accountId)) fail('account identifier invalid');
  const capability = FIRST_PARTY_PLATFORM_CAPABILITIES[platform];
  const limit = input.platformCharacterLimit;
  if (limit !== undefined && (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 5000)) {
    fail('platformCharacterLimit must be an integer from 1 to 5000');
  }

  const issues: string[] = [];
  if (variant.status !== 'FOUNDER_REVIEW_ONLY' || campaign.operationalState !== 'FOUNDER_REVIEW_ONLY') {
    issues.push('HOLD_ORIGINAL_CAMPAIGN_' + variant.status);
  }
  if (capability.safeCharacterLimit === null && limit === undefined) {
    issues.push('ACCOUNT_NATIVE_CHARACTER_LIMIT_NOT_VERIFIED');
  }

  const inputMedia = input.media === undefined ? [] : input.media;
  if (!Array.isArray(inputMedia) || inputMedia.length > 4) fail('media must be an array of at most four assets');
  const desired = variant.media.kind;
  if (desired === 'text-only' && inputMedia.length > 0) issues.push('TEXT_ONLY_CAMPAIGN_HAS_MEDIA');
  if (desired !== 'text-only' && inputMedia.length === 0) issues.push('RENDERED_MEDIA_NOT_SUPPLIED');
  if (desired === 'carousel' && inputMedia.length < 2) issues.push('CAROUSEL_REQUIRES_MULTIPLE_IMAGES');
  if (desired !== 'carousel' && inputMedia.length > 1) issues.push('UNEXPECTED_MULTIPLE_MEDIA_ASSETS');

  const media: Array<SocialMediaAsset & { sha256: string; rightsReceiptUrl: string }> = [];
  inputMedia.forEach((source: unknown, index: number) => {
    const asset = record(source);
    if (Object.keys(asset).some(k => !['type', 'url', 'sha256', 'altText', 'rights', 'visualVerdict'].includes(k))) {
      fail('unexpected media property at index ' + index);
    }
    const rights = record(asset.rights);
    const verdict = record(asset.visualVerdict);
    const type = string(asset.type);
    if (!['image', 'video'].includes(type) ||
      (desired === 'video' && type !== 'video') ||
      (desired === 'carousel' && type !== 'image') ||
      (desired === 'image' && type !== 'image') ||
      desired === 'text-only') issues.push('MEDIA_TYPE_MISMATCH_' + index);
    if (!externalUrl(asset.url)) issues.push('MEDIA_URL_NOT_PUBLIC_SAFE_' + index);
    if (!SHA256.test(string(asset.sha256))) issues.push('MEDIA_SHA256_MISSING_' + index);
    if (string(asset.altText).length < 15 || string(asset.altText).length > 280 ||
      SEC.test(string(asset.altText))) issues.push('MEDIA_ALT_TEXT_REVIEW_REQUIRED_' + index);
    if (Object.keys(rights).some(k => !['basis', 'receiptUrl', 'permissionGranted'].includes(k)) ||
      !['original', 'licensed', 'owner-provided'].includes(string(rights.basis)) ||
      rights.permissionGranted !== true || !externalUrl(rights.receiptUrl)) {
      issues.push('MEDIA_RIGHTS_UNVERIFIED_' + index);
    }
    if (Object.keys(verdict).some(k => !['state', 'artifactSha256', 'contract'].includes(k)) ||
      verdict.contract !== 'juss/visual-wonder-artifact-verdict' ||
      verdict.state !== 'PASSED' || string(verdict.artifactSha256).toLowerCase() !== string(asset.sha256).toLowerCase()) {
      issues.push('MEDIA_VISUAL_VERDICT_MISSING_OR_MISMATCH_' + index);
    }
    if (!issues.some(i => i.endsWith('_' + index))) {
      media.push({
        type: type as SocialMediaAsset['type'],
        url: string(asset.url),
        altText: string(asset.altText),
        sha256: string(asset.sha256).toLowerCase(),
        rightsReceiptUrl: string(rights.receiptUrl),
      });
    }
  });

  const blocked = issues.length > 0;
  let preview: Record<string, unknown> | null = null;
  if (!blocked) {
    try {
      const prepared = validateFirstPartySocialPost({
        platform,
        accountId,
        contentField: variant.contentField,
        text: variant.copy,
        traction: 'unknown: no verified audience outcomes',
        governanceAdvantage: 'source-bound founder-reviewed draft planning',
        audienceValue: campaign.decisionLenses.fiveWOneH.why,
        investorSignal: 'unknown: no verified investor outcome',
        sourceRepository: campaign.source.repository,
        sourceCommitSha: campaign.source.commitSha,
        proofLinks: [{ label: 'Public source evidence to independently verify', url: campaign.source.proofUrl }],
        mode: 'draft',
        publishAllowed: false,
        founderApprovalId: null,
        media: media.map(({ type, url, altText }) => ({ type, url, altText })),
        platformCharacterLimit: limit as number | undefined,
      });
      preview = {
        platform: prepared.platform,
        accountId: prepared.accountId,
        mode: prepared.mode,
        contentField: prepared.contentField,
        text: prepared.text,
        media: prepared.media,
        contentHash: prepared.contentHash,
        idempotencyKey: prepared.idempotencyKey,
        sourceRepository: prepared.sourceRepository,
        sourceCommitSha: prepared.sourceCommitSha,
      };
    } catch (error) {
      issues.push('FIRST_PARTY_PUBLISHER_CONTRACT_REJECTED: ' + (error instanceof Error ? error.message : 'unknown'));
    }
  }

  return {
    contract: FSE_HANDOFF_CONTRACT,
    status: issues.length ? 'HOLD' : 'LOCAL_DRAFT_SHAPE_VALID__PROVIDER_UNVERIFIED',
    evidenceClass: 'SELF_ATTESTED_NOT_PROVIDER_VERIFIED',
    mediaRights: 'SELF_ATTESTED_NOT_PROVIDER_VERIFIED',
    sourceVerified: false,
    renderedMediaBytesChecked: false,
    visualArtifactIndependentlyInspected: false,
    founderApprovalVerified: false,
    accountOwnershipVerified: false,
    providerDeliveryObserved: false,
    handoffReady: false,
    authority: {
      canCreateLocalDraft: false,
      canCreateBufferDraft: false,
      canQueue: false,
      canSchedule: false,
      canPublish: false,
      canMutateHubSpot: false,
    },
    platform, accountId,
    issues, preview,
    handoffFingerprint: preview ? stableHash({ preview, rights: media.map(x => ({
      sha256: x.sha256, rightsReceiptUrl: x.rightsReceiptUrl,
    })), continuity: campaign.continuation.continuityFingerprint }) : null,
    nextGates: [
      'Independently authenticate public GitHub source visibility and exact SHA',
      'Independently inspect bytes, license receipts, visual-wonder verdict and brand/canon',
      'Independently verify intended social account, media support and current native character limit',
      'Freeze exact text, hashtags, media bytes and destination for a new Current You review',
      'Obtain scoped founder consent and use existing lifecycle store/Buffer draft-only firewall',
      'Capture native provider readback before claiming draft delivery',
      'Correlate HubSpot/FCR receipt; measure 24h and 48h outcomes only after genuine publication',
    ],
  };
}
