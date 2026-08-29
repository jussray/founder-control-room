import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CANONICAL_RULESET_NAME,
  buildBlockedReport,
  buildReport,
  bypassPolicyMatches,
  canonicalFloorSatisfied,
  classifyProviderReadFailure,
  collaboratorCanReview,
  rulesetSnapshot,
  trustedBypassPolicy,
} from './audit-github-governance-preflight.mjs';

const TRUSTED_APP_ID = '123456';

function canonicalRuleset(overrides = {}) {
  return {
    id: 20819094,
    name: CANONICAL_RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [{ actor_type: 'Integration', actor_id: Number(TRUSTED_APP_ID), bypass_mode: 'pull_request' }],
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
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

function readyReport(overrides = {}) {
  return buildReport({
    repository: 'jussray/founder-control-room',
    targetRef: 'main',
    defaultBranch: 'main',
    fullRulesets: [canonicalRuleset()],
    collaborators: [
      { login: 'jussray', permissions: { admin: true } },
      { login: 'reviewer', permissions: { push: true } },
    ],
    trustedGitHubAppId: TRUSTED_APP_ID,
    ...overrides,
  });
}

test('canonical hardened FCR default-branch ruleset satisfies the floor with PR-only trusted bypass identity', () => {
  const expectedBypass = trustedBypassPolicy(TRUSTED_APP_ID);
  const snapshot = rulesetSnapshot(canonicalRuleset(), 'main', 'main');
  assert.equal(snapshot.targetsRequestedRef, true);
  assert.equal(snapshot.requiredApprovingReviewCount, 1);
  assert.equal(snapshot.dismissStaleReviewsOnPush, true);
  assert.equal(snapshot.requireLastPushApproval, true);
  assert.equal(snapshot.requiredReviewThreadResolution, true);
  assert.equal(snapshot.strictRequiredStatusChecks, true);
  assert.equal(snapshot.blockForcePushes, true);
  assert.equal(snapshot.blockDeletion, true);
  assert.equal(snapshot.bypassObservationComplete, true);
  assert.equal(bypassPolicyMatches(snapshot, expectedBypass), true);
  assert.equal(canonicalFloorSatisfied(snapshot, expectedBypass), true);
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

test('zero review or stale-review policy cannot satisfy the floor', () => {
  const expectedBypass = trustedBypassPolicy(TRUSTED_APP_ID);
  const zeroReview = canonicalRuleset();
  zeroReview.rules[0].parameters.required_approving_review_count = 0;
  assert.equal(canonicalFloorSatisfied(rulesetSnapshot(zeroReview, 'main', 'main'), expectedBypass), false);

  const staleAllowed = canonicalRuleset();
  staleAllowed.rules[0].parameters.dismiss_stale_reviews_on_push = false;
  assert.equal(canonicalFloorSatisfied(rulesetSnapshot(staleAllowed, 'main', 'main'), expectedBypass), false);
});

test('collaborator readiness requires non-owner write authority and excludes bots', () => {
  assert.equal(collaboratorCanReview({ login: 'jussray', permissions: { admin: true } }, 'jussray'), false);
  assert.equal(collaboratorCanReview({ login: 'reviewer[bot]', type: 'Bot', permissions: { push: true } }, 'jussray'), false);
  assert.equal(collaboratorCanReview({ login: 'reader', permissions: { pull: true } }, 'jussray'), false);
  assert.equal(collaboratorCanReview({ login: 'reviewer', permissions: { push: true } }, 'jussray'), true);
});

test('report requires exactly one canonical active main ruleset plus reviewer readiness and trusted bypass', () => {
  const ready = readyReport();
  assert.equal(ready.status, 'READY');
  assert.equal(ready.observationComplete, true);
  assert.equal(ready.defaultBranch, 'main');
  assert.equal(ready.activeRulesetCountTargetingRef, 1);
  assert.equal(ready.canonicalRulesetMatchCount, 1);
  assert.equal(ready.eligibleNonOwnerWriteReviewerCount, 1);
  assert.equal(ready.trustedBypassPolicyAvailable, true);
  assert.equal(ready.bypassObservationComplete, true);
  assert.equal(ready.bypassPolicySatisfied, true);

  const duplicate = readyReport({
    fullRulesets: [canonicalRuleset(), { ...canonicalRuleset(), id: 999, name: 'duplicate-main-gate' }],
    collaborators: [{ login: 'reviewer', permissions: { maintain: true } }],
  });
  assert.equal(duplicate.status, 'NOT_READY');
  assert.equal(duplicate.activeRulesetCountTargetingRef, 2);
});

test('missing trusted GitHub App identity blocks instead of manufacturing provider truth', () => {
  const report = readyReport({ trustedGitHubAppId: '' });
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.observationComplete, false);
  assert.equal(report.blocker, 'trusted_bypass_policy_unavailable');
  assert.equal(report.trustedBypassPolicyAvailable, false);
  assert.equal(report.canonicalFloorSatisfied, false);
});

test('omitted bypass_actors blocks because bypass policy was not observable', () => {
  const ruleset = canonicalRuleset();
  delete ruleset.bypass_actors;
  const report = readyReport({ fullRulesets: [ruleset] });
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.observationComplete, false);
  assert.equal(report.blocker, 'bypass_observation_unavailable');
  assert.equal(report.bypassObservationComplete, false);
  assert.equal(report.bypassPolicySatisfied, false);
});

test('fully observed wrong bypass identity or always-bypass mode is NOT_READY', () => {
  const wrongId = readyReport({
    fullRulesets: [canonicalRuleset({
      bypass_actors: [{ actor_type: 'Integration', actor_id: 999999, bypass_mode: 'pull_request' }],
    })],
  });
  assert.equal(wrongId.status, 'NOT_READY');
  assert.equal(wrongId.observationComplete, true);
  assert.equal(wrongId.blocker, null);
  assert.equal(wrongId.bypassPolicySatisfied, false);
  assert.equal(wrongId.canonicalFloorSatisfied, false);

  const alwaysBypass = readyReport({
    fullRulesets: [canonicalRuleset({
      bypass_actors: [{ actor_type: 'Integration', actor_id: Number(TRUSTED_APP_ID), bypass_mode: 'always' }],
    })],
  });
  assert.equal(alwaysBypass.status, 'NOT_READY');
  assert.equal(alwaysBypass.observationComplete, true);
  assert.equal(alwaysBypass.bypassPolicySatisfied, false);
  assert.equal(alwaysBypass.canonicalFloorSatisfied, false);
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

test('workflow keeps production App identity outside the pull-request execution path', () => {
  const workflow = readFileSync(new URL('../.github/workflows/github-governance-preflight.yml', import.meta.url), 'utf8');
  const [contractSide, providerSide] = workflow.split('  governance-provider-read:');

  assert.ok(providerSide, 'governance-provider-read job must exist');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(contractSide, /governance-contract:/);
  assert.doesNotMatch(contractSide, /environment:\s*production/);
  assert.doesNotMatch(contractSide, /secrets\.GITHUB_APP_ID/);

  assert.match(providerSide, /needs:\s*governance-contract/);
  assert.match(providerSide, /environment:\s*production/);
  assert.match(providerSide, /github\.event_name == 'push'/);
  assert.match(providerSide, /github\.event_name == 'workflow_dispatch'/);
  assert.match(providerSide, /github\.ref == 'refs\/heads\/main'/);
  assert.match(providerSide, /GITHUB_APP_ID:\s*\$\{\{ secrets\.GITHUB_APP_ID \}\}/);
  assert.match(providerSide, /ref:\s*\$\{\{ github\.sha \}\}/);
});
