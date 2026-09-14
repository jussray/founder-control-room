import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { classifyMainReleaseProvenance } from './verify-main-release-provenance.mjs';
import {
  classifyTrustedMainReleaseProvenanceRun,
  observeMainReleaseProvenance,
  shouldEnforceMainReleaseProvenance,
} from './verify-production-migration-ledger.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

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

test('observes durable owner-direct provenance when no reviewed PR exists', async () => {
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.endsWith('/branches/main')) return response({ commit: { sha: SHA } });
    if (href.endsWith(`/commits/${SHA}/pulls`)) return response([]);
    if (href.includes('/actions/runs?')) return response({ workflow_runs: [provenanceRun()] });
    return response({}, 404);
  };

  const result = await observeMainReleaseProvenance({
    repository: 'jussray/founder-control-room',
    targetSha: SHA,
    fetchImpl,
    token: '',
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'verified_main_release_provenance_workflow');
  assert.equal(result.workflowRunId, 123456);
  assert.equal(result.reviewedProvenanceReason, 'direct_or_unproven_main_commit');
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
  assert.match(deploy, /permissions:\n\s+contents: read\n\s+pull-requests: read\n\s+actions: read/);
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

test('main provenance workflow binds founder direct-main authority to trusted GitHub context', () => {
  const workflow = readFileSync(new URL('../.github/workflows/main-release-provenance.yml', import.meta.url), 'utf8');
  assert.match(workflow, /MAIN_RELEASE_EVENT_NAME: \$\{\{ github\.event_name \}\}/);
  assert.match(workflow, /MAIN_RELEASE_REF: \$\{\{ github\.ref \}\}/);
  assert.match(workflow, /MAIN_RELEASE_ACTOR: \$\{\{ github\.actor \}\}/);
  assert.match(workflow, /MAIN_RELEASE_REPOSITORY_OWNER: \$\{\{ github\.repository_owner \}\}/);
});
