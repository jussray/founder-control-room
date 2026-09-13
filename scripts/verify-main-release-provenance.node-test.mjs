import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  classifyMainReleaseProvenance,
  classifyReviewedFirstParentSuccessors,
} from './verify-main-release-provenance.mjs';
import {
  observeMainReleaseProvenance,
  shouldEnforceMainReleaseProvenance,
} from './verify-production-migration-ledger.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const TERMINAL = 'c'.repeat(40);
const DIRECT = 'd'.repeat(40);

function pr(overrides = {}) {
  return {
    number: 42,
    merged_at: '2026-08-25T12:00:00Z',
    merge_commit_sha: SHA,
    base: { ref: 'main' },
    ...overrides,
  };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test('accepts exactly one merged PR bound to current main SHA', () => {
  assert.deepEqual(classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [pr()],
  }), {
    ok: true,
    reason: 'reviewed_pr_merge_provenance',
    targetSha: SHA,
    pullRequestNumber: 42,
    mergedAt: '2026-08-25T12:00:00Z',
  });
});

test('rejects a direct or otherwise unproven main commit', () => {
  assert.deepEqual(classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [],
  }), {
    ok: false,
    reason: 'direct_or_unproven_main_commit',
    targetSha: SHA,
  });
});

test('rejects stale target even when a PR association exists', () => {
  assert.equal(classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: OTHER,
    associatedPulls: [pr()],
  }).reason, 'stale_target');
});

test('rejects merged PR provenance for the wrong base branch', () => {
  assert.equal(classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [pr({ base: { ref: 'develop' } })],
  }).reason, 'direct_or_unproven_main_commit');
});

test('rejects a PR whose provider merge SHA does not equal the release SHA', () => {
  assert.equal(classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [pr({ merge_commit_sha: OTHER })],
  }).reason, 'direct_or_unproven_main_commit');
});

test('rejects ambiguous release provenance', () => {
  const result = classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [pr(), pr({ number: 43 })],
  });
  assert.equal(result.reason, 'ambiguous_pr_provenance');
  assert.deepEqual(result.matchingPullRequestNumbers, [42, 43]);
});

