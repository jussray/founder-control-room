import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyMainReleaseProvenance } from './verify-main-release-provenance.mjs';

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
