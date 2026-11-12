#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Verify executed Vitest JSON evidence, not only discovered test filenames. */
export function verifyVitestNoSkips(report) {
  const errors = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return ['Vitest result must be a JSON object'];
  }

  for (const key of ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests']) {
    if (!Number.isSafeInteger(report[key]) || report[key] < 0) {
      errors.push(key + ' must be a nonnegative integer');
    }
  }
  if (report.success !== true) errors.push('Vitest did not report success');
  if (report.numTotalTests === 0) errors.push('Vitest ran zero tests');
  if (report.numPendingTests > 0) errors.push(String(report.numPendingTests) + ' skipped or pending tests');
  if (report.numTodoTests > 0) errors.push(String(report.numTodoTests) + ' todo tests');
  if (report.numFailedTests > 0) errors.push(String(report.numFailedTests) + ' failed tests');
  if (!Array.isArray(report.testResults) || report.testResults.length === 0) {
    errors.push('Vitest has no suite-level evidence');
    return errors;
  }

  let assertions = 0;
  for (const suite of report.testResults) {
    const name = typeof suite?.name === 'string' ? suite.name : 'unknown-suite';
    if (!suite || !Array.isArray(suite.assertionResults)) {
      errors.push(name + ': missing assertion-level evidence');
      continue;
    }
    if (suite.status !== 'passed') errors.push(name + ': suite status ' + String(suite.status) + ' is not passed');
    for (const assertion of suite.assertionResults) {
      assertions += 1;
      if (assertion?.status !== 'passed') {
        const title = typeof assertion?.fullName === 'string' ? assertion.fullName : 'unnamed test';
        errors.push(name + ': ' + title + ': ' + String(assertion?.status) + ' is not executed-and-passed');
      }
    }
  }
  if (Number.isSafeInteger(report.numTotalTests) && assertions !== report.numTotalTests) {
    errors.push('assertion count ' + assertions + ' differs from reported total ' + report.numTotalTests);
  }
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error('Vitest JSON result path is required');
    process.exitCode = 1;
  } else {
    try {
      const errors = verifyVitestNoSkips(JSON.parse(readFileSync(reportPath, 'utf8')));
      if (errors.length) {
        console.error('Required Vitest execution proof FAILED: ' + errors.join('; '));
        process.exitCode = 1;
      } else {
        console.log('Required Vitest execution proof PASSED: all tests executed and passed; no skips, pending, or todo');
      }
    } catch (error) {
      console.error('Required Vitest execution proof unavailable: ' + (error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  }
}
