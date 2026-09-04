import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPhaseReport,
  freshnessFloorSatisfied,
  normalizePhase,
  reviewFloorSatisfied,
} from './audit-fcr-governance-phase.mjs';
import {
  CANONICAL_RULESET_NAME,
  canonicalFreshnessRulesetName,
  rulesetSnapshot,
  trustedBypassPolicy,
} from './audit-github-governance-preflight.mjs';

const APP_ID = '123456';

function reviewRuleset(phase, overrides = {}) {
  const independent = phase === 'independent_review';
  return {
    id: 11,
    name: CANONICAL_RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [{ actor_type: 'Integration', actor_id: Number(APP_ID), bypass_mode: 'pull_request' }],
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [
      {
        type: 'pull_request',
        parameters: {
          dismiss_stale_reviews_on_push: independent,
          require_code_owner_review: independent,
          require_last_push_approval: independent,
          required_approving_review_count: independent ? 1 : 0,
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
    ...overrides,
  };
}

function freshnessRuleset(overrides = {}) {
  return {
    id: 22,
    name: canonicalFreshnessRulesetName(),
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [{
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [
          { context: 'Required Gate' },
          { context: 'Verify test-ledger contract' },
        ],
      },
    }],
    ...overrides,
  };
}

function report(phase, collaborators = [{ login: 'jussray', permissions: { admin: true } }]) {
  return buildPhaseReport({
    repository: 'jussray/founder-control-room',
    targetRef: 'main',
    defaultBranch: 'main',
    phase,
    fullRulesets: [reviewRuleset(phase), freshnessRuleset()],
    collaborators,
    trustedGitHubAppId: APP_ID,
  });
}

test('phase parser accepts only the two constitutional phases', () => {
  assert.equal(normalizePhase('founder_only'), 'founder_only');
  assert.equal(normalizePhase('independent_review'), 'independent_review');
  assert.throws(() => normalizePhase('zero_reviews'), /founder_only or independent_review/);
});

test('founder_only is READY without inventing a nonexistent outside reviewer', () => {
  const result = report('founder_only');
  assert.equal(result.status, 'READY');
  assert.equal(result.governancePhase, 'founder_only');
  assert.equal(result.reviewFloorSatisfied, true);
  assert.equal(result.freshnessFloorSatisfied, true);
  assert.equal(result.independentReviewerReady, false);
  assert.equal(result.reviewerRequirementSatisfied, true);
});

test('independent_review is NOT_READY until a real non-owner reviewer exists', () => {
  const missing = report('independent_review');
  assert.equal(missing.status, 'NOT_READY');
  assert.equal(missing.reviewFloorSatisfied, true);
  assert.equal(missing.reviewerRequirementSatisfied, false);

  const ready = report('independent_review', [
    { login: 'jussray', permissions: { admin: true } },
    { login: 'reviewer', permissions: { push: true } },
  ]);
  assert.equal(ready.status, 'READY');
  assert.equal(ready.eligibleNonOwnerWriteReviewerCount, 1);
});

test('founder_only rejects a provider that silently keeps one approval or code-owner review', () => {
  const expectedBypass = trustedBypassPolicy(APP_ID);
  const wrongCount = reviewRuleset('founder_only');
  wrongCount.rules[0].parameters.required_approving_review_count = 1;
  assert.equal(reviewFloorSatisfied(rulesetSnapshot(wrongCount, 'main', 'main'), 'founder_only', expectedBypass), false);

  const wrongOwner = reviewRuleset('founder_only');
  wrongOwner.rules[0].parameters.require_code_owner_review = true;
  assert.equal(reviewFloorSatisfied(rulesetSnapshot(wrongOwner, 'main', 'main'), 'founder_only', expectedBypass), false);
});

test('independent_review rejects dropped approval freshness controls', () => {
  const expectedBypass = trustedBypassPolicy(APP_ID);
  const weak = reviewRuleset('independent_review');
  weak.rules[0].parameters.require_last_push_approval = false;
  assert.equal(reviewFloorSatisfied(rulesetSnapshot(weak, 'main', 'main'), 'independent_review', expectedBypass), false);
});

test('both phases retain the same zero-bypass strict exact-head freshness membrane', () => {
  const snapshot = rulesetSnapshot(freshnessRuleset(), 'main', 'main');
  assert.equal(freshnessFloorSatisfied(snapshot), true);

  const bypassed = freshnessRuleset({
    bypass_actors: [{ actor_type: 'Integration', actor_id: Number(APP_ID), bypass_mode: 'pull_request' }],
  });
  assert.equal(freshnessFloorSatisfied(rulesetSnapshot(bypassed, 'main', 'main')), false);
});
