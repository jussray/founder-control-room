import { createHash } from 'node:crypto';

import type {
  DomainAuthorityGrantV1,
  DomainMediaContextV1,
  MediaIntentV1,
} from './mediaRouterDomainProtocol.js';

export const MEDIA_ROUTER_POLICY_VERSION = 'fcr/media-routing@v1' as const;

export const MEDIA_ATTACK_FLOW_IDS = [
  'production_council',
  'founder_value_garyvee',
  'lindy',
  'redteam_pre',
  'l99',
  'redteam_post',
  'ooda',
  'goalfix',
  'attack10',
  'attack20',
  'attack3000',
  'attack6000',
  'truthmode',
  'confess',
  'proof',
] as const;

export type MediaAttackFlowId = (typeof MEDIA_ATTACK_FLOW_IDS)[number];
export type MediaTypeV1 = 'image' | 'video' | 'audio' | 'post' | 'mixed';
export type MediaGoalV1 = 'draft' | 'proof' | 'production' | 'final';
export type BudgetModeV1 = 'free' | 'cheap' | 'balanced' | 'premium';
export type IntendedUseV1 =
  | 'internal_draft'
  | 'storyboard'
  | 'proof_of_concept'
  | 'production_asset'
  | 'release_candidate'
  | 'published_release';

export interface MediaRoutingRequestV1 {
  requestId: string;
  correlationId: string;
  workspaceId: string;
  projectId: string;
  requestedBy: string;
  type: MediaTypeV1;
  intent: MediaIntentV1;
  goal: MediaGoalV1;
  prompt: string;
  negativePrompt?: string;
  referenceAssetIds: string[];
  referencePolicy: {
    maySendToExternalProvider: boolean;
    mayStoreInLibrary: boolean;
    mayReuseCrossProject: boolean;
  };
  output: {
    aspectRatio?: '1:1' | '4:5' | '9:16' | '16:9' | 'custom';
    width?: number;
    height?: number;
    durationSeconds?: number;
    fps?: number;
    audioRequired?: boolean;
    captionsRequired?: boolean;
  };
  constraints: {
    needsTextAccuracy?: boolean;
    needsIdentityConsistency?: boolean;
    needsReferenceFidelity?: boolean;
    needsBrandConsistency?: boolean;
    needsCommercialUse?: boolean;
    needsFastTurnaround?: boolean;
  };
  budget: {
    mode: BudgetModeV1;
    maxCostUsd: number;
    allowWrapper: boolean;
    requireDirectProviderWhenAvailable: boolean;
  };
  authority: {
    action: 'media.generate' | 'media.publish';
    approvalReceiptId?: string;
  };
}

export interface MediaRouterDomainContextV1 {
  projectId: string;
  workspaceId: string;
  intendedUse: IntendedUseV1;
  releaseContext: {
    releaseId?: string;
    releaseReceiptId?: string;
    approvalRequiredBeforePublication: boolean;
  };
  assetInputs: Array<{
    assetId: string;
    role: 'reference' | 'source_footage' | 'brand_asset' | 'evidence_asset' | 'identity_reference';
    maySendToExternalProvider: boolean;
    domainApprovalSourceRecordId?: string;
  }>;
  authorityGrants: DomainAuthorityGrantV1[];
}

export function normalizeFcrDomainContext(context: DomainMediaContextV1): MediaRouterDomainContextV1 {
  return {
    projectId: context.projectId,
    workspaceId: context.workspaceId,
    intendedUse: context.releaseState === 'published_release' ? 'published_release' : 'internal_draft',
    releaseContext: {
      releaseReceiptId: context.releaseReceiptId,
      approvalRequiredBeforePublication: true,
    },
    assetInputs: context.identityReferenceAssetIds.map((assetId) => ({
      assetId,
      role: 'identity_reference' as const,
      maySendToExternalProvider: false,
    })),
    authorityGrants: context.authorityGrants,
  };
}

export interface MediaAttackFlowRecordV1 {
  flow: MediaAttackFlowId;
  verdict: 'pass' | 'block';
  sourceRecordIds: string[];
  assertedAt: string;
  rationale: string;
}

