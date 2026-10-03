import { describe, expect, it } from 'vitest';

import type { MakeVideoExecutionInput } from '../makeVideoNervousSystem.js';
import {
  type AssetRegistryEntryV1,
  type MediaRouterDomainContextV1,
  type MediaRoutingRequestV1,
} from '../mediaRouter.js';
import {
  MAKEVIDEO_STORYBOARD_BRIDGE_CONTRACT,
  compileMakeVideoStoryboardBundle,
} from '../makeVideoStoryboardBridge.js';
import {
  MEDIA_STORYBOARD_START_FRAME_CONTRACT,
  type StoryboardStartFrameBindingV1,
} from '../mediaStoryboardStartFrame.js';

const at = '2026-10-03T08:30:00.000Z';

function directorInput(): MakeVideoExecutionInput {
  return {
    founderIntent: 'Animate the approved storyboard without drifting from the opening visual state.',
    viewerContract: {
      explicitFocus: ['main subject'],
      peripheralAwareness: ['environment'],
      atmosphericSignals: ['lighting'],
      hiddenElements: [],
    },
    leeVizeCanon: {
      worldId: 'world-1',
      artStyle: 'cinematic realism',
      colorPalette: ['purple', 'blue'],
      lightingProfile: {
        keyLightAngle: 45,
        shadowDensity: 0.5,
        colorTemperatureK: 4400,
      },
      shotLanguagePreferences: {
        preferredFocalLengths: [35],
        framingStances: ['MEDIUM'],
        compositionRules: ['preserve opening composition'],
      },
      characterCanons: [{
        characterId: 'subject-1',
        identityFingerprint: 'a'.repeat(64),
        wardrobeState: 'look-1',
      }],
    },
    cognitiveLoad: {
      activeConcepts: ['motion'],
      readingLoad: 0.1,
      listeningLoad: 0.1,
      visualTrackingLoad: 0.3,
      novelty: 0.4,
      overloadRisk: false,
      releaseConditionMet: false,
    },
    devilReview: {
      verdict: 'proceed',
      sourceRecordId: 'devil:makevideo:storyboard-1',
      reviewedAt: at,
      rationale: 'The approved opening frame reduces visual drift while preserving provider replaceability.',
    },
  };
}

function request(): MediaRoutingRequestV1 {
  return {
    requestId: 'video-1',
    correlationId: 'corr-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    requestedBy: 'founder-1',
    type: 'video',
    intent: 'generate',
    goal: 'production',
    prompt: 'Move from the approved opening frame while preserving character and world continuity.',
    referenceAssetIds: [],
    referencePolicy: {
      maySendToExternalProvider: true,
      mayStoreInLibrary: true,
      mayReuseCrossProject: false,
    },
    output: { aspectRatio: '16:9', durationSeconds: 6, fps: 24 },
    constraints: { needsIdentityConsistency: true },
    budget: {
      mode: 'cheap',
      maxCostUsd: 1,
      allowWrapper: false,
      requireDirectProviderWhenAvailable: true,
    },
    authority: { action: 'media.generate' },
  };
}

function context(): MediaRouterDomainContextV1 {
  return {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    intendedUse: 'storyboard',
    releaseContext: { approvalRequiredBeforePublication: true },
    assetInputs: ['opening-frame-1', 'opening-frame-2', 'character-ref-1'].map((assetId) => ({
      assetId,
      role: 'reference' as const,
      maySendToExternalProvider: true,
    })),
    authorityGrants: [],
  };
}

function binding(openingFrameAssetId = 'opening-frame-1'): StoryboardStartFrameBindingV1 {
  return {
    contract: MEDIA_STORYBOARD_START_FRAME_CONTRACT,
    sceneId: 'scene-01',
    shotId: 'shot-01',
    sourceRecordId: 'storyboard-approval-1',
    approvedAt: at,
    openingFrameAssetId,
    characterReferenceAssetIds: ['character-ref-1'],
    environmentReferenceAssetIds: [],
    productReferenceAssetIds: [],
    styleReferenceAssetIds: [],
    continuityReferenceAssetIds: [],
  };
}

function asset(assetId: string): AssetRegistryEntryV1 {
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
    tags: assetId.startsWith('character') ? ['identity_reference'] : ['storyboard_frame'],
    lanes: ['makevideo', 'storyboard'],
    rights: {
      commercialUseStatus: 'unknown',
      reusableAcrossProjects: false,
      reusableAcrossProjectsAuthorityRecordId: null,
      domainAuthorityGranted: false,
      domainAuthorityRecordId: null,
    },
    outcome: { shipped: false, published: false, conversionEvidenceIds: [] },
    createdAt: at,
  };
}

describe('MAKEVIDEO storyboard bridge', () => {
  it('binds the director plan and canonical opening frame into one continuity identity', () => {
    const bundle = compileMakeVideoStoryboardBundle({
      directorInput: directorInput(),
      request: request(),
      context: context(),
      binding: binding(),
      availableAssets: [asset('opening-frame-1'), asset('character-ref-1')],
    });

    expect(bundle.contract).toBe(MAKEVIDEO_STORYBOARD_BRIDGE_CONTRACT);
    expect(bundle.routing.request.referenceAssetIds[0]).toBe('opening-frame-1');
    expect(bundle.routing.request.constraints.needsReferenceFidelity).toBe(true);
    expect(bundle.directorPlan.providerRouting.authority).toBe('media-router-only');
    expect(bundle.continuity.directorFingerprint).toBe(bundle.directorPlan.fingerprint);
    expect(bundle.continuity.storyboardFingerprint).toBe(bundle.routing.storyboardFingerprint);
    expect(bundle.continuity.combinedFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.continuity.cookie).toMatch(/^makevideo:scene-01:shot-01:[a-f0-9]{24}$/);
  });

  it('invalidates the combined continuity identity when frame zero changes', () => {
    const assets = [asset('opening-frame-1'), asset('opening-frame-2'), asset('character-ref-1')];
    const first = compileMakeVideoStoryboardBundle({
      directorInput: directorInput(),
      request: request(),
      context: context(),
      binding: binding('opening-frame-1'),
      availableAssets: assets,
    });
    const second = compileMakeVideoStoryboardBundle({
      directorInput: directorInput(),
      request: request(),
      context: context(),
      binding: binding('opening-frame-2'),
      availableAssets: assets,
    });

    expect(first.continuity.combinedFingerprint).not.toBe(second.continuity.combinedFingerprint);
    expect(first.continuity.cookie).not.toBe(second.continuity.cookie);
  });
});
