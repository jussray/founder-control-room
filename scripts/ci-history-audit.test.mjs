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