export interface MediaAttackFlowBundleV1 {
  version: 'media-attack-flow-v1';
  records: MediaAttackFlowRecordV1[];
}

export type MediaCapability =
  | 'image.generate'
  | 'image.edit'
  | 'image.text_accuracy'
  | 'image.reference_consistency'
  | 'video.text_to_video'
  | 'video.image_to_video'
  | 'video.reference_consistency'
  | 'video.audio_native'
  | 'audio.narration'
  | 'audio.music'
  | 'post.caption'
  | 'post.compose'
  | 'post.transcode'
  | 'post.motion_from_still';

export interface ProviderOfferV1 {
  providerId: string;
  modelId: string;
  kind: 'direct' | 'wrapper';
  capability: MediaCapability[];
  availability: 'enabled' | 'disabled' | 'unknown';
  pricingObservedAt: string;
  costModel: {
    unit: 'request' | 'second' | 'token' | 'credit';
    estimatedUsdPerUnit?: number;
  };
  freeAllowance: {
    knownBalance?: number;
    expiresAt?: string;
    source: 'api' | 'manual' | 'unknown';
  };
  constraints: {
    maxDurationSeconds?: number;
    aspectRatios?: string[];
    supportsReferences: boolean;
    supportsExactText?: boolean;
    supportsCommercialUse?: boolean | 'unknown';
    qualityRank?: number;
    speedRank?: number;
  };
}

export interface ProviderCatalogV1 {
  version: string;
  observedAt: string;
  offers: ProviderOfferV1[];
}

export interface AllowanceSnapshotV1 {
  snapshotHash: string;
  entries: Array<{
    providerId: string;
    modelId: string;
    balance: number;
    source: 'api' | 'manual' | 'unknown';
  }>;
}

export interface BudgetSnapshotV1 {
  snapshotHash: string;
  dailyCapUsd: number;
  monthlyCapUsd: number;
  spentTodayUsd: number;
  spentThisMonthUsd: number;
  activeReservationsUsd: number;
}

export type AssetStatusV1 = 'revision' | 'candidate' | 'promoted' | 'quarantined' | 'archived' | 'revoked';

export interface AssetRegistryEntryV1 {
  assetId: string;
  workspaceId: string;
  projectId: string;
  kind: 'image' | 'video' | 'audio' | 'composition';
  status: AssetStatusV1;
  mediaExecutionReceiptId: string;
  parentAssetIds: string[];
  promptFingerprint: string;
  referenceAssetIds: string[];
  tags: string[];
  lanes: string[];
  rights: {
    commercialUseStatus: 'allowed' | 'unknown' | 'restricted';
    reusableAcrossProjects: boolean;
    reusableAcrossProjectsAuthorityRecordId: string | null;
    domainAuthorityGranted: boolean;
    domainAuthorityRecordId: string | null;
  };
  outcome: {
    shipped: boolean;
    published: boolean;
    conversionEvidenceIds: string[];
  };
  createdAt: string;
}

export type BlockedReasonV1 =
  | 'POST_INPUTS_MISSING'
  | 'NO_ELIGIBLE_FREE_ROUTE'
  | 'OVER_BUDGET'
  | 'UNKNOWN_COST'
  | 'NO_PROVIDER_CAPABILITY'
  | 'REFERENCE_NOT_APPROVED'
  | 'COMMERCIAL_RIGHTS_UNCLEAR'
  | 'DOMAIN_APPROVAL_MISSING'
  | 'PROVIDER_UNAVAILABLE'
  | 'WRAPPER_NOT_JUSTIFIED'
  | 'POLICY_DENIED';

export type MediaRouteOutcomeV1 =
  | { kind: 'DETERMINISTIC_POST'; tool: 'ffmpeg' | 'remotion' | 'html_render'; requiredInputAssetIds: string[] }
  | { kind: 'DIRECT_PROVIDER'; providerId: string; modelId: string; providerOfferFingerprint: string }
  | { kind: 'WRAPPER'; providerId: string; uniqueValueRecordId: string; providerOfferFingerprint: string }
  | { kind: 'INTERACTIVE_HUMAN'; suggestedSurface: string; reason: string }
  | { kind: 'BLOCKED'; reason: BlockedReasonV1; safeMessage: string };

