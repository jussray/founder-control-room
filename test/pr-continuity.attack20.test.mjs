import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  START_MARKER,
  END_MARKER,
  SCHEMA,
  isCurrentCompareStatus,
  classifyCompareStatus,
  assertExpectedHead,
  isStackedUpdateUnsupported,
  classifyUpdateBranchFailure,
  replaceManagedBlock,
  continuityBlock,
  collectRolloverOrder,
  sameRepositoryPull,
} from '../scripts/pr-continuity.mjs';

const repo = 'jussray/example';
const baseRepo = { full_name: repo };
const continuitySource = readFileSync(new URL('../scripts/pr-continuity.mjs', import.meta.url), 'utf8');

function pr(number, baseRef, headRef, state = 'open', headRepo = baseRepo) {
  return { number, state, base: { ref: baseRef, repo: baseRepo }, head: { ref: headRef, repo: headRepo } };
}

test('AT01 identical base/head is current ancestry', () => assert.equal(isCurrentCompareStatus('identical'), true));
test('AT02 ahead head is current ancestry', () => assert.equal(isCurrentCompareStatus('ahead'), true));
test('AT03 behind head fails stale', () => assert.equal(classifyCompareStatus('behind'), 'STALE_BASE'));
test('AT04 diverged head fails stale', () => assert.equal(classifyCompareStatus('diverged'), 'STALE_BASE'));
test('AT05 unknown compare status blocks', () => assert.equal(classifyCompareStatus('mystery'), 'BLOCKED_UNKNOWN_COMPARE'));
test('AT06 expected head mismatch fails', () => assert.throws(() => assertExpectedHead('a'.repeat(40), 'b'.repeat(40)), /HEAD_MOVED/));
test('AT07 exact head match passes', () => assert.equal(assertExpectedHead('a'.repeat(40), 'a'.repeat(40)), true));
test('AT08 fork pull is not same-repository authority', () => assert.equal(sameRepositoryPull(pr(1, 'main', 'fork', 'open', { full_name: 'other/repo' }), repo), false));
test('AT09 same-repo pull qualifies', () => assert.equal(sameRepositoryPull(pr(1, 'main', 'feature'), repo), true));
test('AT10 managed current truth is prepended ahead of human prose', () => {
  const block = `${START_MARKER}\nreceipt\n${END_MARKER}`;
  const next = replaceManagedBlock('Human scope', block);
  assert.equal(next.startsWith(block), true);
  assert.ok(next.indexOf('Human scope') > next.indexOf(END_MARKER));
});
test('AT11 refresh relocates managed truth to the top while preserving human prose order', () => {
  const body = `Before\n\n${START_MARKER}\nold\n${END_MARKER}\n\nAfter`;
  const block = `${START_MARKER}\nnew\n${END_MARKER}`;
  const next = replaceManagedBlock(body, block);
  assert.equal(next.startsWith(block), true);
  assert.doesNotMatch(next, /old/);
  assert.match(next, /Before\n\nAfter/);
  assert.ok(next.indexOf('Before') > next.indexOf(END_MARKER));
});
test('AT12 duplicate markers block metadata mutation', () => assert.throws(() => replaceManagedBlock(`${START_MARKER}${START_MARKER}${END_MARKER}`, 'x'), /MALFORMED/));
test('AT13 orphan start marker blocks', () => assert.throws(() => replaceManagedBlock(`${START_MARKER}x`, 'x'), /MALFORMED/));
test('AT14 orphan end marker blocks', () => assert.throws(() => replaceManagedBlock(`x${END_MARKER}`, 'x'), /MALFORMED/));
test('AT15 proof subject equals live head', () => {
  const block = continuityBlock({ repository: repo, prNumber: 7, rootBaseRef: 'main', rootBaseSha: '1'.repeat(40), baseRef: 'main', baseSha: '1'.repeat(40), headRef: 'feature', headSha: '2'.repeat(40), continuityState: 'CURRENT', proofState: 'EXACT_HEAD_PROOF_SEPARATE' });
  assert.ok(block.includes(`proof_subject: \`${'2'.repeat(40)}\``));
  assert.match(block, /MACHINE CURRENT TRUTH/);
});
test('AT16 receipt exposes merge authority while denying candidate approval and execution', () => {
  const block = continuityBlock({ repository: repo, prNumber: 1, rootBaseRef: 'main', rootBaseSha: '1', baseRef: 'main', baseSha: '1', headRef: 'x', headSha: '2', continuityState: 'CURRENT', proofState: 'SEPARATE' });
  assert.match(block, /merge_authority: \*\*true\*\*/);
  assert.match(block, /merge_approval: \*\*REQUIRED_EXACT_CANDIDATE\*\*/);
  assert.match(block, /merge_approved: \*\*false\*\*/);
  assert.match(block, /authorizes_merge: \*\*false\*\*/);
  assert.match(block, /must not execute/);
});
test('AT17 receipt explicitly denies deploy authority', () => assert.match(continuityBlock({ repository: repo, prNumber: 1, rootBaseRef: 'main', rootBaseSha: '1', baseRef: 'main', baseSha: '1', headRef: 'x', headSha: '2', continuityState: 'CURRENT', proofState: 'SEPARATE' }), /deploy_authority: \*\*false\*\*/));
test('AT18 stacked dependency graph rolls parent before child', () => assert.deepEqual(collectRolloverOrder([pr(10, 'main', 'parent'), pr(11, 'parent', 'child')]), [10, 11]));
test('AT19 unrelated stack is excluded', () => assert.deepEqual(collectRolloverOrder([pr(10, 'other', 'child')]), []));
test('AT20 cyclic malformed stack terminates once per pull', () => assert.deepEqual(collectRolloverOrder([pr(1, 'main', 'a'), pr(2, 'a', 'main')]), [1, 2]));
test('AT21 continuity compares against the live base ref instead of the PR snapshot SHA', () => {
  assert.match(continuitySource, /branchSha\(repository, pr\.base\.ref\)/);
  assert.doesNotMatch(continuitySource, /compare\(repository, pr\.base\.sha, pr\.head\.sha\)/);
  assert.doesNotMatch(continuitySource, /baseSha:\s*pr\.base\.sha/);
});
test('AT22 continuity CLI actually invokes audit metadata or rollover', () => {
  assert.match(continuitySource, /const mode = process\.argv\[2\]/);
  assert.match(continuitySource, /if \(mode === 'audit'\) return auditMode\(\)/);
  assert.match(continuitySource, /if \(mode === 'metadata'\) return metadataMode\(\)/);
  assert.match(continuitySource, /if \(mode === 'rollover'\) return rolloverMode\(\)/);
  assert.match(continuitySource, /main\(\)\.catch/);
});
test('AT23 exact stacked update-branch refusal is classified fail-closed', () => {
  assert.equal(isStackedUpdateUnsupported(403, "Updating a stacked PR's branch via this endpoint is not supported."), true);
  const failure = classifyUpdateBranchFailure(403, "Updating a stacked PR's branch via this endpoint is not supported.");
  assert.equal(failure.state, 'BLOCKED_STACK_REBASE_REQUIRED');
  assert.deepEqual(failure.failureReceipts.map((receipt) => receipt.code), ['STACKED_UPDATE_UNSUPPORTED']);
});
test('AT24 unrelated provider 403 is not reclassified as a stack condition', () => {
  assert.equal(isStackedUpdateUnsupported(403, 'Resource not accessible by integration'), false);
  const failure = classifyUpdateBranchFailure(403, 'Resource not accessible by integration');
  assert.equal(failure.state, 'BLOCKED_PROVIDER_FORBIDDEN');
  assert.deepEqual(failure.failureReceipts.map((receipt) => receipt.code), ['PROVIDER_FORBIDDEN']);
});
test('AT25 stacked provider refusal becomes an explicit blocked receipt path', () => {
  assert.match(continuitySource, /allow: \[202, 403, 422\]/);
  assert.match(continuitySource, /BLOCKED_STACK_REBASE_REQUIRED/);
  assert.match(continuitySource, /failureReceipts/);
  assert.match(continuitySource, /providerMessage: update\.payload\?\.message \|\| null/);
});
test('AT26 JSON receipts keep merge capability separate from merge execution authorization', () => {
  assert.match(continuitySource, /mergeAuthorityAvailable: true/);
  assert.match(continuitySource, /mergeApprovalRequired: true/);
  assert.match(continuitySource, /mergeApproved: false/);
  assert.match(continuitySource, /authorizesMerge: false/);
});
test('AT27 repository rules keep each provider violation as a separate failure receipt', () => {
  const failure = classifyUpdateBranchFailure(422, 'Repository rule violations found\n\nChanges must be made through a pull request.\n\nRequired status check "Required Gate" is expected.\n\nWaiting for Code Scanning results. Code Scanning may not be configured for the target branch.\n');
  assert.equal(failure.state, 'BLOCKED_REPOSITORY_RULES');
  assert.deepEqual(failure.failureReceipts.map((receipt) => receipt.code), [
    'CHANGES_REQUIRE_PULL_REQUEST',
    'REQUIRED_STATUS_CHECK_EXPECTED',
    'CODE_SCANNING_PENDING_OR_UNCONFIGURED',
  ]);
  assert.equal(failure.failureReceipts[1].checkName, 'Required Gate');
});
test('AT28 merge conflicts are not collapsed into repository-rule blockers', () => {
  const failure = classifyUpdateBranchFailure(422, 'merge conflict between base and head');
  assert.equal(failure.state, 'BLOCKED_MERGE_CONFLICT');
  assert.deepEqual(failure.failureReceipts.map((receipt) => receipt.code), ['MERGE_CONFLICT']);
});
test('AT29 unknown 422 rejection keeps a separate provider-rejected receipt', () => {
  const failure = classifyUpdateBranchFailure(422, 'Validation Failed');
  assert.equal(failure.state, 'BLOCKED_PROVIDER_REJECTED');
  assert.deepEqual(failure.failureReceipts.map((receipt) => receipt.code), ['PROVIDER_UPDATE_REJECTED']);
});
test('AT30 rollover aggregate preserves per-state and per-failure receipt fields', () => {
  assert.match(continuitySource, /blockedByState/);
  assert.match(continuitySource, /failureReceiptCount/);
  assert.match(continuitySource, /failureReceipts/);
  assert.match(continuitySource, /receiptId: `pr-\$\{number\}:\$\{receipt\.code\}`/);
});
test('schema remains stable', () => assert.equal(SCHEMA, 'juss/pr-continuity@v1'));


