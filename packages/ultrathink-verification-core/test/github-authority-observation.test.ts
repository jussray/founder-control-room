import { describe, expect, it } from 'vitest';
import { normalizeGitHubAuthorityObservationV0 } from '../src/github-authority-observation.v0.js';

describe('normalizeGitHubAuthorityObservationV0', () => {
  it('maps a complete hardened GitHub readback into the neutral authority observation', () => {
    expect(normalizeGitHubAuthorityObservationV0({
      requiresPullRequest: true,
      minimumApprovals: 1,
      dismissStaleReviewsOnPush: true,
      requireLastPushApproval: true,
      requiresReviewThreadResolution: true,
      strictRequiredStatusChecks: true,
      requiredStatusChecks: ['Control Room Test Ledger', 'Repository Truth Gate', 'Control Room Test Ledger'],
      bypassActors: [],
    })).toEqual({
      requiresChangeRequest: true,
      minimumApprovals: 1,
      requiresFreshApproval: true,
      requiresConversationResolution: true,
      requiresStrictEvidence: true,
      requiredEvidence: ['Control Room Test Ledger', 'Repository Truth Gate'],
      bypassPrincipals: [],
    });
  });

  it('fails the freshness observation if either GitHub freshness control is disabled', () => {
    const observation = normalizeGitHubAuthorityObservationV0({
      requiresPullRequest: true,
      minimumApprovals: 1,
      dismissStaleReviewsOnPush: true,
      requireLastPushApproval: false,
      requiresReviewThreadResolution: true,
      strictRequiredStatusChecks: true,
      requiredStatusChecks: [],
      bypassActors: [],
    });
    expect(observation.requiresFreshApproval).toBe(false);
  });

  it('preserves unknown provider state instead of inferring protection', () => {
    expect(normalizeGitHubAuthorityObservationV0({
      requiresPullRequest: null,
      minimumApprovals: null,
      dismissStaleReviewsOnPush: null,
      requireLastPushApproval: null,
      requiresReviewThreadResolution: null,
      strictRequiredStatusChecks: null,
      requiredStatusChecks: null,
      bypassActors: null,
    })).toEqual({
      requiresChangeRequest: null,
      minimumApprovals: null,
      requiresFreshApproval: null,
      requiresConversationResolution: null,
      requiresStrictEvidence: null,
      requiredEvidence: null,
      bypassPrincipals: null,
    });
  });

  it('preserves actor identity and bypass mode so widened authority becomes drift', () => {
    const pullRequestMode = normalizeGitHubAuthorityObservationV0({
      requiresPullRequest: true,
      minimumApprovals: 1,
      dismissStaleReviewsOnPush: true,
      requireLastPushApproval: true,
      requiresReviewThreadResolution: true,
      strictRequiredStatusChecks: true,
      requiredStatusChecks: [],
      bypassActors: [{ actorType: 'Integration', actorId: '42', bypassMode: 'pull_request' }],
    });
    const alwaysMode = normalizeGitHubAuthorityObservationV0({
      requiresPullRequest: true,
      minimumApprovals: 1,
      dismissStaleReviewsOnPush: true,
      requireLastPushApproval: true,
      requiresReviewThreadResolution: true,
      strictRequiredStatusChecks: true,
      requiredStatusChecks: [],
      bypassActors: [{ actorType: 'Integration', actorId: '42', bypassMode: 'always' }],
    });
    expect(pullRequestMode.bypassPrincipals).toEqual(['Integration:42:pull_request']);
    expect(alwaysMode.bypassPrincipals).toEqual(['Integration:42:always']);
    expect(alwaysMode.bypassPrincipals).not.toEqual(pullRequestMode.bypassPrincipals);
  });

  it('normalizes bypass actors deterministically for receipt stability', () => {
    const observation = normalizeGitHubAuthorityObservationV0({
      requiresPullRequest: true,
      minimumApprovals: 1,
      dismissStaleReviewsOnPush: true,
      requireLastPushApproval: true,
      requiresReviewThreadResolution: true,
      strictRequiredStatusChecks: true,
      requiredStatusChecks: [],
      bypassActors: [
        { actorType: 'Integration', actorId: '42', bypassMode: 'pull_request' },
        { actorType: 'RepositoryRole', actorId: '5', bypassMode: 'pull_request' },
        { actorType: 'Integration', actorId: '42', bypassMode: 'pull_request' },
      ],
    });
    expect(observation.bypassPrincipals).toEqual(['Integration:42:pull_request', 'RepositoryRole:5:pull_request']);
  });
});
