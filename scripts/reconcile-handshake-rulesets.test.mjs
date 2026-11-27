import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGETS, buildRulesetPlan, normalizeRulesetPayload, verifyApproval, reconcileProvider,
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
    : 'on:\n  push:\n    branches: [main]\njobs:\n  deploy:\n    environment: Production\n    run: test "$TARGET_SHA" = "$current_main"\n';
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

function transportFor(input, { rejectSecondWrite = false } = {}) {
  const base = '/repos/' + input.repository;
  const live = new Map(input.rulesets.map((r) => [r.id, structuredClone(r)]));
  let writes = 0;
  let rejectedOnce = false;
  const request = async (path, token, method = 'GET', body) => {
    assert.equal(token, 'synthetic-scoped-token');
    if (path === base + '/branches/main') return { commit: { sha: input.observedMainSha } };
    if (path.startsWith(base + '/pulls/')) return structuredClone(input.pullRequest);
    if (path.includes('/check-runs?')) return { total_count: input.checkRuns.length, check_runs: structuredClone(input.checkRuns) };
    if (path === base + '/environments?per_page=100') return {
      total_count: input.environments.length, environments: structuredClone(input.environments),
    };
    if (path.includes('/contents/' + TARGETS[input.repository].releaseWorkflowPath)) {
      return { encoding: 'base64', content: Buffer.from(input.releaseWorkflow, 'utf8').toString('base64') };
    }
    if (path.includes('/contents/docs/governance/main-governance-acceptance-probe.md')) {
      return { encoding: 'base64', content: Buffer.from(input.founderOnlyPolicy, 'utf8').toString('base64') };
    }
    const match = path.match(/\/rulesets\/(\d+)$/);
    if (!match) throw new Error('unexpected provider path ' + path);
    const id = Number(match[1]);
    assert.equal(live.has(id), true);
    if (method === 'GET') return structuredClone(live.get(id));
    assert.equal(method, 'PUT');
    writes++;
    if (rejectSecondWrite && writes === 2 && !rejectedOnce) {
      rejectedOnce = true;
      throw new Error('synthetic second-ruleset provider failure');
    }
    live.set(id, { ...structuredClone(live.get(id)), ...structuredClone(body) });
    return structuredClone(live.get(id));
  };
  return { request, live, original: structuredClone(input.rulesets), getWrites: () => writes };
}

describe('provider write boundary', () => {
  it('preview performs no PUTs and returns exact provider-bound plan digest', async () => {
    const source = fixture('jussray/founder-control-room');
    const fake = transportFor(source);
    const preview = await reconcileProvider({
      repository: source.repository, prNumber: 1194,
      expectedMainSha: source.expectedMainSha, expectedHeadSha: source.expectedHeadSha,
      token: 'synthetic-scoped-token', apply: false, transport: fake.request,
    });
    assert.equal(preview.applied, false);
    assert.equal(preview.digest, buildRulesetPlan(source).digest);
    assert.equal(fake.getWrites(), 0);
  });
  it('rechecks and reads back every exact founder-approved PUT before reporting applied', async () => {
    const source = fixture('jussray/founder-control-room');
    const fake = transportFor(source);
    const digest = buildRulesetPlan(source).digest;
    const receipts = [];
    const applied = await reconcileProvider({
      repository: source.repository, prNumber: 1194,
      expectedMainSha: source.expectedMainSha, expectedHeadSha: source.expectedHeadSha,
      approvedPlanDigest: digest, approvedHeadSha: source.expectedHeadSha,
      token: 'synthetic-scoped-token', apply: true, transport: fake.request,
      backupWriter: (receipt) => receipts.push(receipt),
    });
    assert.equal(applied.applied, true);
    assert.deepEqual(applied.updatedRulesetIds, TARGETS[source.repository].rulesetIds);
    assert.equal(fake.getWrites(), 2);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].beforePayloads.length, 2);
  });
  it('rolls back the first rule if the second provider update fails', async () => {
    const source = fixture('jussray/founder-control-room');
    const fake = transportFor(source, { rejectSecondWrite: true });
    const digest = buildRulesetPlan(source).digest;
    await assert.rejects(reconcileProvider({
      repository: source.repository, prNumber: 1194,
      expectedMainSha: source.expectedMainSha, expectedHeadSha: source.expectedHeadSha,
      approvedPlanDigest: digest, approvedHeadSha: source.expectedHeadSha,
      token: 'synthetic-scoped-token', apply: true, transport: fake.request,
      backupWriter: () => {},
    }), /rollback=verified for completed writes/);
    for (const entry of fake.original) assert.deepEqual(fake.live.get(entry.id), entry);
    assert.equal(fake.getWrites(), 3);
  });
});

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
  it('preserves aggregate deletion protection when the secondary Bip ruleset does not own deletion', () => {
    const x = fixture('jussray/Sekret-Bip');
    x.rulesets[1].rules = x.rulesets[1].rules.filter((r) =>
      r.type !== 'deletion' && r.type !== 'non_fast_forward' && r.type !== 'required_signatures');
    const plan = buildRulesetPlan(x);
    assert.equal(plan.updates.length, 2);
    assert.equal(plan.updates[0].after.rules.some((r) => r.type === 'deletion'), true);
    assert.equal(plan.updates[1].after.rules.some((r) => r.type === 'deletion'), false);
    assert.deepEqual(plan.updates[1].after.bypass_actors, x.rulesets[1].bypass_actors);
  });
  it('fails closed if every ruleset has lost deletion or force-push protection', () => {
    const x = fixture('jussray/founder-control-room');
    for (const ruleset of x.rulesets) ruleset.rules = ruleset.rules.filter((r) =>
      r.type !== 'deletion' && r.type !== 'non_fast_forward');
    assert.throws(() => buildRulesetPlan(x), /aggregate deletion.*force-push/i);
  });
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
  it('rejects a newer failed attempt even when an earlier successful duplicate check exists', () => {
    const x=fixture('jussray/founder-control-room');
    x.checkRuns.push({ name: 'Required Gate', app: { id: 15368, slug: 'github-actions' },
      status: 'completed', conclusion: 'failure' });
    assert.throws(() => buildRulesetPlan(x), /failing or incomplete.*check/i);
  });
  it('rejects a red unrelated current-head CI check before governance mutation', () => {
    const x=fixture('jussray/Sekret-Bip');
    x.checkRuns.push({ name: 'production browser security proof',
      app: { id: 15368, slug: 'github-actions' }, status: 'completed', conclusion: 'failure' });
    assert.throws(() => buildRulesetPlan(x), /failing or incomplete.*check/i);
  });
  it('requires a matching founder-bound immutable digest before applying', () => {
    const plan=buildRulesetPlan(fixture('jussray/Sekret-Bip'));
    assert.throws(()=>verifyApproval(plan,{ planDigest:'0'.repeat(64), headSha:plan.expectedHeadSha}),/approval/i);
    assert.throws(()=>verifyApproval(plan,{ planDigest:plan.digest, headSha:'c'.repeat(40)}),/approval/i);
    assert.equal(verifyApproval(plan,{planDigest:plan.digest,headSha:plan.expectedHeadSha}),true);
  });
});
