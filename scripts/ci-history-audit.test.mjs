import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLedger, auditLedger, auditAllCommits, classifyHistoricalCoverage } from './ci-history-audit.mjs';

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