// Skipped jobs must stay scoped to their actual events. These tests are
// adversarial guardrails, not evidence that a skipped production job executed.
function skipPolicyJob(source, name) {
  const marker = '\n  ' + name + ':\n';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'Missing job ' + name);
  const tail = source.slice(start + marker.length);
  const next = tail.search(/\n  [a-zA-Z_][a-zA-Z0-9_-]*:\s*\n/);
  return next === -1 ? tail : tail.slice(0, next);
}
function skipPolicyWorkflow(name) {
  return readFileSync(new URL('../.github/workflows/' + name, import.meta.url), 'utf8');
}
test('CI-SKIP FCR01 PR audit and privileged metadata remain event-separated', () => {
  const source = skipPolicyWorkflow('pr-continuity.yml');
  const audit = skipPolicyJob(source, 'exact-head-audit');
  const metadata = skipPolicyJob(source, 'metadata-receipt');
  assert.match(audit, /if: github\.event_name == 'pull_request'/);
  assert.match(audit, /ref:.*github\.event\.pull_request\.head\.sha/);
  assert.match(metadata, /if: github\.event_name == 'pull_request_target'/);
  assert.match(metadata, /ref:.*github\.sha/);
  assert.doesNotMatch(metadata, /ref:.*github\.event\.pull_request\.head\.sha/);
});
test('CI-SKIP FCR02 rollover remains restricted to main push or dispatch', () => {
  const rollover = skipPolicyJob(skipPolicyWorkflow('pr-continuity.yml'), 'rollover');
  assert.match(rollover, /if: github\.ref == 'refs\/heads\/main' && \(github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'push'\)/);
});
test('CI-SKIP FCR03 production Playwright is triggered only after approved main deploy', () => {
  const workflow = skipPolicyWorkflow('playwright.yml');
  assert.match(skipPolicyJob(workflow, 'playwright'), /if: github\.event_name != 'workflow_run'/);
  const production = skipPolicyJob(workflow, 'production-release-witness');
  assert.match(production, /github\.event_name == 'workflow_run'/);
  assert.match(production, /github\.event\.workflow_run\.event == 'workflow_dispatch'/);
  assert.match(production, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(production, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(production, /environment: production/);
});
test('CI-SKIP FCR04 Neon cleanup is close-only and limited to same-repo PRs', () => {
  const workflow = skipPolicyWorkflow('neon-pr-branches.yml');
  const create = skipPolicyJob(workflow, 'create_neon_branch');
  const cleanup = skipPolicyJob(workflow, 'delete_neon_branch');
  assert.match(create, /github\.event\.action == 'opened'/);
  assert.match(create, /github\.event\.action == 'synchronize'/);
  assert.match(cleanup, /github\.event\.action == 'closed'/);
  assert.match(cleanup, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
});
test('CI-SKIP FCR05 release contract runs on PR and provenance is restricted', () => {
  const workflow = skipPolicyWorkflow('main-release-provenance.yml');
  assert.match(skipPolicyJob(workflow, 'contract'), /node --test scripts\/verify-main-release-provenance\.node-test\.mjs/);
  const provenance = skipPolicyJob(workflow, 'provenance');
  assert.match(provenance, /github\.event_name != 'pull_request'/);
  assert.match(provenance, /needs: contract/);
});
test('CI-SKIP FCR06 unsafe metadata broadening is detected', () => {
  const source = skipPolicyWorkflow('pr-continuity.yml');
  const tampered = source.replace("if: github.event_name == 'pull_request_target'", 'if: always()');
  assert.notEqual(tampered, source);
  assert.doesNotMatch(skipPolicyJob(tampered, 'metadata-receipt'), /if: github\.event_name == 'pull_request_target'/);
});
