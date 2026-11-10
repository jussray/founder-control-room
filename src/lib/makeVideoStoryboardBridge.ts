import {
  compileMakeVideoDirectorPlan,
  type MakeVideoDirectorPlan,
  type MakeVideoExecutionInput,
} from './makeVideoNervousSystem.js';
import {
  mediaFingerprint,
  type AssetRegistryEntryV1,
  type MediaRouterDomainContextV1,
  type MediaRoutingRequestV1,
} from './mediaRouter.js';
import {
  prepareStoryboardVideoRouting,
  type PreparedStoryboardVideoRoutingV1,
  type StoryboardStartFrameBindingV1,
} from './mediaStoryboardStartFrame.js';

export const MAKEVIDEO_STORYBOARD_BRIDGE_CONTRACT = 'founder-control-room/makevideo-storyboard-bridge@v1' as const;

export interface MakeVideoStoryboardBundleV1 {
  contract: typeof MAKEVIDEO_STORYBOARD_BRIDGE_CONTRACT;
  directorPlan: MakeVideoDirectorPlan;
  routing: PreparedStoryboardVideoRoutingV1;
  continuity: {
    directorFingerprint: string;
    storyboardFingerprint: string;
    combinedFingerprint: string;
    cookie: string;
  };
}

export function compileMakeVideoStoryboardBundle(input: {
  directorInput: MakeVideoExecutionInput;
  request: MediaRoutingRequestV1;
  context: MediaRouterDomainContextV1;
  binding: StoryboardStartFrameBindingV1;
  availableAssets: readonly AssetRegistryEntryV1[];
}): MakeVideoStoryboardBundleV1 {
  const directorPlan = compileMakeVideoDirectorPlan(input.directorInput);
  const routing = prepareStoryboardVideoRouting({
    request: input.request,
    context: input.context,
    binding: input.binding,
    availableAssets: input.availableAssets,
  });

  const combinedFingerprint = mediaFingerprint({
    contract: MAKEVIDEO_STORYBOARD_BRIDGE_CONTRACT,
    directorFingerprint: directorPlan.fingerprint,
    storyboardFingerprint: routing.storyboardFingerprint,
    requestId: routing.request.requestId,
    sceneId: input.binding.sceneId,
    shotId: input.binding.shotId,
  });

  return {
    contract: MAKEVIDEO_STORYBOARD_BRIDGE_CONTRACT,
    directorPlan,
    routing,
    continuity: {
      directorFingerprint: directorPlan.fingerprint,
      storyboardFingerprint: routing.storyboardFingerprint,
      combinedFingerprint,
      cookie: `makevideo:${input.binding.sceneId}:${input.binding.shotId}:${combinedFingerprint.slice(0, 24)}`,
    },
  };
}
