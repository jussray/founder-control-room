import type { ProviderAuthorityObservationV0 } from './provider-authority-receipt.v0.js';

export interface GitHubAuthorityBypassActorV0 {
  actorType: string;
  actorId: string;
  bypassMode: string;
}

export interface GitHubAuthorityReadbackV0 {
  requiresPullRequest: boolean | null;
  minimumApprovals: number | null;
  dismissStaleReviewsOnPush: boolean | null;
  requireLastPushApproval: boolean | null;
  requiresReviewThreadResolution: boolean | null;
  strictRequiredStatusChecks: boolean | null;
  requiredStatusChecks: readonly string[] | null;
  bypassActors: readonly GitHubAuthorityBypassActorV0[] | null;
}

const normalize = (values: readonly string[]): string[] => [...new Set(values)].sort();

function normalizeBypassActors(actors: readonly GitHubAuthorityBypassActorV0[]): string[] {
  return normalize(actors.map(({ actorType, actorId, bypassMode }) => `${actorType}:${actorId}:${bypassMode}`));
}

function freshApprovalState(readback: GitHubAuthorityReadbackV0): boolean | null {
  const { dismissStaleReviewsOnPush, requireLastPushApproval } = readback;
  if (dismissStaleReviewsOnPush === false || requireLastPushApproval === false) return false;
  if (dismissStaleReviewsOnPush === null || requireLastPushApproval === null) return null;
  return true;
}

export function normalizeGitHubAuthorityObservationV0(
  readback: GitHubAuthorityReadbackV0,
): ProviderAuthorityObservationV0 {
  return {
    requiresChangeRequest: readback.requiresPullRequest,
    minimumApprovals: readback.minimumApprovals,
    requiresFreshApproval: freshApprovalState(readback),
    requiresConversationResolution: readback.requiresReviewThreadResolution,
    requiresStrictEvidence: readback.strictRequiredStatusChecks,
    requiredEvidence: readback.requiredStatusChecks === null ? null : normalize(readback.requiredStatusChecks),
    bypassPrincipals: readback.bypassActors === null ? null : normalizeBypassActors(readback.bypassActors),
  };
}
