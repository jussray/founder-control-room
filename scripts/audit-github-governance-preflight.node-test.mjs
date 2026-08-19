import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_RULESET_NAME,
  buildBlockedReport,
  buildReport,
  canonicalFloorSatisfied,
  classifyProviderReadFailure,
  collaboratorCanReview,
  rulesetSnapshot,
} from './audit-github-governance-preflight.mjs';

function canonicalRuleset(overrides = {}) {
  return {
    id: 20819094,
    name: CANONICAL_RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [{ actor_type: 'Integration', actor_id: 123456, bypass_mode: 'always' }],
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [
      {
        type: 'pull_request',
        parameters: {
          dismiss_stale_reviews_on_push: true,
          require_last_push_approval: true,
          required_approving_review_count: 1,
          required_review_thread_resolution: true,
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [
            { context: 'Required Gate' },
            { context: 'Verify test-ledger contract' },
          ],
        },
      },
      { type: 'non_fast_forward' },
      { type: 'deletion' },
    ],
    ...overrides,
  };
}

test('canonical hardened FCR main ruleset satisfies the floor', () => {
  const snapshot = rulesetSnapshot(canonicalRuleset());
  assert.equal(snapshot.targetsRequestedRef, true);
  assert.equal(snapshot.requiredApprovingReviewCount, 1);
  assert.equal(snapshot.dismissStaleReviewsOnPush, true);
  assert.equal(snapshot.requireLastPushApproval, true);
  assert.equal(snapshot.requiredReviewThreadResolution, true);
  assert.equal(snapshot.strictRequiredStatusChecks, true);
  assert.equal(snapshot.blockForcePushes, true);
  assert.equal(snapshot.blockDeletion, true);
  assert.equal(canonicalFloorSatisfied(snapshot), true);
});

test('zero review or stale-review policy cannot satisfy the floor', () => {
  const zeroReview = canonicalRuleset();
  zeroReview.rules[0].parameters.required_approving_review_count = 0;
  assert.equal(canonicalFloorSatisfied(rulesetSnapshot(zeroReview)), false);

  const staleAllowed = canonicalRuleset();
  staleAllowed.rules[0].parameters.dismiss_stale_reviews_on_push = false;
  assert.equal(canonicalFloorSatisfied(rulesetSnapshot(staleAllowed)), false);
});

test('collaborator readiness requires non-owner write authority and excludes bots', () => {
  assert.equal(collaboratorCanReview({ login: 'jussray', permissions: { admin: true } }, 'jussray'), false);
  assert.equal(collaboratorCanReview({ login: 'reviewer[bot]', type: 'Bot', permissions: { push: true } }, 'jussray'), false);
  assert.equal(collaboratorCanReview({ login: 'reader', permissions: { pull: true } }, 'jussray'), false);
  assert.equal(collaboratorCanReview({ login: 'reviewer', permissions: { push: true } }, 'jussray'), true);
});

test('report requires exactly one canonical active main ruleset plus reviewer readiness', () => {
  const ready = buildReport({
    repository: 'jussray/founder-control-room',
    fullRulesets: [canonicalRuleset()],
    collaborators: [
      { login: 'jussray', permissions: { admin: true } },
      { login: 'reviewer', permissions: { push: true } },
    ],
  });
  assert.equal(ready.status, 'READY');
  assert.equal(ready.observationComplete, true);
  assert.equal(ready.activeRulesetCountTargetingRef, 1);
  assert.equal(ready.canonicalRulesetMatchCount, 1);
  assert.equal(ready.eligibleNonOwnerWriteReviewerCount, 1);

  const duplicate = buildReport({
    repository: 'jussray/founder-control-room',
    fullRulesets: [canonicalRuleset(), { ...canonicalRuleset(), id: 999, name: 'duplicate-main-gate' }],
    collaborators: [{ login: 'reviewer', permissions: { maintain: true } }],
  });
  assert.equal(duplicate.status, 'NOT_READY');
  assert.equal(duplicate.activeRulesetCountTargetingRef, 2);
});

test('provider-read failure produces a sanitized blocked receipt instead of fake not-ready state', () => {
  const report = buildBlockedReport({
    repository: 'jussray/founder-control-room',
    targetRef: 'main',
    reason: 'provider_read_forbidden',
  });
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.observationComplete, false);
  assert.equal(report.blocker, 'provider_read_forbidden');
  assert.equal(report.canonicalFloorSatisfied, false);
  assert.equal(report.independentReviewerReady, false);
  assert.equal(report.activeRulesetCountTargetingRef, null);
  assert.equal(report.canonicalRuleset, null);
  assert.deepEqual(report.observedBranchRulesets, []);
  assert.equal(Object.hasOwn(report, 'errorMessage'), false);
});

test('provider-read failures are classified without retaining raw provider text', () => {
  assert.equal(classifyProviderReadFailure(new Error('HTTP 403: Resource not accessible by integration')), 'provider_read_forbidden');
  assert.equal(classifyProviderReadFailure(new Error('HTTP 401: Bad credentials')), 'provider_read_unauthenticated');
  assert.equal(classifyProviderReadFailure(new Error('GITHUB_TOKEN is required for governance preflight')), 'provider_read_token_missing');
  assert.equal(classifyProviderReadFailure(new Error('socket closed')), 'provider_read_failed');
});
