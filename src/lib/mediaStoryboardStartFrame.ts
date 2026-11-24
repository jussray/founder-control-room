import {
  mediaFingerprint,
  type AssetRegistryEntryV1,
  type MediaRouterDomainContextV1,
  type MediaRoutingRequestV1,
} from './mediaRouter.js';

export const MEDIA_STORYBOARD_START_FRAME_CONTRACT = 'fcr/media-storyboard-start-frame@v1' as const;

export interface StoryboardStartFrameBindingV1 {
  contract: typeof MEDIA_STORYBOARD_START_FRAME_CONTRACT;
  sceneId: string;
  shotId: string;
  sourceRecordId: string;
  approvedAt: string;
  openingFrameAssetId: string;
  endFrameAssetId?: string;
  characterReferenceAssetIds: string[];
  environmentReferenceAssetIds: string[];
  productReferenceAssetIds: string[];
  styleReferenceAssetIds: string[];
  continuityReferenceAssetIds: string[];
}

export interface PreparedStoryboardVideoRoutingV1 {
  request: MediaRoutingRequestV1;
  context: MediaRouterDomainContextV1;
  storyboardFingerprint: string;
  continuityCookie: string;
  referenceAssetIds: string[];
  referenceRoles: {
    openingFrameAssetId: string;
    endFrameAssetId: string | null;
    characterReferenceAssetIds: string[];
    environmentReferenceAssetIds: string[];
    productReferenceAssetIds: string[];
    styleReferenceAssetIds: string[];
    continuityReferenceAssetIds: string[];
  };
}

export type StoryboardStartFrameErrorCodeV1 =
  | 'NOT_VIDEO_REQUEST'
  | 'OPENING_FRAME_REQUIRED'
  | 'OPENING_FRAME_NOT_FOUND'
  | 'OPENING_FRAME_NOT_IMAGE'
  | 'OPENING_FRAME_NOT_USABLE'
  | 'END_FRAME_NOT_IMAGE'
  | 'REFERENCE_NOT_FOUND'
  | 'REFERENCE_NOT_USABLE'
  | 'SOURCE_RECORD_REQUIRED'
  | 'INVALID_APPROVAL_TIMESTAMP';

