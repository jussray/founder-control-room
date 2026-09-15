import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  mergeAuthorityStateForDecision,
  resolveFounderMergeDecision,
} from '../scripts/founder-merge-approval.mjs';

const workflow = fs.readFileSync('.github/workflows/control-room-test-ledger.yml', 'utf8');
const continuityWorkflow = fs.readFileSync('.github/workflows/pr-continuity.yml', 'utf8');
const continuitySource = fs.readFileSync('scripts/pr-continuity.mjs', 'utf8');

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

test('required test-ledger context owns terminal exact-head observation', () => {
  assert.match(workflow, /ledger-contract:\n\s+name: Verify test-ledger contract/);
  assert.match(workflow, /CONTROL_ROOM_LEDGER_SELF_CHECK: Verify test-ledger contract/);
  assert.match(workflow, /- name: Observe every exact-head check lane/);
  assert.match(workflow, /- name: Require stable exact-head ledger/);
  assert.match(workflow, /observerState !== 'stable'/);
  assert.match(workflow, /\['failed', 'queued', 'running', 'unknown'\]/);
  assert.match(workflow, /check\?\.name === 'Required Gate' && check\?\.state === 'passed'/);
  assert.doesNotMatch(workflow, /\n\s+publish-ledger:/);
});

test('required ledger gate validates exact founder authority without PR metadata write', () => {
  assert.match(workflow, /issues: read/);
  assert.doesNotMatch(workflow, /pull-requests: write/);
  assert.match(workflow, /- name: Require exact founder merge approval/);
  assert.match(workflow, /FOUNDER_GITHUB_LOGIN: jussray/);
  assert.match(workflow, /FOUNDER_GITHUB_USER_ID: '286642846'/);
  assert.match(workflow, /resolveFounderMergeDecision/);
  assert.match(workflow, /if \(!decision\.approved\)/);
  assert.match(workflow, /authorizesMerge: true/);
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

test('PR Continuity owns approval metadata and reads the same founder decision source', () => {
  assert.match(continuityWorkflow, /issues: read/);
  assert.match(continuitySource, /resolveFounderMergeDecision/);
  assert.match(continuitySource, /mergeAuthorityStateForDecision/);
  assert.match(continuitySource, /listIssueComments/);
  assert.match(continuitySource, /mergeApprovalId/);
  assert.match(continuitySource, /mergeApprovalComment/);
});

test('approval evidence is emitted as a separate receipt', () => {
  assert.match(workflow, /FOUNDER_MERGE_APPROVAL_PATH: artifacts\/founder-merge-approval\.json/);
  assert.match(workflow, /artifacts\/control-room-test-ledger\.json/);
  assert.match(workflow, /artifacts\/founder-merge-approval\.json/);
  assert.match(workflow, /if-no-files-found: warn/);
});
