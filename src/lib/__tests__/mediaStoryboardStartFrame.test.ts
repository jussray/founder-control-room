import { describe, expect, it } from 'vitest';

import {
  MEDIA_ATTACK_FLOW_IDS,
  evaluateMediaRoute,
  snapshotAllowance,
  snapshotBudget,
  type AssetRegistryEntryV1,
  type MediaAttackFlowBundleV1,
  type MediaRouterDomainContextV1,
  type MediaRoutingRequestV1,
  type ProviderCatalogV1,
} from '../mediaRouter.js';
import {
  MEDIA_STORYBOARD_START_FRAME_CONTRACT,
  prepareStoryboardVideoRouting,
  validateStoryboardStartFrameBinding,
  type StoryboardStartFrameBindingV1,
} from '../mediaStoryboardStartFrame.js';

const at = '2026-10-03T08:30:00.000Z';

function request(overrides: Partial<MediaRoutingRequestV1> = {}): MediaRoutingRequestV1 {
  return {
    requestId: 'video-request-1',
    correlationId: 'corr-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    requestedBy: 'founder-1',
    type: 'video',
    intent: 'generate',
    goal: 'production',
    prompt: 'Animate the approved storyboard opening frame without changing its initial visual state.',
    referenceAssetIds: [],
    referencePolicy: {
      maySendToExternalProvider: true,
      mayStoreInLibrary: true,
      mayReuseCrossProject: false,
    },
    output: { aspectRatio: '9:16', durationSeconds: 8, fps: 24 },
    constraints: { needsIdentityConsistency: true },
    budget: {
      mode: 'cheap',
      maxCostUsd: 1,
      allowWrapper: false,
      requireDirectProviderWhenAvailable: true,
    },
    authority: { action: 'media.generate' },
    ...overrides,
  };
}

function context(overrides: Partial<MediaRouterDomainContextV1> = {}): MediaRouterDomainContextV1 {
  return {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    intendedUse: 'storyboard',
    releaseContext: { approvalRequiredBeforePublication: true },
    assetInputs: [],
    authorityGrants: [],
    ...overrides,
  };
}

function referencePolicies(...assetIds: string[]): MediaRouterDomainContextV1['assetInputs'] {
  return assetIds.map((assetId) => ({ assetId, role: 'reference' as const, maySendToExternalProvider: true }));
}

function imageAsset(assetId = 'opening-frame-1', overrides: Partial<AssetRegistryEntryV1> = {}): AssetRegistryEntryV1 {
  return {
    assetId,
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    kind: 'image',
    status: 'candidate',
    mediaExecutionReceiptId: `receipt-${assetId}`,
    parentAssetIds: [],
    promptFingerprint: `prompt-${assetId}`,
    referenceAssetIds: [],
    tags: assetId === 'character-ref-1' ? ['identity_reference'] : [],
    lanes: ['storyboard'],
    rights: {
      commercialUseStatus: 'unknown',
      reusableAcrossProjects: false,
      reusableAcrossProjectsAuthorityRecordId: null,
      domainAuthorityGranted: false,
      domainAuthorityRecordId: null,
    },
    outcome: { shipped: false, published: false, conversionEvidenceIds: [] },
    createdAt: at,
    ...overrides,
  };
}

function binding(overrides: Partial<StoryboardStartFrameBindingV1> = {}): StoryboardStartFrameBindingV1 {
  return {
    contract: MEDIA_STORYBOARD_START_FRAME_CONTRACT,
    sceneId: 'scene-01',
    shotId: 'shot-01',
    sourceRecordId: 'makevideo-storyboard-1',
    approvedAt: at,
    openingFrameAssetId: 'opening-frame-1',
    characterReferenceAssetIds: ['character-ref-1'],
    environmentReferenceAssetIds: [],
    productReferenceAssetIds: [],
    styleReferenceAssetIds: [],
    continuityReferenceAssetIds: [],
    ...overrides,
  };
}

function passingAttackFlow(): MediaAttackFlowBundleV1 {
  return {
    version: 'media-attack-flow-v1',
    records: MEDIA_ATTACK_FLOW_IDS.map((flow, index) => ({
      flow,
      verdict: 'pass',
      sourceRecordIds: [`proof-${index}`],
      assertedAt: at,
      rationale: `${flow} passed for the bounded storyboard route`,
    })),
  };
}

const imageToVideoCatalog: ProviderCatalogV1 = {
  version: 'catalog-storyboard-1',
  observedAt: at,
  offers: [
    {
      providerId: 'renderer-direct',
      modelId: 'image-to-video-test',
      kind: 'direct',
      capability: ['video.image_to_video', 'video.reference_consistency'],
      availability: 'enabled',
      pricingObservedAt: at,
      costModel: { unit: 'second', estimatedUsdPerUnit: 0.05 },
      freeAllowance: { source: 'unknown' },
      constraints: {
        maxDurationSeconds: 10,
        aspectRatios: ['9:16'],
        supportsReferences: true,
        supportsCommercialUse: true,
        qualityRank: 4,
        speedRank: 3,
      },
    },
  ],
};

