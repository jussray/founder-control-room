import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLedger, auditLedger, auditAllCommits, classifyLedgerIntegrity } from './ci-history-audit.mjs';

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

test('recorded historical failures remain visible even with a passing current head', () => {
  const newerSha = 'b'.repeat(40);
  const history = [
    { sha, runs: [{ ...run, status: 'completed' }] },
    { sha: newerSha, runs: [{ id: 456, name: 'CI', head_sha: newerSha, status: 'completed', conclusion: 'success' }] },
  ];
  const result = auditAllCommits(parseLedger(ledger), history);
  assert.deepEqual(result.errors, []);
  assert.equal(result.report[0].observation, 'RED_OBSERVED');
  assert.equal(result.summary.currentHeadSha, newerSha);
  assert.equal(result.summary.currentHeadObservation, 'ALL_OBSERVED_RUNS_SUCCESS');
  assert.equal(result.summary.historicalRedCommitCount, 1);
  assert.deepEqual(result.summary.historicalRedRuns, [{
    sha, id: 123, name: 'CI', conclusion: 'failure', ledgerRecorded: true,
  }]);
  assert.equal(result.summary.requiredCheckReadinessProven, false);
});

test('missing historical red outcome remains both visible and a ledger error', () => {
  const newerSha = 'b'.repeat(40);
  const result = auditAllCommits([], [
    { sha, runs: [{ ...run, status: 'completed' }] },
    { sha: newerSha, runs: [{ id: 456, name: 'CI', head_sha: newerSha, status: 'completed', conclusion: 'success' }] },
  ]);
  assert.equal(result.summary.historicalRedRuns[0].ledgerRecorded, false);
  assert.ok(result.errors.some(error => error.includes('MISSING CI run 123')));
});

test('unknown or pending current head never looks successful', () => {
  const missing = auditAllCommits([], [{ sha, runs: [] }]);
  assert.equal(missing.summary.currentHeadObservation, 'UNKNOWN_NO_RUNS');
  const pending = auditAllCommits([], [{
    sha, runs: [{ id: 5, name: 'CI', head_sha: sha, status: 'queued', conclusion: null }],
  }]);
  assert.equal(pending.summary.currentHeadObservation, 'PENDING_OBSERVED');
  const skipped = auditAllCommits([], [{
    sha, runs: [{ id: 6, name: 'CI', head_sha: sha, status: 'completed', conclusion: 'skipped' }],
  }]);
  assert.equal(skipped.summary.currentHeadObservation, 'NON_SUCCESS_UNVERIFIED');
});

test('duplicate PR commit identities are rejected as untrustworthy history', () => {
  const result = auditAllCommits([], [{ sha, runs: [] }, { sha, runs: [] }]);
  assert.ok(result.errors.some(error => error.includes('INVALID_OR_DUPLICATE_COMMIT_SHA')));
});

test('untriaged historical reds are not lost or misclassified as repaired', () => {
  const result = auditAllCommits([], [{ sha, runs: [{ ...run, status: 'completed' }] }]);
  const check = classifyLedgerIntegrity(result.errors);
  assert.equal(check.untriaged.length, 1);
  assert.equal(check.invalid.length, 0);
  assert.equal(result.summary.manualLedgerComplete, false);
  assert.equal(result.summary.requiredCheckReadinessProven, false);
  assert.equal(result.summary.productionReadinessProven, false);
});

test('fabricated or contradictory manual ledger claims remain integrity failures', () => {
  const result = auditAllCommits(parseLedger(ledger.replace('| failure |', '| cancelled |')), [
    { sha, runs: [{ ...run, status: 'completed' }] },
  ]);
  const check = classifyLedgerIntegrity(result.errors);
  assert.ok(check.invalid.some(entry => entry.includes('OUTCOME_MISMATCH')));
  assert.ok(check.invalid.some(entry => entry.includes('EVIDENCE_MISMATCH')));
});
