import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  mergeAuthorityStateForDecision,
  resolveFounderMergeDecision,
} from '../scripts/founder-merge-approval.mjs';

const candidateWorkflow = fs.readFileSync('.github/workflows/control-room-test-ledger.yml', 'utf8');
const trustedWorkflow = fs.readFileSync('.github/workflows/founder-final-gate.yml', 'utf8');
const publisher = fs.readFileSync('scripts/publish-founder-final-gate.mjs', 'utf8');

const candidate = {
  repository: 'jussray/founder-control-room',
  prNumber: 815,
  baseSha: '1'.repeat(40),
  headSha: '2'.repeat(40),
};
const founder = {login: 'jussray', userId: 286642846};

function approvalComment({
  id,
  decision = 'approve',
  approvalId = `approval-${id}`,
  repository = candidate.repository,
  prNumber = candidate.prNumber,
  baseSha = candidate.baseSha,
  headSha = candidate.headSha,
  login = founder.login,
  userId = founder.userId,
  createdAt = '2026-09-15T02:00:00Z',
  updatedAt = createdAt,
} = {}) {
  return {
    id,
    html_url: `https://github.com/${candidate.repository}/pull/${candidate.prNumber}#issuecomment-${id}`,
    created_at: createdAt,
    updated_at: updatedAt,
    user: {login, id: userId},
    body: `<!-- fcr-founder-merge-approval:v1\n${JSON.stringify({
      repository,
      pull_request: prNumber,
      base_sha: baseSha,
      head_sha: headSha,
      decision,
      approval_id: approvalId,
    })}\n-->`,
  };
}

test('candidate-controlled ledger remains evidence-only and cannot emit the required founder-final context', () => {
  assert.match(candidateWorkflow, /name: Test-ledger source contract/);
  assert.match(candidateWorkflow, /name: Publish exact-head test ledger/);
  assert.doesNotMatch(candidateWorkflow, /name: Verify test-ledger contract/);
  assert.doesNotMatch(candidateWorkflow, /issues: read/);
  assert.doesNotMatch(candidateWorkflow, /Require exact founder merge approval/);
  assert.doesNotMatch(candidateWorkflow, /secrets\.APP_PRIVATE_KEY/);
});

