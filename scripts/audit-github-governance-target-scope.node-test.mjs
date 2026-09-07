import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_RULESET_NAME,
  buildReport,
  canonicalFloorSatisfied,
  canonicalFreshnessRulesetName,
  freshnessFloorSatisfied,
  rulesetSnapshot,
  trustedBypassPolicy,
} from './audit-github-governance-preflight.mjs';

const TRUSTED_APP_ID = '123456';

function canonicalRuleset(include, exclude = []) {
  return {
    id: 20819094,
    name: CANONICAL_RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [{
      actor_type: 'Integration',
      actor_id: Number(TRUSTED_APP_ID),
      bypass_mode: 'pull_request',
    }],
    conditions: { ref_name: { include, exclude } },
    rules: [
      {
        type: 'pull_request',
        parameters: {
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_approving_review_count: 0,
          required_review_thread_resolution: true,
        },
      },
      {
        type: 'code_scanning',
        parameters: {
          code_scanning_tools: [{
            tool: 'CodeQL',
            security_alerts_threshold: 'high_or_higher',
            alerts_threshold: 'errors',
          }],
        },
      },
      { type: 'non_fast_forward' },
      { type: 'deletion' },
    ],
  };
}

function freshnessRuleset(include, exclude = []) {
  return {
    id: 20819095,
    name: canonicalFreshnessRulesetName(),
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { include, exclude } },
    rules: [
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
    ],
  };
}

function report(
  reviewInclude,
  freshnessInclude = ['~DEFAULT_BRANCH'],
  reviewExclude = [],
  freshnessExclude = [],
) {
  return buildReport({
    repository: 'jussray/founder-control-room',
    targetRef: 'main',
    defaultBranch: 'main',
    fullRulesets: [
      canonicalRuleset(reviewInclude, reviewExclude),
      freshnessRuleset(freshnessInclude, freshnessExclude),
    ],
    collaborators: [],
    trustedGitHubAppId: TRUSTED_APP_ID,
  });
}

test('exact main scope accepts either the default-branch sentinel or literal main ref', () => {
  const expectedBypass = trustedBypassPolicy(TRUSTED_APP_ID);

  const sentinel = rulesetSnapshot(canonicalRuleset(['~DEFAULT_BRANCH']), 'main', 'main');
  assert.equal(sentinel.targetsRequestedRef, true);
  assert.equal(sentinel.targetsOnlyRequestedRef, true);
  assert.equal(sentinel.requestedRefExcluded, false);
  assert.deepEqual(sentinel.excludedTargetRefs, []);
  assert.equal(canonicalFloorSatisfied(sentinel, expectedBypass), true);

  const literal = rulesetSnapshot(canonicalRuleset(['refs/heads/main']), 'main', 'main');
  assert.equal(literal.targetsRequestedRef, true);
  assert.equal(literal.targetsOnlyRequestedRef, true);
  assert.equal(literal.requestedRefExcluded, false);
  assert.equal(canonicalFloorSatisfied(literal, expectedBypass), true);
});

test('canonical review membrane rejects ~ALL even when main is also present', () => {
  const expectedBypass = trustedBypassPolicy(TRUSTED_APP_ID);
  const widened = rulesetSnapshot(
    canonicalRuleset(['~DEFAULT_BRANCH', 'refs/heads/main', '~ALL']),
    'main',
    'main',
  );

  assert.equal(widened.targetsRequestedRef, true);
  assert.equal(widened.targetsOnlyRequestedRef, false);
  assert.equal(canonicalFloorSatisfied(widened, expectedBypass), false);
  assert.equal(report(['~DEFAULT_BRANCH', 'refs/heads/main', '~ALL']).status, 'NOT_READY');
});

test('canonical review membrane rejects any additional protected branch', () => {
  const widened = rulesetSnapshot(
    canonicalRuleset(['refs/heads/main', 'refs/heads/release']),
    'main',
    'main',
  );

  assert.equal(widened.targetsRequestedRef, true);
  assert.equal(widened.targetsOnlyRequestedRef, false);
  assert.equal(report(['refs/heads/main', 'refs/heads/release']).status, 'NOT_READY');
});

test('canonical review membrane rejects include-main plus exclude-main', () => {
  const expectedBypass = trustedBypassPolicy(TRUSTED_APP_ID);
  const excluded = rulesetSnapshot(
    canonicalRuleset(['refs/heads/main'], ['refs/heads/main']),
    'main',
    'main',
  );

  assert.equal(excluded.requestedRefExplicitlyIncluded, true);
  assert.equal(excluded.requestedRefExcluded, true);
  assert.equal(excluded.targetsRequestedRef, false);
  assert.equal(excluded.targetsOnlyRequestedRef, false);
  assert.deepEqual(excluded.excludedTargetRefs, ['refs/heads/main']);
  assert.equal(canonicalFloorSatisfied(excluded, expectedBypass), false);
  assert.equal(report(['refs/heads/main'], ['~DEFAULT_BRANCH'], ['refs/heads/main']).status, 'NOT_READY');
});

test('strict-freshness membrane rejects broadened target scope', () => {
  const widened = rulesetSnapshot(
    freshnessRuleset(['refs/heads/main', '~ALL']),
    'main',
    'main',
  );

  assert.equal(widened.targetsRequestedRef, true);
  assert.equal(widened.targetsOnlyRequestedRef, false);
  assert.equal(freshnessFloorSatisfied(widened), false);
  assert.equal(report(['~DEFAULT_BRANCH'], ['refs/heads/main', '~ALL']).status, 'NOT_READY');
});

test('strict-freshness membrane rejects default-branch include plus exclude-all', () => {
  const excluded = rulesetSnapshot(
    freshnessRuleset(['~DEFAULT_BRANCH'], ['~ALL']),
    'main',
    'main',
  );

  assert.equal(excluded.requestedRefExplicitlyIncluded, true);
  assert.equal(excluded.requestedRefExcluded, true);
  assert.equal(excluded.targetsRequestedRef, false);
  assert.equal(excluded.targetsOnlyRequestedRef, false);
  assert.deepEqual(excluded.excludedTargetRefs, ['~ALL']);
  assert.equal(freshnessFloorSatisfied(excluded), false);
  assert.equal(report(['~DEFAULT_BRANCH'], ['~DEFAULT_BRANCH'], [], ['~ALL']).status, 'NOT_READY');
});