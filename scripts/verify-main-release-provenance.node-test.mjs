import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { classifyMainReleaseProvenance } from './verify-main-release-provenance.mjs';
import {
  buildReceipt,
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

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test('accepts exactly one merged PR as provenance without claiming review, merge authorization, or production migration outcome', () => {
  assert.deepEqual(classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [pr()],
  }), {
    ok: true,
    reason: 'pr_merge_provenance',
    evidenceScope: 'pr_merge_only',
    reviewAuthority: 'not_evaluated',
    mergeAuthorization: 'not_evaluated',
    productionMigrationOutcome: 'not_evaluated',
    supabaseGitHubCheckAuthority: 'non_authoritative',
    requiredProductionMigrationEvidence: 'canonical_deploy_remote_migration_ledger',
    targetSha: SHA,
    pullRequestNumber: 42,
    mergedAt: '2026-08-25T12:00:00Z',
  });
});

test('PR association cannot impersonate reviewed provenance or provider migration outcome', () => {
  const result = classifyMainReleaseProvenance({
    targetSha: SHA,
    currentMainSha: SHA,
    associatedPulls: [pr()],
  });

  assert.equal(result.ok, true);
  assert.notEqual(result.reason, 'reviewed_pr_merge_provenance');
  assert.equal(result.reviewAuthority, 'not_evaluated');
  assert.equal(result.mergeAuthorization, 'not_evaluated');
  assert.equal(result.productionMigrationOutcome, 'not_evaluated');
  assert.equal(result.supabaseGitHubCheckAuthority, 'non_authoritative');
  assert.equal(result.requiredProductionMigrationEvidence, 'canonical_deploy_remote_migration_ledger');
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

test('provider observation preserves provenance-only scope for merged PRs', async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith('/branches/main')) return response({ commit: { sha: SHA } });
    if (String(url).endsWith(`/commits/${SHA}/pulls`)) return response([pr()]);
    return response({}, 404);
  };

  const result = await observeMainReleaseProvenance({
    repository: 'jussray/founder-control-room',
    targetSha: SHA,
    fetchImpl,
    token: '',
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'pr_merge_provenance');
  assert.equal(result.reviewAuthority, 'not_evaluated');
  assert.equal(result.mergeAuthorization, 'not_evaluated');
  assert.equal(result.productionMigrationOutcome, 'not_evaluated');
  assert.equal(result.supabaseGitHubCheckAuthority, 'non_authoritative');
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

test('preflight migration ledger is evidence for safety but not production outcome', () => {
  const receipt = buildReceipt({
    phase: 'preflight',
    localVersions: ['20260809072500', '20260907164500'],
    remoteVersions: ['20260809072500'],
    requiredVersions: ['20260809072500'],
    remoteListSource: 'migration-ledger-before.txt',
  });

  assert.deepEqual(receipt.productionMigrationEvidence, {
    authority: 'preflight_only',
    outcome: 'not_evaluated',
    supabaseGitHubCheckAcceptedAsOutcomeProof: false,
  });
  assert.deepEqual(receipt.localOnly, ['20260907164500']);
});

test('post-push remote migration ledger is the authoritative production migration outcome', () => {
  const receipt = buildReceipt({
    phase: 'post-push',
    localVersions: ['20260809072500', '20260907164500'],
    remoteVersions: ['20260809072500', '20260907164500'],
    requiredVersions: ['20260809072500'],
    remoteListSource: 'migration-ledger-after.txt',
  });

  assert.deepEqual(receipt.productionMigrationEvidence, {
    authority: 'remote_migration_ledger',
    outcome: 'verified',
    supabaseGitHubCheckAcceptedAsOutcomeProof: false,
  });
});

test('post-push ledger refuses VERIFIED while any local migration is absent remotely', () => {
  const receipt = buildReceipt({
    phase: 'post-push',
    localVersions: ['20260809072500', '20260907164500'],
    remoteVersions: ['20260809072500'],
    requiredVersions: ['20260809072500'],
    remoteListSource: 'migration-ledger-after.txt',
  });

  assert.equal(receipt.productionMigrationEvidence.authority, 'remote_migration_ledger');
  assert.equal(receipt.productionMigrationEvidence.outcome, 'blocked');
  assert.deepEqual(receipt.localOnly, ['20260907164500']);
});

test('preflight verifier is load-bearing before the first production mutation', () => {
  const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const preflight = deploy.indexOf('MIGRATION_LEDGER_PHASE: preflight');
  const verifier = deploy.indexOf('node scripts/verify-production-migration-ledger.mjs', preflight);
  const mutationStep = deploy.indexOf('- name: Push migrations', verifier);
  const mutationYes = deploy.indexOf('--yes', mutationStep);
  const postPush = deploy.indexOf('- name: Verify post-push migration ledger', mutationStep);
  const postPushPhase = deploy.indexOf('MIGRATION_LEDGER_PHASE: post-push', postPush);
  const postPushVerifier = deploy.indexOf('node scripts/verify-production-migration-ledger.mjs', postPushPhase);
  const worker = deploy.indexOf('worker-deploy:');
  const workerDependency = deploy.indexOf('needs: supabase-migrate', worker);
  const pages = deploy.indexOf('pages-release:');
  const pagesDependency = deploy.indexOf('needs: worker-deploy', pages);

  assert.ok(preflight >= 0, 'preflight phase must exist');
  assert.ok(verifier > preflight, 'preflight verifier must execute in the preflight step');
  assert.ok(mutationStep > verifier, 'Supabase mutation step must remain downstream of provenance enforcement');
  assert.ok(mutationYes > mutationStep, 'Supabase mutation step must remain an acknowledged --yes mutation');
  assert.ok(postPush > mutationYes, 'post-push provider readback must remain downstream of the mutation');
  assert.ok(postPushPhase > postPush, 'post-push receipt must be explicitly typed as post-push');
  assert.ok(postPushVerifier > postPushPhase, 'post-push remote ledger must run through the canonical verifier');
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