export interface StoryboardStartFrameErrorV1 {
  code: StoryboardStartFrameErrorCodeV1;
  assetId?: string;
  message: string;
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

export function storyboardReferenceAssetIds(binding: StoryboardStartFrameBindingV1): string[] {
  return dedupe([
    binding.openingFrameAssetId,
    binding.endFrameAssetId ?? '',
    ...binding.characterReferenceAssetIds,
    ...binding.environmentReferenceAssetIds,
    ...binding.productReferenceAssetIds,
    ...binding.styleReferenceAssetIds,
    ...binding.continuityReferenceAssetIds,
  ]);
}

function assetUsableForRequest(asset: AssetRegistryEntryV1, request: MediaRoutingRequestV1): boolean {
  if (asset.workspaceId !== request.workspaceId) return false;
  if (asset.status === 'revoked' || asset.status === 'quarantined' || asset.status === 'archived') return false;
  if (asset.projectId === request.projectId) return true;
  return request.referencePolicy.mayReuseCrossProject
    && asset.rights.reusableAcrossProjects
    && Boolean(asset.rights.reusableAcrossProjectsAuthorityRecordId);
}

export function validateStoryboardStartFrameBinding(
  request: MediaRoutingRequestV1,
  binding: StoryboardStartFrameBindingV1,
  availableAssets: readonly AssetRegistryEntryV1[],
): StoryboardStartFrameErrorV1[] {
  const errors: StoryboardStartFrameErrorV1[] = [];
  if (request.type !== 'video') {
    errors.push({ code: 'NOT_VIDEO_REQUEST', message: 'Storyboard start-frame binding is only valid for video requests.' });
  }
  if (!nonEmpty(binding.sourceRecordId)) {
    errors.push({ code: 'SOURCE_RECORD_REQUIRED', message: 'Storyboard binding requires a source record.' });
  }
  if (!Number.isFinite(Date.parse(binding.approvedAt))) {
    errors.push({ code: 'INVALID_APPROVAL_TIMESTAMP', message: 'Storyboard binding requires a valid approval timestamp.' });
  }
  if (!nonEmpty(binding.openingFrameAssetId)) {
    errors.push({ code: 'OPENING_FRAME_REQUIRED', message: 'A canonical opening-frame asset is required.' });
    return errors;
  }

  const byId = new Map(availableAssets.map((asset) => [asset.assetId, asset]));
  const opening = byId.get(binding.openingFrameAssetId);
  if (!opening) {
    errors.push({
      code: 'OPENING_FRAME_NOT_FOUND',
      assetId: binding.openingFrameAssetId,
      message: `Opening-frame asset ${binding.openingFrameAssetId} is not registered.`,
    });
  } else {
    if (opening.kind !== 'image') {
      errors.push({
        code: 'OPENING_FRAME_NOT_IMAGE',
        assetId: opening.assetId,
        message: `Opening-frame asset ${opening.assetId} must be an image.`,
      });
    }
    if (!assetUsableForRequest(opening, request)) {
      errors.push({
        code: 'OPENING_FRAME_NOT_USABLE',
        assetId: opening.assetId,
        message: `Opening-frame asset ${opening.assetId} is not usable in this workspace/project boundary.`,
      });
    }
  }

  for (const assetId of storyboardReferenceAssetIds(binding).filter((id) => id !== binding.openingFrameAssetId)) {
    const asset = byId.get(assetId);
    if (!asset) {
      errors.push({ code: 'REFERENCE_NOT_FOUND', assetId, message: `Storyboard reference ${assetId} is not registered.` });
      continue;
    }
    if (assetId === binding.endFrameAssetId && asset.kind !== 'image') {
      errors.push({
        code: 'END_FRAME_NOT_IMAGE',
        assetId,
        message: `End-frame asset ${assetId} must be an image.`,
      });
    }
    if (!assetUsableForRequest(asset, request)) {
      errors.push({
        code: 'REFERENCE_NOT_USABLE',
        assetId,
        message: `Storyboard reference ${assetId} is not usable in this workspace/project boundary.`,
      });
    }
  }

  return errors;
}

export function prepareStoryboardVideoRouting(input: {
  request: MediaRoutingRequestV1;
  context: MediaRouterDomainContextV1;
  binding: StoryboardStartFrameBindingV1;
  availableAssets: readonly AssetRegistryEntryV1[];
}): PreparedStoryboardVideoRoutingV1 {
  const errors = validateStoryboardStartFrameBinding(input.request, input.binding, input.availableAssets);
  if (errors.length > 0) {
    throw new Error(errors.map((error) => `${error.code}:${error.message}`).join('; '));
  }

  const storyboardReferences = storyboardReferenceAssetIds(input.binding);
  const referenceAssetIds = dedupe([...storyboardReferences, ...input.request.referenceAssetIds]);
  const availableById = new Map(input.availableAssets.map((asset) => [asset.assetId, asset]));
  for (const assetId of referenceAssetIds) {
    const asset = availableById.get(assetId);
    if (!asset) {
      throw new Error(`REFERENCE_NOT_FOUND:Routing reference ${assetId} is not registered.`);
    }
    if (!assetUsableForRequest(asset, input.request)) {
      throw new Error(
        `REFERENCE_NOT_USABLE:Routing reference ${assetId} is not usable in this workspace/project boundary.`,
      );
    }
  }
  const existingPolicyById = new Map(input.context.assetInputs.map((asset) => [asset.assetId, asset]));
  const missingPolicyIds = referenceAssetIds.filter((assetId) => !existingPolicyById.has(assetId));
  if (missingPolicyIds.length > 0) {
    throw new Error(
      `REFERENCE_POLICY_MISSING:Storyboard binding cannot synthesize domain reference policy for ${missingPolicyIds.join(',')}`,
    );
  }

  const request: MediaRoutingRequestV1 = {
    ...input.request,
    referenceAssetIds,
    constraints: {
      ...input.request.constraints,
      needsReferenceFidelity: true,
    },
  };

  const storyboardFingerprint = mediaFingerprint({
    contract: input.binding.contract,
    sceneId: input.binding.sceneId,
    shotId: input.binding.shotId,
    sourceRecordId: input.binding.sourceRecordId,
    approvedAt: input.binding.approvedAt,
    openingFrameAssetId: input.binding.openingFrameAssetId,
    endFrameAssetId: input.binding.endFrameAssetId ?? null,
    referenceRoles: {
      openingFrameAssetId: input.binding.openingFrameAssetId,
      endFrameAssetId: input.binding.endFrameAssetId ?? null,
      characterReferenceAssetIds: input.binding.characterReferenceAssetIds,
      environmentReferenceAssetIds: input.binding.environmentReferenceAssetIds,
      productReferenceAssetIds: input.binding.productReferenceAssetIds,
      styleReferenceAssetIds: input.binding.styleReferenceAssetIds,
      continuityReferenceAssetIds: input.binding.continuityReferenceAssetIds,
    },
  });

  return {
    request,
    context: input.context,
    storyboardFingerprint,
    continuityCookie: `storyboard:${input.binding.sceneId}:${input.binding.shotId}:${storyboardFingerprint.slice(0, 24)}`,
    referenceAssetIds,
    referenceRoles: {
      openingFrameAssetId: input.binding.openingFrameAssetId,
      endFrameAssetId: input.binding.endFrameAssetId ?? null,
      characterReferenceAssetIds: [...input.binding.characterReferenceAssetIds],
      environmentReferenceAssetIds: [...input.binding.environmentReferenceAssetIds],
      productReferenceAssetIds: [...input.binding.productReferenceAssetIds],
      styleReferenceAssetIds: [...input.binding.styleReferenceAssetIds],
      continuityReferenceAssetIds: [...input.binding.continuityReferenceAssetIds],
    },
  };
}
