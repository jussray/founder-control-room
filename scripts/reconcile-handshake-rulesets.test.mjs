import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGETS, buildRulesetPlan, normalizeRulesetPayload, verifyApproval,
} from './reconcile-handshake-rulesets.mjs';

const SHA = 'a'.repeat(40);
const rule = (type, parameters) => ({ type, ...(parameters ? { parameters } : {}) });
const checks = (repo) => TARGETS[repo].requiredChecks.map((name) => ({
  name,
  app: { id: name === 'CodeQL' || name === 'Bearer' ? 57789 : 15368, slug: name === 'CodeQL' || name === 'Bearer' ? 'github-advanced-security' : 'github-actions' },
  status: 'completed', conclusion: 'success',
}));
function fixture(repo) {
  const target = TARGETS[repo];
  const rulesets = target.rulesetIds.map((id) => ({
    id, name: 'Existing rule ' + id, target: 'branch', enforcement: 'active',
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
    rules: [
      rule('deletion'), rule('non_fast_forward'), rule('required_signatures'),
      rule('required_linear_history'),
      rule('pull_request', { required_approving_review_count: repo === 'jussray/Sekret-Bip' ? 1 : 0, require_code_owner_review: true, require_last_push_approval: true, dismiss_stale_reviews_on_push: true, required_review_thread_resolution: true }),
      rule('code_scanning', { code_scanning_tools: [{ tool: 'CodeQL', security_alerts_threshold: 'high_or_higher', alerts_threshold: 'all' }] }),
      rule('required_status_checks', { strict_required_status_checks_policy: true, required_status_checks: [{ context: 'impossible-post-main-check', integration_id: 15368 }, { context: target.requiredChecks[0], integration_id: 15368 }] }),
      rule('required_deployments', { required_deployment_environments: target.releaseEnvironments }),
    ],
  }));
  const releaseWorkflow = repo === 'jussray/founder-control-room'
    ? 'on: workflow_call\njobs:\n  release:\n    environment: production\n    run: test "$current_main" = "$EXPECTED_HEAD_SHA"\n'
    : 'on: push\nbranches: [main]\njobs:\n  deploy:\n    environment: Production\n    run: test "$TARGET_SHA" = "$current_main"\n';
  return {
    repository: repo, expectedMainSha: SHA, observedMainSha: SHA, expectedHeadSha: 'b'.repeat(40),
    pullRequest: { state: 'open', draft: false, base: { sha: SHA }, head: { sha: 'b'.repeat(40) } },
    rulesets, checkRuns: checks(repo),
    releaseWorkflow,
    environments: target.releaseEnvironments.map((name) => ({
      name, protection_rules: name.toLowerCase() === 'production' ? [{ type: 'required_reviewers' }] : [],
      deployment_branch_policy: name.toLowerCase() === 'production' ? { protected_branches: true } : null,
    })),
    founderOnlyPolicy: 'Current phase: founder-only\nrequire_code_owner_review: false\nrequire_last_push_approval: false',
  };
}
describe('governed Handshake ruleset reconciliation', () => {
  for (const repo of Object.keys(TARGETS)) {
    it('retains code scanning, history, signatures, bypass, conditions and review-thread protections for ' + repo, () => {
      const input = fixture(repo), before = structuredClone(input.rulesets);
      const plan = buildRulesetPlan(input);
      assert.equal(plan.updates.length, input.rulesets.length);
      assert.equal(input.rulesets[0].rules.at(-1).type, 'required_deployments');
      assert.deepEqual(input.rulesets, before, 'planning never mutates provider evidence');
      for (const update of plan.updates) {
        assert.deepEqual(update.after.bypass_actors, update.before.bypass_actors);
        assert.deepEqual(update.after.conditions, update.before.conditions);
        for (const preserved of ['code_scanning', 'required_linear_history', 'required_signatures', 'non_fast_forward', 'deletion']) {
          assert.deepEqual(update.after.rules.find(r => r.type === preserved), update.before.rules.find(r => r.type === preserved));
        }
        assert.equal(update.after.rules.some(r => r.type === 'required_deployments'), false);
        assert.equal(update.after.rules.find(r => r.type === 'pull_request').parameters.required_review_thread_resolution, true);
        assert.deepEqual(update.after.rules.find(r => r.type === 'required_status_checks').parameters.required_status_checks.map(x => x.context), TARGETS[repo].requiredChecks);
        assert.equal(normalizeRulesetPayload(update.after).name, update.before.name);
      }
      assert.match(plan.digest, /^[a-f0-9]{64}$/);
    });
  }
  it('does not change FCR review count or bypass behavior', () => {
    const plan = buildRulesetPlan(fixture('jussray/founder-control-room'));
    assert.equal(plan.updates[0].after.rules.find(r => r.type === 'pull_request').parameters.required_approving_review_count, 0);
    assert.equal(plan.updates[0].after.rules.find(r => r.type === 'pull_request').parameters.dismiss_stale_reviews_on_push, true);
  });
  it('applies documented founder-only review phase to both Bip rulesets only', () => {
    const plan = buildRulesetPlan(fixture('jussray/Sekret-Bip'));
    for (const u of plan.updates) {
      assert.equal(u.after.rules.find(r => r.type === 'pull_request').parameters.required_approving_review_count, 0);
      assert.equal(u.after.rules.find(r => r.type === 'pull_request').parameters.require_code_owner_review, false);
      assert.equal(u.after.rules.find(r => r.type === 'pull_request').parameters.require_last_push_approval, false);
    }
  });
  it('fails closed if release environment proof is absent', () => {
    const x=fixture('jussray/founder-control-room'); x.environments=[];
    assert.throws(()=>buildRulesetPlan(x), /release environment/i);
  });
  it('fails closed if workflow does not require exact current main', () => {
    const x=fixture('jussray/Sekret-Bip');x.releaseWorkflow='on: push';
    assert.throws(()=>buildRulesetPlan(x), /release workflow/i);
  });
  it('fails closed if exact PR head/base has moved', () => {
    const x=fixture('jussray/Sekret-Bip');x.pullRequest.head.sha='c'.repeat(40);
    assert.throws(()=>buildRulesetPlan(x), /head mismatch/i);
  });
  it('fails closed if required CI check missing or untrusted', () => {
    const x=fixture('jussray/founder-control-room'); x.checkRuns=x.checkRuns.filter(x=>x.name!=='CodeQL');
    assert.throws(()=>buildRulesetPlan(x), /required check/i);
  });
  it('requires a matching founder-bound immutable digest before applying', () => {
    const plan=buildRulesetPlan(fixture('jussray/Sekret-Bip'));
    assert.throws(()=>verifyApproval(plan,{ planDigest:'0'.repeat(64), headSha:plan.expectedHeadSha}),/approval/i);
    assert.throws(()=>verifyApproval(plan,{ planDigest:plan.digest, headSha:'c'.repeat(40)}),/approval/i);
    assert.equal(verifyApproval(plan,{planDigest:plan.digest,headSha:plan.expectedHeadSha}),true);
  });
});
