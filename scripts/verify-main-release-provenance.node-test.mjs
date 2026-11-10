import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  classifyMainReleaseProvenance,
  classifyReviewedFirstParentSuccessors,
} from './verify-main-release-provenance.mjs';
import {
  classifyTrustedMainReleaseProvenanceRun,
  observeMainReleaseProvenance,
  shouldEnforceMainReleaseProvenance,
  TERMINAL_RATIFIED_MAIN_TIP,
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

function ownerPush(overrides = {}) {
  return {
    eventName: 'push',
    ref: 'refs/heads/main',
    actor: 'jussray',
    repositoryOwner: 'jussray',
    ...overrides,
  };
}

function provenanceRun(overrides = {}) {
  return {
    id: 123456,
    path: '.github/workflows/main-release-provenance.yml',
    head_sha: SHA,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    actor: { login: 'jussray' },
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

test('accepts an exact current-main push performed by the repository owner', () => {
  assert.deepEqual(classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [],
    directMainContext: ownerPush(),
  }), {
    ok: true,
    reason: 'founder_owner_direct_main_provenance',
    directMainActor: 'jussray',
    targetSha: SHA,
  });
});

test('rejects a direct main push from a non-owner actor', () => {
  assert.equal(classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [],
    directMainContext: ownerPush({ actor: 'automation-bot' }),
  }).reason, 'direct_or_unproven_main_commit');
});

test('rejects owner identity outside an actual main push', () => {
  assert.equal(classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [],
    directMainContext: ownerPush({ eventName: 'workflow_dispatch' }),
  }).reason, 'direct_or_unproven_main_commit');
  assert.equal(classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [],
    directMainContext: ownerPush({ ref: 'refs/heads/feature' }),
  }).reason, 'direct_or_unproven_main_commit');
});