describe('media storyboard start-frame contract', () => {
  it('requires a registered usable image as the canonical opening frame', () => {
    const req = request();
    const missing = validateStoryboardStartFrameBinding(req, binding(), []);
    expect(missing.map((error) => error.code)).toContain('OPENING_FRAME_NOT_FOUND');

    const wrongKind = validateStoryboardStartFrameBinding(
      req,
      binding(),
      [imageAsset('opening-frame-1', { kind: 'video' }), imageAsset('character-ref-1')],
    );
    expect(wrongKind.map((error) => error.code)).toContain('OPENING_FRAME_NOT_IMAGE');
  });

  it('never synthesizes domain reference policy from request-level permission', () => {
    expect(() => prepareStoryboardVideoRouting({
      request: request(),
      context: context(),
      binding: binding(),
      availableAssets: [imageAsset('opening-frame-1'), imageAsset('character-ref-1')],
    })).toThrow(/REFERENCE_POLICY_MISSING/);
  });

  it('binds the approved opening frame first, preserves domain reference policy, and fingerprints continuity', () => {
    const prepared = prepareStoryboardVideoRouting({
      request: request({ referenceAssetIds: ['legacy-reference-1'] }),
      context: context({
        assetInputs: referencePolicies('legacy-reference-1', 'opening-frame-1', 'character-ref-1'),
      }),
      binding: binding(),
      availableAssets: [
        imageAsset('opening-frame-1'),
        imageAsset('character-ref-1'),
        imageAsset('legacy-reference-1'),
      ],
    });

    expect(prepared.request.referenceAssetIds).toEqual([
      'opening-frame-1',
      'character-ref-1',
      'legacy-reference-1',
    ]);
    expect(prepared.request.constraints.needsReferenceFidelity).toBe(true);
    expect(prepared.context.assetInputs.map((asset) => asset.assetId)).toEqual([
      'legacy-reference-1',
      'opening-frame-1',
      'character-ref-1',
    ]);
    expect(prepared.storyboardFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.continuityCookie).toMatch(/^storyboard:scene-01:shot-01:[a-f0-9]{24}$/);
  });

  it('turns a storyboard-bound video into the existing image-to-video route', () => {
    const assets = [imageAsset('opening-frame-1'), imageAsset('character-ref-1')];
    const prepared = prepareStoryboardVideoRouting({
      request: request(),
      context: context({ assetInputs: referencePolicies('opening-frame-1', 'character-ref-1') }),
      binding: binding(),
      availableAssets: assets,
    });

    const result = evaluateMediaRoute({
      request: prepared.request,
      context: prepared.context,
      attackFlow: passingAttackFlow(),
      catalog: imageToVideoCatalog,
      allowance: snapshotAllowance({ entries: [] }),
      budget: snapshotBudget({
        dailyCapUsd: 10,
        monthlyCapUsd: 100,
        spentTodayUsd: 0,
        spentThisMonthUsd: 0,
        activeReservationsUsd: 0,
      }),
      availableAssets: assets,
    });

    expect(result.outcome).toMatchObject({
      kind: 'DIRECT_PROVIDER',
      providerId: 'renderer-direct',
      modelId: 'image-to-video-test',
    });
    expect(result.decisionFactors.referenceFit).toBe(1);
  });

  it('changes the storyboard fingerprint when the canonical opening frame changes', () => {
    const baseAssets = [
      imageAsset('opening-frame-1'),
      imageAsset('opening-frame-2'),
      imageAsset('character-ref-1'),
    ];
    const ctx = context({ assetInputs: referencePolicies('opening-frame-1', 'opening-frame-2', 'character-ref-1') });
    const first = prepareStoryboardVideoRouting({
      request: request(),
      context: ctx,
      binding: binding({ openingFrameAssetId: 'opening-frame-1' }),
      availableAssets: baseAssets,
    });
    const second = prepareStoryboardVideoRouting({
      request: request(),
      context: ctx,
      binding: binding({ openingFrameAssetId: 'opening-frame-2' }),
      availableAssets: baseAssets,
    });

    expect(first.storyboardFingerprint).not.toBe(second.storyboardFingerprint);
    expect(first.continuityCookie).not.toBe(second.continuityCookie);
  });

  it('fails closed when a pre-existing request reference is unregistered or revoked', () => {
    const ctx = context({
      assetInputs: referencePolicies('opening-frame-1', 'character-ref-1', 'legacy-reference-1'),
    });
    const base = {
      request: request({ referenceAssetIds: ['legacy-reference-1'] }),
      context: ctx,
      binding: binding(),
    };

    expect(() => prepareStoryboardVideoRouting({
      ...base,
      availableAssets: [imageAsset('opening-frame-1'), imageAsset('character-ref-1')],
    })).toThrow(/REFERENCE_NOT_FOUND/);

    expect(() => prepareStoryboardVideoRouting({
      ...base,
      availableAssets: [
        imageAsset('opening-frame-1'),
        imageAsset('character-ref-1'),
        imageAsset('legacy-reference-1', { status: 'revoked' }),
      ],
    })).toThrow(/REFERENCE_NOT_USABLE/);
  });

  it('requires both request permission and asset authority for cross-project reuse', () => {
    const sharedReference = imageAsset('character-ref-1', {
      projectId: 'project-2',
      rights: {
        commercialUseStatus: 'unknown',
        reusableAcrossProjects: true,
        reusableAcrossProjectsAuthorityRecordId: 'reuse-authority-1',
        domainAuthorityGranted: false,
        domainAuthorityRecordId: null,
      },
    });
    const assets = [imageAsset('opening-frame-1'), sharedReference];
    const denied = validateStoryboardStartFrameBinding(request(), binding(), assets);
    expect(denied.map((error) => error.code)).toContain('REFERENCE_NOT_USABLE');

    const prepared = prepareStoryboardVideoRouting({
      request: request({
        referencePolicy: {
          maySendToExternalProvider: true,
          mayStoreInLibrary: true,
          mayReuseCrossProject: true,
        },
      }),
      context: context({ assetInputs: referencePolicies('opening-frame-1', 'character-ref-1') }),
      binding: binding(),
      availableAssets: assets,
    });
    expect(prepared.referenceAssetIds).toContain('character-ref-1');
  });

  it('requires an image when an end-frame asset is supplied', () => {
    const errors = validateStoryboardStartFrameBinding(
      request(),
      binding({ endFrameAssetId: 'end-frame-1' }),
      [
        imageAsset('opening-frame-1'),
        imageAsset('character-ref-1'),
        imageAsset('end-frame-1', { kind: 'video' }),
      ],
    );
    expect(errors.map((error) => error.code)).toContain('END_FRAME_NOT_IMAGE');
  });

  it('binds semantic reference roles into continuity identity and output', () => {
    const assets = [imageAsset('opening-frame-1'), imageAsset('shared-reference-1')];
    const ctx = context({ assetInputs: referencePolicies('opening-frame-1', 'shared-reference-1') });
    const character = prepareStoryboardVideoRouting({
      request: request(),
      context: ctx,
      binding: binding({
        characterReferenceAssetIds: ['shared-reference-1'],
        styleReferenceAssetIds: [],
      }),
      availableAssets: assets,
    });
    const style = prepareStoryboardVideoRouting({
      request: request(),
      context: ctx,
      binding: binding({
        characterReferenceAssetIds: [],
        styleReferenceAssetIds: ['shared-reference-1'],
      }),
      availableAssets: assets,
    });

    expect(character.referenceAssetIds).toEqual(style.referenceAssetIds);
    expect(character.storyboardFingerprint).not.toBe(style.storyboardFingerprint);
    expect(character.referenceRoles.characterReferenceAssetIds).toEqual(['shared-reference-1']);
    expect(style.referenceRoles.styleReferenceAssetIds).toEqual(['shared-reference-1']);
  });

  it('revalidates a prepared reference against current registry state before provider routing', () => {
    const assets = [imageAsset('opening-frame-1'), imageAsset('character-ref-1')];
    const prepared = prepareStoryboardVideoRouting({
      request: request(),
      context: context({ assetInputs: referencePolicies('opening-frame-1', 'character-ref-1') }),
      binding: binding(),
      availableAssets: assets,
    });

    const result = evaluateMediaRoute({
      request: prepared.request,
      context: prepared.context,
      attackFlow: passingAttackFlow(),
      catalog: imageToVideoCatalog,
      allowance: snapshotAllowance({ entries: [] }),
      budget: snapshotBudget({
        dailyCapUsd: 10,
        monthlyCapUsd: 100,
        spentTodayUsd: 0,
        spentThisMonthUsd: 0,
        activeReservationsUsd: 0,
      }),
      availableAssets: [
        imageAsset('opening-frame-1', { status: 'revoked' }),
        imageAsset('character-ref-1'),
      ],
    });

    expect(result.outcome).toMatchObject({
      kind: 'BLOCKED',
      reason: 'REFERENCE_NOT_APPROVED',
    });
  });

});
