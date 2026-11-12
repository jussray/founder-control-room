import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyVitestNoSkips } from '../scripts/verify-vitest-no-skips.mjs';

const passed = () => ({
  success: true,
  numTotalTests: 2,
  numPassedTests: 2,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: [{ name: 'src/demo.test.ts', status: 'passed', assertionResults: [
    { fullName: 'first', status: 'passed' },
    { fullName: 'second', status: 'passed' },
  ] }],
});

test('accepts complete executed test evidence', () => {
  assert.deepEqual(verifyVitestNoSkips(passed()), []);
});
test('fails skipped or pending test counts even when the suite claims green', () => {
  assert.match(verifyVitestNoSkips({ ...passed(), numPendingTests: 1 }).join(' '), /skipped or pending/);
});
test('fails todo test counts', () => {
  assert.match(verifyVitestNoSkips({ ...passed(), numTodoTests: 1 }).join(' '), /todo tests/);
});
test('fails on hidden assertion-level skips despite zero aggregate skip count', () => {
  const report = passed();
  report.testResults[0].assertionResults[0].status = 'pending';
  assert.match(verifyVitestNoSkips(report).join(' '), /not executed-and-passed/);
});
test('fails suite-level skipped status', () => {
  const report = passed();
  report.testResults[0].status = 'pending';
  assert.match(verifyVitestNoSkips(report).join(' '), /suite status/);
});
test('fails when no tests or no assertion details were produced', () => {
  assert.match(verifyVitestNoSkips({ ...passed(), numTotalTests: 0 }).join(' '), /zero tests/);
  assert.match(verifyVitestNoSkips({ ...passed(), testResults: [] }).join(' '), /no suite-level evidence/);
});
test('fails malformed counts and failed test status', () => {
  assert.match(verifyVitestNoSkips({ ...passed(), numPendingTests: undefined }).join(' '), /numPendingTests/);
  assert.match(verifyVitestNoSkips({ ...passed(), success: false }).join(' '), /did not report success/);
});
test('fails mismatch between assertion and reported test counts', () => {
  assert.match(verifyVitestNoSkips({ ...passed(), numTotalTests: 3 }).join(' '), /assertion count/);
});