test('accepts a fully reviewed first-parent successor chain after the terminal ratified tip', () => {
  const result = classifyReviewedFirstParentSuccessors({
    terminalRatifiedTip: TERMINAL,
    targetSha: SHA,
    successorCommits: [
      { sha: OTHER, associatedPulls: [pr({ number: 51, merge_commit_sha: OTHER })] },
      { sha: SHA, associatedPulls: [pr({ number: 52 })] },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'reviewed_first_parent_successor_chain');
  assert.equal(result.successorCount, 2);
  assert.deepEqual(result.successors.map((entry) => entry.pullRequestNumber), [51, 52]);
});

test('rejects an unreviewed direct commit hidden before a later reviewed main merge', () => {
  const result = classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [pr({ number: 52 })],
    terminalRatifiedTip: TERMINAL,
    successorCommits: [
      { sha: DIRECT, associatedPulls: [] },
      { sha: SHA, associatedPulls: [pr({ number: 52 })] },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unreviewed_first_parent_successor');
  assert.equal(result.successorSha, DIRECT);
});

test('rejects a successor observation that does not terminate at the release target', () => {
  const result = classifyReviewedFirstParentSuccessors({
    terminalRatifiedTip: TERMINAL,
    targetSha: SHA,
    successorCommits: [
      { sha: OTHER, associatedPulls: [pr({ number: 51, merge_commit_sha: OTHER })] },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'successor_chain_not_bound_to_target');
  assert.equal(result.observedTip, OTHER);
});

test('requires successor PR evidence whenever a terminal ratified tip is supplied', () => {
  const result = classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [pr()],
    terminalRatifiedTip: TERMINAL,
    successorCommits: null,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'successor_pr_provenance_unavailable');
});

test('enforces provenance only in the canonical manual Deploy preflight', () => {
  assert.equal(shouldEnforceMainReleaseProvenance({
    phase: 'preflight',
    githubActions: 'true',
    githubWorkflow: 'Deploy',
    githubEventName: 'workflow_dispatch',
  }), true);
  assert.equal(shouldEnforceMainReleaseProvenance({
    phase: 'post-push',
    githubActions: 'true',
    githubWorkflow: 'Deploy',
    githubEventName: 'workflow_dispatch',
  }), false);
  assert.equal(shouldEnforceMainReleaseProvenance({
    phase: 'preflight',
    githubActions: 'true',
    githubWorkflow: 'CI',
    githubEventName: 'push',
  }), false);
});

test('observes provider state and rejects missing release provenance', async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith('/branches/main')) return response({ commit: { sha: SHA } });
    if (String(url).endsWith(`/commits/${SHA}/pulls`)) return response([]);
    return response({}, 404);
  };

  const result = await observeMainReleaseProvenance({
    repository: 'jussray/founder-control-room',
    targetSha: SHA,
    fetchImpl,
    token: '',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'direct_or_unproven_main_commit');
});

test('provider observation failure blocks instead of manufacturing green', async () => {
  const result = await observeMainReleaseProvenance({
    repository: 'jussray/founder-control-room',
    targetSha: SHA,
    fetchImpl: async () => response({ message: 'unavailable' }, 503),
    token: '',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider_unavailable');
});

test('preflight verifier is load-bearing before the first production mutation', () => {
  const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const preflight = deploy.indexOf('MIGRATION_LEDGER_PHASE: preflight');
  const verifier = deploy.indexOf('node scripts/verify-production-migration-ledger.mjs', preflight);
  const mutationStep = deploy.indexOf('- name: Push migrations', verifier);
  const mutationYes = deploy.indexOf('--yes', mutationStep);
  const worker = deploy.indexOf('worker-deploy:');
  const workerDependency = deploy.indexOf('needs: supabase-migrate', worker);
  const pages = deploy.indexOf('pages-release:');
  const pagesDependency = deploy.indexOf('needs: worker-deploy', pages);

  assert.ok(preflight >= 0, 'preflight phase must exist');
  assert.ok(verifier > preflight, 'preflight verifier must execute in the preflight step');
  assert.ok(mutationStep > verifier, 'Supabase mutation step must remain downstream of provenance enforcement');
  assert.ok(mutationYes > mutationStep, 'Supabase mutation step must remain an acknowledged --yes mutation');
  assert.ok(workerDependency > worker, 'Worker deploy must remain dependent on the Supabase job');
  assert.ok(pagesDependency > pages, 'Pages release must remain dependent on Worker deploy');
});

test('main provenance workflow cancels stale push runs without weakening provenance semantics', () => {
  const workflow = readFileSync(new URL('../.github/workflows/main-release-provenance.yml', import.meta.url), 'utf8');

  assert.match(
    workflow,
    /concurrency:\n\s+group: main-release-provenance-\$\{\{ github\.event_name \}\}-\$\{\{ github\.ref \}\}\n\s+cancel-in-progress: true/,
  );

  const supersession = workflow.indexOf('- name: Classify superseded push run');
  const pushOnly = workflow.indexOf('"${GITHUB_EVENT_NAME}" == "push"', supersession);
  const staleOnly = workflow.indexOf('"${TARGET_SHA}" != "${CURRENT_MAIN_SHA}"', supersession);
  const receipt = workflow.indexOf("reason: 'superseded_push'", supersession);
  const unenforced = workflow.indexOf('enforced: false', supersession);
  const verifier = workflow.indexOf('- name: Verify release provenance against live GitHub state', supersession);
  const verifierGuard = workflow.indexOf("if: ${{ steps.supersession.outputs.superseded != 'true' }}", verifier);

  assert.ok(supersession >= 0, 'workflow must classify superseded push runs');
  assert.ok(pushOnly > supersession, 'supersession must be limited to push events');
  assert.ok(staleOnly > pushOnly, 'supersession must require target/main mismatch');
  assert.ok(receipt > staleOnly, 'superseded runs must emit an explicit receipt');
  assert.ok(unenforced > receipt, 'superseded receipt must not claim provenance enforcement');
  assert.ok(verifier > unenforced, 'current candidates must still reach the provenance verifier');
  assert.ok(verifierGuard > verifier, 'the verifier may be skipped only for an explicitly superseded push');
});

test('main provenance workflow observes every first-parent successor after historical ratification', () => {
  const workflow = readFileSync(new URL('../.github/workflows/main-release-provenance.yml', import.meta.url), 'utf8');

  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /verify-main-release-historical-ratification\.mjs > historical-ratification\.json/);
  assert.match(workflow, /git rev-list --reverse --first-parent "\$\{terminal_tip\}\.\.\$\{TARGET_SHA\}"/);
  assert.match(workflow, /SUCCESSOR_COMMITS_JSON/);
  assert.match(workflow, /TERMINAL_RATIFIED_TIP/);
});