test('rejects a direct or otherwise unproven main commit without trusted push context', () => {
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

test('rejects stale target even when founder direct-main context is valid', () => {
  assert.equal(classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: OTHER,
    associatedPulls: [],
    directMainContext: ownerPush(),
  }).reason, 'stale_target');
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

test('rejects ambiguous release provenance even with valid direct-main context', () => {
  const result = classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [pr(), pr({ number: 43 })],
    directMainContext: ownerPush(),
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

test('rejects a successor whose merged PR names a different merge commit', () => {
  const result = classifyReviewedFirstParentSuccessors({
    terminalRatifiedTip: TERMINAL,
    targetSha: OTHER,
    successorCommits: [
      { sha: OTHER, associatedPulls: [pr({ number: 51, merge_commit_sha: SHA })] },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unreviewed_first_parent_successor');
  assert.equal(result.successorSha, OTHER);
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

test('accepts durable exact-head provenance run only when GitHub actor is repository owner', () => {
  assert.deepEqual(classifyTrustedMainReleaseProvenanceRun({
    repository: 'jussray/founder-control-room',
    targetSha: SHA,
    workflowRuns: [provenanceRun()],
  }), {
    ok: true,
    reason: 'verified_main_release_provenance_workflow',
    targetSha: SHA,
    workflowRunId: 123456,
    workflowActor: 'jussray',
    workflowPath: '.github/workflows/main-release-provenance.yml',
  });
});

test('rejects provenance workflow run from non-owner actor', () => {
  assert.equal(classifyTrustedMainReleaseProvenanceRun({
    repository: 'jussray/founder-control-room',
    targetSha: SHA,
    workflowRuns: [provenanceRun({ actor: { login: 'automation-bot' } })],
  }).reason, 'missing_trusted_direct_main_provenance_receipt');
});

test('rejects wrong SHA branch event status conclusion and workflow path receipts', () => {
  const invalidRuns = [
    provenanceRun({ head_sha: OTHER }),
    provenanceRun({ head_branch: 'feature' }),
    provenanceRun({ event: 'workflow_dispatch' }),
    provenanceRun({ status: 'in_progress' }),
    provenanceRun({ conclusion: 'failure' }),
    provenanceRun({ path: '.github/workflows/ci.yml' }),
  ];
  assert.equal(classifyTrustedMainReleaseProvenanceRun({
    repository: 'jussray/founder-control-room',
    targetSha: SHA,
    workflowRuns: invalidRuns,
  }).reason, 'missing_trusted_direct_main_provenance_receipt');
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

test('observes durable owner-direct provenance without widening Deploy actions permission', async () => {
  let actionsAuthorization = 'not-observed';
  const fetchImpl = async (url, options = {}) => {
    const href = String(url);
    if (href.endsWith('/branches/main')) return response({ commit: { sha: SHA } });
    if (href.endsWith(`/commits/${SHA}/pulls`)) return response([]);
    if (href.includes('/actions/runs?')) {
      actionsAuthorization = options.headers?.Authorization ?? null;
      return response({ workflow_runs: [provenanceRun()] });
    }
    return response({}, 404);
  };

  const result = await observeMainReleaseProvenance({
    repository: 'jussray/founder-control-room',
    targetSha: SHA,
    fetchImpl,
    token: 'scoped-deploy-token',
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'verified_main_release_provenance_workflow');
  assert.equal(result.workflowRunId, 123456);
  assert.equal(result.reviewedProvenanceReason, 'direct_or_unproven_main_commit');
  assert.equal(actionsAuthorization, null);
});

test('observes provider state and rejects missing trusted direct-main receipt', async () => {
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.endsWith('/branches/main')) return response({ commit: { sha: SHA } });
    if (href.endsWith(`/commits/${SHA}/pulls`)) return response([]);
    if (href.includes('/actions/runs?')) return response({ workflow_runs: [] });
    return response({}, 404);
  };

  const result = await observeMainReleaseProvenance({
    repository: 'jussray/founder-control-room',
    targetSha: SHA,
    fetchImpl,
    token: '',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_trusted_direct_main_provenance_receipt');
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

test('deploy observer rejects a direct first-parent successor before a reviewed release tip', async () => {
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/branches/main')) return response({ commit: { sha: SHA } });
    if (value.endsWith(`/commits/${SHA}/pulls`)) return response([pr({ number: 52 })]);
    if (value.endsWith(`/commits/${SHA}`)) {
      return response({ sha: SHA, parents: [{ sha: DIRECT }] });
    }
    if (value.endsWith(`/commits/${DIRECT}/pulls`)) return response([]);
    if (value.endsWith(`/commits/${DIRECT}`)) {
      return response({ sha: DIRECT, parents: [{ sha: TERMINAL_RATIFIED_MAIN_TIP }] });
    }
    return response({}, 404);
  };

  const result = await observeMainReleaseProvenance({
    repository: 'jussray/founder-control-room',
    targetSha: SHA,
    terminalRatifiedTip: TERMINAL_RATIFIED_MAIN_TIP,
    fetchImpl,
    token: '',
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unreviewed_first_parent_successor');
  assert.equal(result.successorSha, DIRECT);
});

test('deploy observer walks a first-parent successor chain longer than 256 commits', async () => {
  const chain = Array.from({ length: 301 }, (_, index) => index.toString(16).padStart(40, '0'));
  const terminal = chain[0];
  const target = chain[300];
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/branches/main')) return response({ commit: { sha: target } });
    const match = value.match(/\/commits\/([0-9a-f]{40})(\/pulls)?$/);
    if (!match) return response({}, 404);
    const sha = match[1];
    const index = chain.indexOf(sha);
    if (index < 0) return response({}, 404);
    if (match[2]) return response([pr({ number: index, merge_commit_sha: sha })]);
    return response({ sha, parents: index > 0 ? [{ sha: chain[index - 1] }] : [] });
  };

  const result = await observeMainReleaseProvenance({
    repository: 'jussray/founder-control-room',
    targetSha: target,
    terminalRatifiedTip: terminal,
    fetchImpl,
    token: '',
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'reviewed_pr_merge_provenance');
  assert.equal(result.successorChain.reason, 'reviewed_first_parent_successor_chain');
  assert.equal(result.successorChain.successorCount, 300);
});

test('deploy observer re-reads mutable main after the successor walk', async () => {
  let mainReads = 0;
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/branches/main')) {
      mainReads += 1;
      return response({ commit: { sha: mainReads === 1 ? SHA : OTHER } });
    }
    if (value.endsWith(`/commits/${SHA}/pulls`)) return response([pr()]);
    if (value.endsWith(`/commits/${SHA}`)) {
      return response({ sha: SHA, parents: [{ sha: TERMINAL_RATIFIED_MAIN_TIP }] });
    }
    return response({}, 404);
  };

  const result = await observeMainReleaseProvenance({
    repository: 'jussray/founder-control-room',
    targetSha: SHA,
    terminalRatifiedTip: TERMINAL_RATIFIED_MAIN_TIP,
    fetchImpl,
    token: '',
  });

  assert.equal(mainReads, 2);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale_target');
  assert.equal(result.currentMainSha, OTHER);
});

test('deploy ratification boundary stays bound to the extended ratification verifier', () => {
  const extension = readFileSync(new URL('./verify-main-release-ratification-extension.mjs', import.meta.url), 'utf8');
  assert.match(
    extension,
    new RegExp(`const INCIDENT_TIP = '${TERMINAL_RATIFIED_MAIN_TIP}'`),
  );
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
  assert.doesNotMatch(deploy, /^\s+actions:\s+(?:read|write)\s*$/m);
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
  assert.match(workflow, /verify-main-release-ratification-extension\.mjs > historical-ratification\.json/);
  assert.match(workflow, /git rev-list --reverse --first-parent "\$\{terminal_tip\}\.\.\$\{TARGET_SHA\}"/);
  assert.match(workflow, /SUCCESSOR_COMMITS_JSON/);
  assert.match(workflow, /TERMINAL_RATIFIED_TIP/);
});

test('main provenance workflow re-reads mutable main at the final decision boundary', () => {
  const workflow = readFileSync(new URL('../.github/workflows/main-release-provenance.yml', import.meta.url), 'utf8');
  const verifier = workflow.indexOf('- name: Verify release provenance against live GitHub state');
  const liveRead = workflow.indexOf('export CURRENT_MAIN_SHA="$(gh api', verifier);
  const classifier = workflow.indexOf('node scripts/verify-main-release-provenance.mjs', verifier);

  assert.ok(verifier >= 0, 'live provenance verifier step must exist');
  assert.ok(liveRead > verifier, 'verifier must re-read current main after successor observation');
  assert.ok(classifier > liveRead, 'classifier must consume the final current-main read');
});

test('main provenance workflow binds founder direct-main authority to trusted GitHub context', () => {
  const workflow = readFileSync(new URL('../.github/workflows/main-release-provenance.yml', import.meta.url), 'utf8');
  assert.match(workflow, /MAIN_RELEASE_EVENT_NAME: \$\{\{ github\.event_name \}\}/);
  assert.match(workflow, /MAIN_RELEASE_REF: \$\{\{ github\.ref \}\}/);
  assert.match(workflow, /MAIN_RELEASE_ACTOR: \$\{\{ github\.actor \}\}/);
  assert.match(workflow, /MAIN_RELEASE_REPOSITORY_OWNER: \$\{\{ github\.repository_owner \}\}/);
});
