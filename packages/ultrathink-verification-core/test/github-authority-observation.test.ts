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
      bypassPrincipals: [],
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
      bypassPrincipals: [],
    });
    expect(observation.requiresFreshApproval).toBe(false);
  });

  it('preserves unknown provider state instead of inferring protection', () => {
    const observation = normalizeGitHubAuthorityObservationV0({
      requiresPullRequest: null,
      minimumApprovals: null,
      dismissStaleReviewsOnPush: null,
      requireLastPushApproval: null,
      requiresReviewThreadResolution: null,
      strictRequiredStatusChecks: null,
      requiredStatusChecks: null,
      bypassPrincipals: null,
    });
    expect(observation).toEqual({
      requiresChangeRequest: null,
      minimumApprovals: null,
      requiresFreshApproval: null,
      requiresConversationResolution: null,
      requiresStrictEvidence: null,
      requiredEvidence: null,
      bypassPrincipals: null,
    });
  });

  it('normalizes bypass principals deterministically for receipt stability', () => {
    const observation = normalizeGitHubAuthorityObservationV0({
      requiresPullRequest: true,
      minimumApprovals: 1,
      dismissStaleReviewsOnPush: true,
      requireLastPushApproval: true,
      requiresReviewThreadResolution: true,
      strictRequiredStatusChecks: true,
      requiredStatusChecks: [],
      bypassPrincipals: ['app:42', 'owner', 'app:42'],
    });
    expect(observation.bypassPrincipals).toEqual(['app:42', 'owner']);
  });
});