test('trusted founder-final workflow runs only from default-branch issue comments under immutable founder identity', () => {
  assert.match(trustedWorkflow, /issue_comment:/);
  assert.match(trustedWorkflow, /github\.event\.issue\.pull_request != null/);
  assert.match(trustedWorkflow, /github\.event\.comment\.user\.id == 286642846/);
  assert.match(trustedWorkflow, /github\.event\.comment\.user\.login == 'jussray'/);
  assert.match(trustedWorkflow, /contains\(github\.event\.comment\.body, 'fcr-founder-merge-approval:v1'\)/);
  assert.match(trustedWorkflow, /test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(trustedWorkflow, /test "\$current_main" = "\$EXPECTED_TRUSTED_MAIN_SHA"/);
  assert.doesNotMatch(trustedWorkflow, /pull_request:/);
});

test('production App secrets are scoped only to the trusted publication step', () => {
  const marker = '      - name: Publish and read back trusted Founder Final Gate';
  const next = '      - name: Re-read trusted main after publication';
  const start = trustedWorkflow.indexOf(marker);
  const end = trustedWorkflow.indexOf(next, start);
  assert.ok(start >= 0 && end > start);
  const before = trustedWorkflow.slice(0, start);
  const step = trustedWorkflow.slice(start, end);
  const after = trustedWorkflow.slice(end);
  for (const mapping of [
    'GITHUB_APP_ID: ${{ secrets.APP_ID }}',
    'GITHUB_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}',
  ]) {
    assert.doesNotMatch(before, new RegExp(mapping.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(step.includes(mapping));
    assert.doesNotMatch(after, new RegExp(mapping.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(trustedWorkflow, /environment: production/);
});

test('trusted publisher preserves deterministic-review then Founder Final ordering', () => {
  assert.match(publisher, /produceDeterministicReview/);
  assert.match(publisher, /expectedReviewSignalName\(reviewReceipt\)/);
  assert.match(publisher, /FOUNDER_FINAL_TRUSTED_DETERMINISTIC_WITNESS_MISSING/);
  assert.match(publisher, /name: REQUIRED_GATE_NAME/);
  assert.match(publisher, /appId: '15368'/);
  assert.match(publisher, /const proofReadyMs = Math\.max/);
  assert.match(publisher, /if \(approvedAtMs < proofReadyMs\)/);
  assert.match(publisher, /FOUNDER_FINAL_APPROVAL_PRECEDES_PROOF_READY/);
  assert.match(publisher, /FOUNDER_FINAL_MAX_AGE_MS = 15 \* 60 \* 1000/);
});

test('trusted publisher re-reads exact candidate and blocks unresolved review threads', () => {
  assert.match(publisher, /assertNoUnresolvedReviewThreads/);
  assert.match(publisher, /FOUNDER_FINAL_UNRESOLVED_REVIEW_THREADS/);
  assert.match(publisher, /FOUNDER_FINAL_CANDIDATE_MOVED_BEFORE_PUBLICATION/);
  assert.match(publisher, /FOUNDER_FINAL_CANDIDATE_MOVED_AFTER_PUBLICATION/);
  assert.match(publisher, /provider\.resolveRef\(PROJECT_ID, 'main'\)/);
  assert.match(publisher, /provider\.getPullRequestReviewContext/);
});

test('trusted App publishes the fixed required context with exact provider readback but never merges', () => {
  assert.match(publisher, /FOUNDER_FINAL_CHECK_NAME = 'Verify test-ledger contract'/);
  assert.match(publisher, /name: FOUNDER_FINAL_CHECK_NAME/);
  assert.match(publisher, /conclusion: 'success'/);
  assert.match(publisher, /external_id: fingerprint/);
  assert.match(publisher, /String\(run\?\.app\?\.id \?\? ''\) === appId/);
  assert.match(publisher, /FOUNDER_FINAL_PROVIDER_READBACK_MISSING/);
  assert.doesNotMatch(publisher, /\.integrate\(/);
  assert.doesNotMatch(publisher, /merge_pull_request/);
  assert.match(publisher, /mergeExecutionAttempted: false/);
  assert.match(publisher, /providerRulesetMutationAttempted: false/);
});

test('exact unedited founder approval authorizes only its bound candidate', () => {
  const decision = resolveFounderMergeDecision(
    [approvalComment({id: 1001})],
    candidate,
    founder,
  );
  assert.equal(decision.status, 'approved');
  assert.equal(decision.approved, true);
  assert.equal(decision.sourceCommentId, '1001');
  assert.equal(decision.baseSha, candidate.baseSha);
  assert.equal(decision.headSha, candidate.headSha);
  assert.equal(mergeAuthorityStateForDecision(decision).authorizesMerge, true);
});

test('edited comments, wrong actor identity, and stale candidate receipts do not authorize', () => {
  const comments = [
    approvalComment({id: 1002, updatedAt: '2026-09-15T02:00:01Z'}),
    approvalComment({id: 1003, userId: 999}),
    approvalComment({id: 1004, headSha: '3'.repeat(40)}),
    approvalComment({id: 1005, baseSha: '4'.repeat(40)}),
  ];
  const decision = resolveFounderMergeDecision(comments, candidate, founder);
  assert.equal(decision.status, 'missing');
  assert.equal(decision.approved, false);
  assert.equal(mergeAuthorityStateForDecision(decision).authorizesMerge, false);
});

test('latest exact founder revoke supersedes earlier approve', () => {
  const decision = resolveFounderMergeDecision([
    approvalComment({id: 1006, decision: 'approve', createdAt: '2026-09-15T02:00:00Z'}),
    approvalComment({id: 1007, decision: 'revoke', createdAt: '2026-09-15T02:01:00Z'}),
  ], candidate, founder);
  assert.equal(decision.status, 'revoked');
  assert.equal(decision.approved, false);
  assert.equal(decision.sourceCommentId, '1007');
  assert.equal(mergeAuthorityStateForDecision(decision).mergeApproved, false);
});
