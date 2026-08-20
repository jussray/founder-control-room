import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_RULESET_NAME,
  REQUIRED_APPROVING_REVIEW_COUNT,
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
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [
      {
        type: 'pull_request',
        parameters: {
          dismiss_stale_reviews_on_push: false,
          require_last_push_approval: false,
          required_approving_review_count: REQUIRED_APPROVING_REVIEW_COUNT,
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

test('canonical founder-final FCR default-branch ruleset satisfies the provider floor', () => {
  const snapshot = rulesetSnapshot(canonicalRuleset(), 'main', 'main');
  assert.equal(snapshot.targetsRequestedRef, true);
  assert.equal(snapshot.requiredApprovingReviewCount, 0);
  assert.equal(snapshot.dismissStaleReviewsOnPush, false);
  assert.equal(snapshot.requireLastPushApproval, false);
  assert.equal(snapshot.requiredReviewThreadResolution, true);
  assert.equal(snapshot.strictRequiredStatusChecks, true);
  assert.equal(snapshot.blockForcePushes, true);
  assert.equal(snapshot.blockDeletion, true);
  assert.equal(canonicalFloorSatisfied(snapshot), true);
});

test('default-branch sentinel resolves only to the observed repository default branch', () => {
  const sentinel = canonicalRuleset();
  assert.equal(rulesetSnapshot(sentinel, 'main', 'main').targetsRequestedRef, true);
  assert.equal(rulesetSnapshot(sentinel, 'release', 'main').targetsRequestedRef, false);

  const literal = canonicalRuleset({
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
  });
  assert.equal(rulesetSnapshot(literal, 'main', 'main').targetsRequestedRef, true);
});

test('legacy human-review semantics or missing branch protections cannot satisfy the floor', () => {
  const legacyReview = canonicalRuleset();
  legacyReview.rules[0].parameters.required_approving_review_count = 1;
  legacyReview.rules[0].parameters.dismiss_stale_reviews_on_push = true;
  legacyReview.rules[0].parameters.require_last_push_approval = true;
  assert.equal(canonicalFloorSatisfied(rulesetSnapshot(legacyReview, 'main', 'main')), false);

  const missingThreadResolution = canonicalRuleset();
  missingThreadResolution.rules[0].parameters.required_review_thread_resolution = false;
  assert.equal(canonicalFloorSatisfied(rulesetSnapshot(missingThreadResolution, 'main', 'main')), false);

  const missingChecks = canonicalRuleset();
  missingChecks.rules[1].parameters.required_status_checks = [{ context: 'Required Gate' }];
  assert.equal(canonicalFloorSatisfied(rulesetSnapshot(missingChecks, 'main', 'main')), false);
});

test('collaborator readiness remains informational and excludes owner and bots', () => {
  assert.equal(collaboratorCanReview({ login: 'jussray', permissions: { admin: true } }, 'jussray'), false);
  assert.equal(collaboratorCanReview({ login: 'reviewer[bot]', type: 'Bot', permissions: { push: true } }, 'jussray'), false);
  assert.equal(collaboratorCanReview({ login: 'reader', permissions: { pull: true } }, 'jussray'), false);
  assert.equal(collaboratorCanReview({ login: 'reviewer', permissions: { push: true } }, 'jussray'), true);
});

test('report requires exactly one canonical active main ruleset but not a second human reviewer', () => {
  const soloFounderReady = buildReport({
    repository: 'jussray/founder-control-room',
    targetRef: 'main',
    defaultBranch: 'main',
    fullRulesets: [canonicalRuleset()],
    collaborators: [{ login: 'jussray', permissions: { admin: true } }],
  });
  assert.equal(soloFounderReady.status, 'READY');
  assert.equal(soloFounderReady.observationComplete, true);
  assert.equal(soloFounderReady.defaultBranch, 'main');
  assert.equal(soloFounderReady.activeRulesetCountTargetingRef, 1);
  assert.equal(soloFounderReady.canonicalRulesetMatchCount, 1);
  assert.equal(soloFounderReady.independentHumanReviewerRequired, false);
  assert.equal(soloFounderReady.independentReviewerReady, false);
  assert.equal(soloFounderReady.eligibleNonOwnerWriteReviewerCount, 0);

  const duplicate = buildReport({
    repository: 'jussray/founder-control-room',
    targetRef: 'main',
    defaultBranch: 'main',
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
  assert.equal(report.defaultBranch, null);
  assert.equal(report.canonicalFloorSatisfied, false);
  assert.equal(report.independentHumanReviewerRequired, false);
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
