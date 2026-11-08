import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLedger, auditLedger, auditAllCommits } from './ci-history-audit.mjs';

const sha = 'a'.repeat(40);
const run = { id: 123, name: 'CI', head_sha: sha, conclusion: 'failure' };
const ledger = `| \`${sha}\` | CI (run 123) | failure | cause | fix | evidence | OPEN |`;

test('matches observed failed run to exact SHA, name, ID and conclusion', () => {
  assert.deepEqual(auditLedger(parseLedger(ledger), [run], sha), []);
});
test('missing failure is not silently green', () => {
  assert.match(auditLedger([], [run], sha)[0], /MISSING/);
});
test('mismatched outcome is rejected', () => {
  assert.ok(auditLedger(parseLedger(ledger.replace('| failure |', '| cancelled |')), [run], sha).some(e => e.includes('OUTCOME_MISMATCH')));
});
test('unverified ledger entry is rejected', () => {
  assert.ok(auditLedger(parseLedger(ledger), [], sha).some(e => e.includes('UNVERIFIED_RUN')));
});
test('a passing successor does not erase an earlier failure', () => {
  assert.deepEqual(auditLedger(parseLedger(ledger), [run, { id: 456, name: 'CI', head_sha: 'b'.repeat(40), conclusion: 'success' }], sha), []);
});

test('duplicate ledger run IDs fail closed', () => {
  assert.ok(auditLedger(parseLedger(ledger + '\n' + ledger), [run], sha).some(e => e.includes('DUPLICATE_RUN')));
});
test('malformed run IDs fail closed', () => {
  assert.ok(auditLedger(parseLedger(ledger.replace('run 123', 'run 0')), [run], sha).some(e => e.includes('MALFORMED_ENTRY')));
});

test('audits each PR commit independently and reports missing history', () => {
  const otherSha = 'b'.repeat(40);
  const history = [
    { sha, runs: [run] },
    { sha: otherSha, runs: [{ id: 999, name: 'Other', head_sha: otherSha, status: 'completed', conclusion: 'failure' }] }
  ];
  const result = auditAllCommits(parseLedger(ledger), history);
  assert.equal(result.report.length, 2);
  assert.ok(result.errors.some(e => e.includes('MISSING Other run 999')));
  assert.equal(result.report[0].failures, 1);
});

import { parseLedgerBase, auditBase, verifyRemediation } from './ci-history-audit.mjs';

const oldSha = 'c'.repeat(40);
const fixSha = 'd'.repeat(40);
const oldRun = { id: 500, name: 'Playwright e2e', head_sha: oldSha, conclusion: 'failure' };
const remediated = `| \`${oldSha}\` | Playwright e2e (run 500) | failure | screenshot | \`${fixSha}\` | later green | REMEDIATED |`;
const historyWith = (fixRuns) => [
  { sha: oldSha, runs: [oldRun] },
  { sha: fixSha, runs: fixRuns },
];

test('REMEDIATED row is accepted only with a later green run of the same check', () => {
  const ok = auditAllCommits(parseLedger(remediated), historyWith([{ id: 501, name: 'Playwright e2e', head_sha: fixSha, conclusion: 'success' }]));
  assert.equal(ok.errors.filter(e => e.includes('UNVERIFIED_REMEDIATION')).length, 0);
  assert.equal(ok.errors.filter(e => e.includes('MISSING')).length, 0);
});
test('REMEDIATED row without a green successor is rejected', () => {
  const bad = auditAllCommits(parseLedger(remediated), historyWith([{ id: 501, name: 'Playwright e2e', head_sha: fixSha, conclusion: 'failure' }]));
  assert.ok(bad.errors.some(e => e.includes('UNVERIFIED_REMEDIATION no successful')));
});
test('a successor that is not a later PR commit does not verify remediation', () => {
  const row = { sha: oldSha, runId: 500, name: 'Playwright e2e', candidate: fixSha, status: 'REMEDIATED' };
  const reversed = [{ sha: fixSha, runs: [{ id: 9, name: 'Playwright e2e', conclusion: 'success' }] }, { sha: oldSha, runs: [oldRun] }];
  assert.match(verifyRemediation(row, reversed, 1), /not a later PR commit/);
});
test('ledger bound to an old main is stale and fails closed', () => {
  const ledger = 'Base-bound: `' + 'a'.repeat(40) + '`';
  assert.equal(parseLedgerBase(ledger), 'a'.repeat(40));
  assert.deepEqual(auditBase('a'.repeat(40), 'a'.repeat(40)), []);
  assert.match(auditBase('a'.repeat(40), 'b'.repeat(40))[0], /STALE_BASE_BINDING/);
  assert.deepEqual(auditBase(undefined, 'b'.repeat(40)).length, 1);
  assert.deepEqual(auditBase('a'.repeat(40), undefined), ['LIVE_BASE_UNKNOWN']);
});
