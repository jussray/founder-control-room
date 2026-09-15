import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { continuityBlock } from '../scripts/pr-continuity.mjs';

const repo = 'jussray/example';
const continuitySource = readFileSync(new URL('../scripts/pr-continuity.mjs', import.meta.url), 'utf8');
const workflowSource = readFileSync(new URL('../.github/workflows/pr-continuity.yml', import.meta.url), 'utf8');

function continuityValue(overrides = {}) {
  return {
    repository: repo,
    prNumber: 1,
    rootBaseRef: 'main',
    rootBaseSha: '1'.repeat(40),
    baseRef: 'main',
    baseSha: '1'.repeat(40),
    headRef: 'feature',
    headSha: '2'.repeat(40),
    continuityState: 'CURRENT',
    proofState: 'EXACT_HEAD_PROOF_SEPARATE',
    ...overrides,
  };
}

test('exact founder approval renders authorizing continuity only with provenance', () => {
  const block = continuityBlock(continuityValue({
    mergeApproved: true,
    mergeApprovalId: 'approval-exact-815',
    mergeApprovalComment: '5678901234',
  }));
  assert.match(block, /merge_approved: \*\*true\*\*/);
  assert.match(block, /merge_approval_id: `approval-exact-815`/);
  assert.match(block, /merge_approval_comment: `5678901234`/);
  assert.match(block, /authorizes_merge: \*\*true\*\*/);
  assert.match(block, /deploy_authority: \*\*false\*\*/);
});

test('approval boolean without provenance remains fail-closed', () => {
  const block = continuityBlock(continuityValue({mergeApproved: true}));
  assert.match(block, /merge_approved: \*\*false\*\*/);
  assert.match(block, /authorizes_merge: \*\*false\*\*/);
  assert.doesNotMatch(block, /merge_approval_id:/);
});

test('current continuity resolves founder comments while stale paths retain non-authorizing state', () => {
  assert.match(continuitySource, /async function currentMergeState/);
  assert.match(continuitySource, /resolveFounderMergeDecision/);
  assert.match(continuitySource, /state === 'CURRENT'/);
  assert.match(continuitySource, /nonAuthorizingMergeState/);
});

test('all continuity jobs receive read-only access to approval comments', () => {
  const matches = workflowSource.match(/issues: read/g) || [];
  assert.equal(matches.length, 3);
});
