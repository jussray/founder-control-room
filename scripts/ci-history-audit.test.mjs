import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLedger, auditLedger, auditAllCommits, classifyHistoricalCoverage, parseLedgerBase, parseLedgerPr, auditRecordedRows, auditBase, verifyRemediation } from './ci-history-audit.mjs';

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

test('a cancelled run is superseded by a later green run of the same check', () => {
  const oldCancelled = { id: 700, name: 'CI', head_sha: oldSha, conclusion: 'cancelled' };
  const history = [
    { sha: oldSha, runs: [oldCancelled] },
    { sha: fixSha, runs: [{ id: 701, name: 'CI', head_sha: fixSha, conclusion: 'success' }] },
  ];
  const result = auditAllCommits([], history);
  assert.equal(result.errors.length, 0);
});
test('a cancelled run without a later green run stays an error', () => {
  const oldCancelled = { id: 700, name: 'CI', head_sha: oldSha, conclusion: 'cancelled' };
  const result = auditAllCommits([], [{ sha: oldSha, runs: [oldCancelled] }, { sha: fixSha, runs: [] }]);
  assert.ok(result.errors.some(e => e.includes('run 700 (cancelled)')));
});
test('a failed run is never superseded automatically', () => {
  const oldFailed = { id: 800, name: 'CI', head_sha: oldSha, conclusion: 'failure' };
  const result = auditAllCommits([], [{ sha: oldSha, runs: [oldFailed] }, { sha: fixSha, runs: [{ id: 801, name: 'CI', head_sha: fixSha, conclusion: 'success' }] }]);
  assert.ok(result.errors.some(e => e.includes('run 800 (failure)')));
});

test('late predecessor cancellations remain explicit incomplete evidence, without recursive CI failure', () => {
  const missing = '75f4454880a0 MISSING Playwright E2E run 42441738210 (cancelled)';
  const failure = '298b01781289 MISSING Historical CI Accountability run 42441917581 (failure)';
  const result = classifyHistoricalCoverage([missing, failure]);
  assert.equal(result.state, 'INCOMPLETE_HISTORICAL_COVERAGE');
  assert.equal(result.complete, false);
  assert.deepEqual(result.unrecorded, [missing, failure]);
  assert.deepEqual(result.integrityErrors, []);
  assert.equal(result.authorizesMerge, false);
  assert.equal(result.authorizesDeployment, false);
});
test('fabricated or contradicted recorded evidence remains a hard failure', () => {
  const missing = '75f4454880a0 MISSING CI run 42441738160 (cancelled)';
  const mismatch = '75f4454880a0 OUTCOME_MISMATCH 42441738160';
  const forged = '75f4454880a0 UNVERIFIED_RUN 999999';
  const result = classifyHistoricalCoverage([missing, mismatch, forged]);
  assert.equal(result.state, 'INVALID_EVIDENCE');
  assert.deepEqual(result.integrityErrors, [mismatch, forged]);
  assert.deepEqual(result.unrecorded, [missing]);
  assert.equal(result.complete, false);
});
test('only exact missing-conclusion format qualifies for deferred observation', () => {
  const bad = ['SHA MISSING broken', 'SHA MISSING CI run 0 (failure)', 'SHA MISSING CI run 42 (success)'];
  const result = classifyHistoricalCoverage(bad);
  assert.equal(result.state, 'INVALID_EVIDENCE');
  assert.deepEqual(result.integrityErrors, bad);
});
test('a fully verified historical snapshot is reconciled but never a release grant', () => {
  const r = classifyHistoricalCoverage([]);
  assert.equal(r.state, 'RECONCILED_SNAPSHOT');
  assert.equal(r.complete, true);
  assert.equal(r.authorizesMerge, false);
  assert.equal(r.authorizesDeployment, false);
});


test('historical ledger identifies its owning PR instead of borrowing another PR history', () => {
  const historical = '# Historical CI accountability — PR #1071\n\nBase-bound: \`' + sha + '\`';
  assert.equal(parseLedgerPr(historical), 1071);
  assert.notEqual(parseLedgerPr(historical), 779);
  assert.equal(parseLedgerPr('Unowned historical ledger'), null);
  assert.equal(parseLedgerPr('# Historical CI accountability — PR #0'), null);
});

test('all recorded rows are structurally checked even when the current PR is not the ledger owner', () => {
  assert.deepEqual(auditRecordedRows(parseLedger(ledger)), []);
  const duplicate = parseLedger(ledger + '\n' + ledger);
  assert.ok(auditRecordedRows(duplicate).some(e => e.includes('DUPLICATE_RUN')));
  const badStatus = parseLedger(ledger.replace('| OPEN |', '| FALSE_GREEN |'));
  assert.ok(auditRecordedRows(badStatus).some(e => e.includes('INVALID_STATUS')));
  const badOutcome = parseLedger(ledger.replace('| failure |', '| success |'));
  assert.ok(auditRecordedRows(badOutcome).some(e => e.includes('INVALID_OUTCOME')));
  const noCorrection = parseLedger(ledger.replace('| OPEN |', '| REMEDIATED |'));
  assert.ok(auditRecordedRows(noCorrection).some(e => e.includes('UNVERIFIED_REMEDIATION')));
});

test('an unrelated PR cannot make a stale ledger base current or claim reconciliation', () => {
  const ledgerBase = 'a'.repeat(40);
  const currentBase = 'b'.repeat(40);
  assert.match(auditBase(ledgerBase, currentBase)[0], /STALE_BASE_BINDING/);
  assert.equal(classifyHistoricalCoverage(auditRecordedRows(parseLedger(ledger))).state, 'RECONCILED_SNAPSHOT');
  // Outside its owning PR, only recorded-row structure is known, never live run coverage.
  assert.equal(parseLedgerPr('# Historical CI accountability — PR #1071') !== 779, true);
});

import { readFileSync } from 'node:fs';

test('every REMEDIATED row in the checked-in ledger names its candidate correction SHA', () => {
  const ledger = readFileSync(new URL('../docs/ci-historical-accountability.md', import.meta.url), 'utf8');
  const remediated = parseLedger(ledger).filter((row) => row.status === 'REMEDIATED');
  assert.ok(remediated.length > 0);
  for (const row of remediated) assert.match(row.candidate ?? '', /^[0-9a-f]{40}$/, `${row.sha} run ${row.runId}`);
});