export interface MediaRouteRecommendationV1 {
  recommendationId: string;
  requestId: string;
  correlationId: string;
  outcome: MediaRouteOutcomeV1;
  trace: Array<{ gate: string; result: 'pass' | 'skip' | 'block' | 'select'; detail?: string }>;
  estimatedCost: {
    generativeProviderUsd: number;
    deterministicComputeUsd: number;
    storageAndEgressUsd: number;
    totalUsd: number;
  };
  estimatedDurationSeconds: number | null;
  decisionFactors: {
    freeAllowanceUsed: boolean;
    draftOrFinalFit: number;
    referenceFit: number;
    textAccuracyFit: number;
    qualityFit: number;
    speedFit: number;
    directRoutePreferred: boolean;
  };
  policyVersion: typeof MEDIA_ROUTER_POLICY_VERSION;
  providerCatalogVersion: string;
  fingerprint: string;
}

function normalizeCanonical(value: unknown): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON rejects non-finite numbers');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalizeCanonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeCanonical(child)]),
    );
  }
  throw new TypeError(`canonical JSON does not support ${typeof value}`);
}

export function canonicalMediaJson(value: unknown): string {
  return JSON.stringify(normalizeCanonical(value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function mediaFingerprint(value: unknown): string {
  return sha256(canonicalMediaJson(value));
}

export function providerOfferFingerprint(offer: ProviderOfferV1): string {
  return mediaFingerprint(offer);
}

export function recommendationFingerprint(input: {
  requestSpecHash: string;
  providerCatalogVersion: string;
  allowanceSnapshotHash: string;
  budgetSnapshotHash: string;
  attackFlowSnapshotHash: string;
  routePolicyVersion: string;
}): string {
  return mediaFingerprint(input);
}

export function receiptFingerprint(input: {
  recommendationFingerprint: string;
  providerTaskId: string | null;
  outputAssetIds: string[];
  actualCostUsd: number | null;
  completedAt: string | null;
}): string {
  return mediaFingerprint(input);
}

export function validateMediaAttackFlowBundle(bundle: MediaAttackFlowBundleV1): string[] {
  const errors: string[] = [];
  if (bundle.version !== 'media-attack-flow-v1') errors.push('unsupported attack-flow bundle version');
  for (const flow of MEDIA_ATTACK_FLOW_IDS) {
    if (bundle.records.filter((record) => record.flow === flow).length !== 1) {
      errors.push(`attack flow ${flow} must appear exactly once`);
    }
  }
  for (const record of bundle.records) {
    if (!MEDIA_ATTACK_FLOW_IDS.includes(record.flow)) errors.push(`unknown attack flow ${record.flow}`);
    if (!['pass', 'block'].includes(record.verdict)) errors.push(`invalid verdict for ${record.flow}`);
    if (record.sourceRecordIds.length === 0 || record.sourceRecordIds.some((id) => !id.trim())) {
      errors.push(`attack flow ${record.flow} requires source record evidence`);
    }
    if (!Number.isFinite(Date.parse(record.assertedAt))) errors.push(`attack flow ${record.flow} requires timestamp`);
    if (!record.rationale.trim()) errors.push(`attack flow ${record.flow} requires rationale`);
  }
  return errors;
}

export function snapshotBudget(value: Omit<BudgetSnapshotV1, 'snapshotHash'>): BudgetSnapshotV1 {
  return { ...value, snapshotHash: mediaFingerprint(value) };
}

export function snapshotAllowance(value: Omit<AllowanceSnapshotV1, 'snapshotHash'>): AllowanceSnapshotV1 {
  return { ...value, snapshotHash: mediaFingerprint(value) };
}

const POST_PRODUCIBLE_INTENTS = new Set<MediaIntentV1>([
  'assemble',
  'caption',
  'resize',
  'compose',
  'transcode',
  'overlay',
]);

export function canCompleteWithPostProduction(
  request: MediaRoutingRequestV1,
  availableAssets: AssetRegistryEntryV1[],
): { ok: true } | { ok: false; reason: 'INTENT_NOT_POST_PRODUCIBLE' | 'POST_INPUTS_MISSING' | 'IDENTITY_SOURCE_MISSING' | 'REFERENCE_SOURCE_MISSING' } {
  if (!POST_PRODUCIBLE_INTENTS.has(request.intent)) return { ok: false, reason: 'INTENT_NOT_POST_PRODUCIBLE' };
  if (request.referenceAssetIds.length === 0) return { ok: false, reason: 'POST_INPUTS_MISSING' };

  const usable = availableAssets.filter((asset) =>
    asset.workspaceId === request.workspaceId
    && asset.status !== 'revoked'
    && asset.status !== 'quarantined'
    && (
      asset.projectId === request.projectId
      || (asset.rights.reusableAcrossProjects && Boolean(asset.rights.reusableAcrossProjectsAuthorityRecordId))
    ),
  );
  const byId = new Map(usable.map((asset) => [asset.assetId, asset]));
  if (request.referenceAssetIds.some((assetId) => !byId.has(assetId))) {
    return { ok: false, reason: 'POST_INPUTS_MISSING' };
  }
  const selected = request.referenceAssetIds.map((assetId) => byId.get(assetId)!);
  if (request.constraints.needsIdentityConsistency && !selected.some((asset) => asset.tags.includes('identity_reference'))) {
    return { ok: false, reason: 'IDENTITY_SOURCE_MISSING' };
  }
  if (request.constraints.needsReferenceFidelity && request.referenceAssetIds.length === 0) {
    return { ok: false, reason: 'REFERENCE_SOURCE_MISSING' };
  }
  return { ok: true };
}

export interface EvaluateMediaRouteInputV1 {
  request: MediaRoutingRequestV1;
  context: MediaRouterDomainContextV1;
  attackFlow: MediaAttackFlowBundleV1;
  catalog: ProviderCatalogV1;
  allowance: AllowanceSnapshotV1;
  budget: BudgetSnapshotV1;
  availableAssets: AssetRegistryEntryV1[];
}

export function evaluateMediaRoute(input: EvaluateMediaRouteInputV1): MediaRouteRecommendationV1 {
  const { request, context, attackFlow, catalog, allowance, budget, availableAssets } = input;
  const trace: MediaRouteRecommendationV1['trace'] = [];

  const terminal = (
    outcome: MediaRouteOutcomeV1,
    cost: Omit<MediaRouteRecommendationV1['estimatedCost'], 'totalUsd'>,
    factors: Partial<MediaRouteRecommendationV1['decisionFactors']> = {},
  ): MediaRouteRecommendationV1 => {
    const estimatedCost = { ...cost, totalUsd: cost.generativeProviderUsd + cost.deterministicComputeUsd + cost.storageAndEgressUsd };
    const fingerprint = recommendationFingerprint({
      requestSpecHash: mediaFingerprint({ request, context }),
      providerCatalogVersion: catalog.version,
      allowanceSnapshotHash: allowance.snapshotHash,
      budgetSnapshotHash: budget.snapshotHash,
      attackFlowSnapshotHash: mediaFingerprint(attackFlow),
      routePolicyVersion: MEDIA_ROUTER_POLICY_VERSION,
    });
    return {
      recommendationId: `rec_${fingerprint.slice(0, 16)}`,
      requestId: request.requestId,
      correlationId: request.correlationId,
      outcome,
      trace,
      estimatedCost,
      estimatedDurationSeconds: null,
      decisionFactors: {
        freeAllowanceUsed: false,
        draftOrFinalFit: request.goal === 'final' ? 1 : 0.5,
        referenceFit: request.referenceAssetIds.length > 0 ? 1 : 0.5,
        textAccuracyFit: request.constraints.needsTextAccuracy ? 1 : 0.5,
        qualityFit: 0.5,
        speedFit: request.constraints.needsFastTurnaround ? 1 : 0.5,
        directRoutePreferred: request.budget.requireDirectProviderWhenAvailable,
        ...factors,
      },
      policyVersion: MEDIA_ROUTER_POLICY_VERSION,
      providerCatalogVersion: catalog.version,
      fingerprint,
    };
  };

  const blocked = (reason: BlockedReasonV1, safeMessage: string): MediaRouteRecommendationV1 => {
    trace.push({ gate: 'terminal', result: 'block', detail: reason });
    return terminal(
      { kind: 'BLOCKED', reason, safeMessage },
      { generativeProviderUsd: 0, deterministicComputeUsd: 0, storageAndEgressUsd: 0 },
    );
  };

  const attackErrors = validateMediaAttackFlowBundle(attackFlow);
  if (attackErrors.length > 0) return blocked('POLICY_DENIED', attackErrors.join('; '));
  const blockedFlows = attackFlow.records.filter((record) => record.verdict === 'block');
  if (blockedFlows.length > 0) {
    return blocked('POLICY_DENIED', `Attack flow blocked execution: ${blockedFlows.map((record) => record.flow).join(', ')}`);
  }
  trace.push({ gate: 'attack_flows', result: 'pass', detail: 'all attack flows passed' });

  if (request.workspaceId !== context.workspaceId || request.projectId !== context.projectId) {
    return blocked('POLICY_DENIED', 'request/domain context identity mismatch');
  }
  if (request.authority.action === 'media.publish') {
    return blocked('POLICY_DENIED', 'Media Router cannot publish; publication is a separate domain-authorized handoff');
  }
  if (context.intendedUse === 'published_release' && !context.releaseContext.releaseReceiptId) {
    return blocked('DOMAIN_APPROVAL_MISSING', 'published_release requires a domain release receipt');
  }
  trace.push({ gate: 'domain_authority', result: 'pass' });

  const post = canCompleteWithPostProduction(request, availableAssets);
  if (post.ok) {
    trace.push({ gate: 'post_producible', result: 'select', detail: 'ffmpeg' });
    const deterministicComputeUsd = (request.output.durationSeconds ?? 30) * 1.5 * 0.0005;
    return terminal(
      { kind: 'DETERMINISTIC_POST', tool: 'ffmpeg', requiredInputAssetIds: [...request.referenceAssetIds] },
      { generativeProviderUsd: 0, deterministicComputeUsd, storageAndEgressUsd: 0.01 },
    );
  }
  trace.push({ gate: 'post_producible', result: 'skip', detail: post.reason });

  if (request.referenceAssetIds.length > 0) {
    const policyById = new Map(context.assetInputs.map((asset) => [asset.assetId, asset]));
    const missingPolicy = request.referenceAssetIds.find((assetId) => !policyById.has(assetId));
    if (missingPolicy) {
      return blocked('REFERENCE_NOT_APPROVED', `No domain reference policy exists for ${missingPolicy}`);
    }
    const denied = request.referenceAssetIds.find((assetId) => !policyById.get(assetId)!.maySendToExternalProvider);
    if (!request.referencePolicy.maySendToExternalProvider || denied) {
      return blocked('REFERENCE_NOT_APPROVED', 'One or more reference assets may not be sent to an external provider');
    }
  }
  trace.push({ gate: 'reference_policy', result: 'pass' });

  const candidates = catalog.offers.filter((offer) => offer.availability === 'enabled' && offerMatchesRequest(offer, request));
  const direct = candidates.filter((offer) => offer.kind === 'direct');
  if (direct.length === 0 && candidates.some((offer) => offer.kind === 'wrapper')) {
    return blocked('WRAPPER_NOT_JUSTIFIED', 'Only wrapper routes match; wrapper selection is deferred until unique value is evidenced');
  }
  if (direct.length === 0) return blocked('NO_PROVIDER_CAPABILITY', 'No enabled direct provider offer satisfies this request');

  const rightsEligible = request.constraints.needsCommercialUse
    ? direct.filter((offer) => offer.constraints.supportsCommercialUse === true)
    : direct;
  if (request.constraints.needsCommercialUse && rightsEligible.length === 0) {
    return blocked('COMMERCIAL_RIGHTS_UNCLEAR', 'No matching direct provider has verified commercial-use support');
  }

  if (request.budget.mode === 'free') {
    const freeOffer = rightsEligible.find((offer) => allowance.entries.some((entry) =>
      entry.providerId === offer.providerId
      && entry.modelId === offer.modelId
      && entry.source === 'api'
      && entry.balance > 0,
    ));
    if (!freeOffer) return blocked('NO_ELIGIBLE_FREE_ROUTE', 'No verified API allowance satisfies this request');
    trace.push({ gate: 'free_allowance', result: 'select', detail: `${freeOffer.providerId}/${freeOffer.modelId}` });
    return terminal(
      { kind: 'DIRECT_PROVIDER', providerId: freeOffer.providerId, modelId: freeOffer.modelId, providerOfferFingerprint: providerOfferFingerprint(freeOffer) },
      { generativeProviderUsd: 0, deterministicComputeUsd: 0, storageAndEgressUsd: 0.01 },
      { freeAllowanceUsed: true, qualityFit: freeOffer.constraints.qualityRank ?? 0.5, speedFit: freeOffer.constraints.speedRank ?? 0.5 },
    );
  }

  const costKnown = rightsEligible.filter((offer) => estimateOfferCost(offer, request) !== null);
  if (costKnown.length === 0) return blocked('UNKNOWN_COST', 'No matching direct provider has verifiable cost');

  const dailyHeadroom = Math.max(0, budget.dailyCapUsd - budget.spentTodayUsd - budget.activeReservationsUsd);
  const monthlyHeadroom = Math.max(0, budget.monthlyCapUsd - budget.spentThisMonthUsd - budget.activeReservationsUsd);
  const ceiling = Math.min(request.budget.maxCostUsd, dailyHeadroom, monthlyHeadroom);
  const underBudget = costKnown.filter((offer) => estimateOfferCost(offer, request)! <= ceiling);
  if (underBudget.length === 0) return blocked('OVER_BUDGET', `No candidate route fits available budget headroom (${ceiling.toFixed(4)} USD)`);

  const sorted = [...underBudget].sort((left, right) => {
    const leftCost = estimateOfferCost(left, request)!;
    const rightCost = estimateOfferCost(right, request)!;
    if (request.budget.mode === 'premium') {
      return (right.constraints.qualityRank ?? 0) - (left.constraints.qualityRank ?? 0) || leftCost - rightCost;
    }
    if (request.budget.mode === 'balanced') {
      const leftFit = (left.constraints.qualityRank ?? 0) + (left.constraints.speedRank ?? 0);
      const rightFit = (right.constraints.qualityRank ?? 0) + (right.constraints.speedRank ?? 0);
      return rightFit - leftFit || leftCost - rightCost;
    }
    return leftCost - rightCost || (right.constraints.qualityRank ?? 0) - (left.constraints.qualityRank ?? 0);
  });
  const chosen = sorted[0];
  trace.push({ gate: 'select', result: 'select', detail: `${chosen.providerId}/${chosen.modelId}` });
  return terminal(
    { kind: 'DIRECT_PROVIDER', providerId: chosen.providerId, modelId: chosen.modelId, providerOfferFingerprint: providerOfferFingerprint(chosen) },
    { generativeProviderUsd: estimateOfferCost(chosen, request)!, deterministicComputeUsd: 0, storageAndEgressUsd: 0.01 },
    { qualityFit: chosen.constraints.qualityRank ?? 0.5, speedFit: chosen.constraints.speedRank ?? 0.5 },
  );
}

function offerMatchesRequest(offer: ProviderOfferV1, request: MediaRoutingRequestV1): boolean {
  if (request.type === 'image') {
    const capability: MediaCapability = request.intent === 'edit' ? 'image.edit' : 'image.generate';
    if (!offer.capability.includes(capability)) return false;
    if (request.constraints.needsIdentityConsistency && !offer.capability.includes('image.reference_consistency')) return false;
  } else if (request.type === 'video') {
    const capability: MediaCapability = request.referenceAssetIds.length > 0 ? 'video.image_to_video' : 'video.text_to_video';
    if (!offer.capability.includes(capability)) return false;
    if (request.constraints.needsIdentityConsistency && !offer.capability.includes('video.reference_consistency')) return false;
  } else {
    return false;
  }
  if (request.output.durationSeconds && offer.constraints.maxDurationSeconds && request.output.durationSeconds > offer.constraints.maxDurationSeconds) return false;
  if (request.output.aspectRatio && request.output.aspectRatio !== 'custom' && offer.constraints.aspectRatios && !offer.constraints.aspectRatios.includes(request.output.aspectRatio)) return false;
  if (request.constraints.needsTextAccuracy && !(offer.constraints.supportsExactText || offer.capability.includes('image.text_accuracy'))) return false;
  if (request.referenceAssetIds.length > 0 && !offer.constraints.supportsReferences) return false;
  return true;
}

function estimateOfferCost(offer: ProviderOfferV1, request: MediaRoutingRequestV1): number | null {
  const unit = offer.costModel.estimatedUsdPerUnit;
  if (unit === undefined) return null;
  if (offer.costModel.unit === 'second') return unit * (request.output.durationSeconds ?? 1);
  return unit;
}

export type ReservationResultV1 =
  | { ok: true; reservationId: string }
  | { ok: false; reason: 'EXCEEDS_DAILY' | 'EXCEEDS_MONTHLY' | 'LEDGER_ERROR' };

export class InMemoryMediaBudgetReservationService {
  private readonly reservations = new Map<string, { requestId: string; amountUsd: number; state: 'active' | 'released' | 'committed' }>();
  private spentTodayUsd = 0;
  private spentThisMonthUsd = 0;
  private sequence = 0;

  constructor(private readonly caps: { dailyCapUsd: number; monthlyCapUsd: number }) {}

  async reserve(args: { requestId: string; amountUsd: number }): Promise<ReservationResultV1> {
    const active = [...this.reservations.values()]
      .filter((reservation) => reservation.state === 'active')
      .reduce((sum, reservation) => sum + reservation.amountUsd, 0);
    if (this.spentTodayUsd + active + args.amountUsd > this.caps.dailyCapUsd) return { ok: false, reason: 'EXCEEDS_DAILY' };
    if (this.spentThisMonthUsd + active + args.amountUsd > this.caps.monthlyCapUsd) return { ok: false, reason: 'EXCEEDS_MONTHLY' };
    const reservationId = `media_res_${++this.sequence}`;
    this.reservations.set(reservationId, { ...args, state: 'active' });
    return { ok: true, reservationId };
  }

  async release(reservationId: string): Promise<void> {
    const reservation = this.reservations.get(reservationId);
    if (reservation?.state === 'active') reservation.state = 'released';
  }

  async commit(args: { reservationId: string; actualUsd: number }): Promise<void> {
    const reservation = this.reservations.get(args.reservationId);
    if (!reservation || reservation.state !== 'active') return;
    reservation.state = 'committed';
    this.spentTodayUsd += args.actualUsd;
    this.spentThisMonthUsd += args.actualUsd;
  }
}

export class InMemoryMediaAssetRegistry {
  private readonly byId = new Map<string, AssetRegistryEntryV1>();

  async get(assetId: string): Promise<AssetRegistryEntryV1 | null> {
    return this.byId.get(assetId) ?? null;
  }

  async put(entry: AssetRegistryEntryV1): Promise<void> {
    if (this.byId.has(entry.assetId)) throw new Error(`Asset ${entry.assetId} already exists`);
    this.byId.set(entry.assetId, entry);
  }

  async updateStatus(assetId: string, status: AssetStatusV1): Promise<void> {
    const existing = this.byId.get(assetId);
    if (!existing) throw new Error(`Asset ${assetId} not found`);
    if (existing.status === 'revoked' && status !== 'revoked') throw new Error(`Asset ${assetId} is revoked and cannot be reactivated`);
    this.byId.set(assetId, { ...existing, status });
  }

  async listByProject(projectId: string): Promise<AssetRegistryEntryV1[]> {
    return [...this.byId.values()].filter((asset) => asset.projectId === projectId);
  }
}

export interface AssetRevocationV1 {
  id: string;
  assetId: string;
  revokedAt: string;
  reason: 'RIGHTS_CHANGED' | 'LIKENESS_DISPUTE' | 'PROVIDER_TERMS_CHANGED' | 'INTEGRITY_FAILURE' | 'LEGAL_HOLD' | 'OTHER';
  revokedBy: string;
  authorityRecordId: string;
  notes: string | null;
  downstreamUses: Array<{
    projectId: string;
    releaseReceiptId?: string;
    publishedAt?: string;
    actionRequired: 'NONE' | 'REVIEW' | 'TAKEDOWN';
  }>;
}

export class InMemoryMediaRevocationLedger {
  private readonly byAsset = new Map<string, AssetRevocationV1[]>();

  async append(revocation: AssetRevocationV1): Promise<void> {
    const current = this.byAsset.get(revocation.assetId) ?? [];
    if (current.some((record) => record.id === revocation.id)) return;
    this.byAsset.set(revocation.assetId, [...current, revocation]);
  }

  async listByAsset(assetId: string): Promise<AssetRevocationV1[]> {
    return [...(this.byAsset.get(assetId) ?? [])];
  }
}

export async function revokeMediaAsset(args: {
  registry: InMemoryMediaAssetRegistry;
  ledger: InMemoryMediaRevocationLedger;
  revocation: AssetRevocationV1;
}): Promise<void> {
  const asset = await args.registry.get(args.revocation.assetId);
  if (!asset) throw new Error(`Cannot revoke unknown asset ${args.revocation.assetId}`);
  await args.ledger.append(args.revocation);
  if (asset.status !== 'revoked') await args.registry.updateStatus(asset.assetId, 'revoked');
}

export interface MediaExecutionReceiptV1 {
  receiptId: string;
  correlationId: string;
  workspaceId: string;
  projectId: string;
  requestId: string;
  routeRecommendationId: string;
  status: 'VERIFIED' | 'INFERRED' | 'FAILED' | 'BLOCKED' | 'CANCELLED' | 'TRUNCATED';
  recommendationFingerprint: string;
  receiptFingerprint: string;
}

export class InMemoryMediaReceiptLedger {
  private readonly byId = new Map<string, MediaExecutionReceiptV1>();

  async append(receipt: MediaExecutionReceiptV1): Promise<void> {
    if (this.byId.has(receipt.receiptId)) throw new Error(`Receipt ${receipt.receiptId} already exists; ledger is append-only`);
    this.byId.set(receipt.receiptId, receipt);
  }

  async get(receiptId: string): Promise<MediaExecutionReceiptV1 | null> {
    return this.byId.get(receiptId) ?? null;
  }

  async listByRequest(requestId: string): Promise<MediaExecutionReceiptV1[]> {
    return [...this.byId.values()].filter((receipt) => receipt.requestId === requestId);
  }
}

export async function probeFfmpeg(): Promise<{ available: boolean; version: string | null }> {
  return { available: false, version: null };
}

export async function renderFfmpegTimeline(): Promise<
  | { kind: 'RENDERED'; outputPath: string; cpuSeconds: number }
  | { kind: 'CAPABILITY_UNAVAILABLE'; reason: string }
> {
  return { kind: 'CAPABILITY_UNAVAILABLE', reason: 'FFmpeg execution is not implemented in Phase 1' };
}

export async function renderGeminiImage(config: { apiKeyEnvVar: 'GEMINI_API_KEY'; modelId: string }): Promise<
  | { kind: 'SUCCESS'; imageBytes: Buffer; contentType: string; providerTaskId: string | null; providerCostUsd: number | null }
  | { kind: 'FAILED'; code: string; safeMessage: string; retryable: boolean }
  | { kind: 'CAPABILITY_UNAVAILABLE'; reason: string }
> {
  if (!process.env[config.apiKeyEnvVar]) return { kind: 'CAPABILITY_UNAVAILABLE', reason: `${config.apiKeyEnvVar} not set` };
  return { kind: 'CAPABILITY_UNAVAILABLE', reason: 'Gemini provider execution is not implemented in Phase 1' };
}

export async function renderSeedanceVideo(config: { apiKeyEnvVar: string; modelId: string }): Promise<
  | { kind: 'SUCCESS'; videoBytes: Buffer; contentType: string; providerTaskId: string | null; providerCostUsd: number | null }
  | { kind: 'FAILED'; code: string; safeMessage: string; retryable: boolean }
  | { kind: 'CAPABILITY_UNAVAILABLE'; reason: string }
> {
  if (!process.env[config.apiKeyEnvVar]) return { kind: 'CAPABILITY_UNAVAILABLE', reason: `${config.apiKeyEnvVar} not set` };
  return { kind: 'CAPABILITY_UNAVAILABLE', reason: 'Seedance provider execution is not implemented in Phase 1' };
}
