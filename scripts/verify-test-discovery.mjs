#!/usr/bin/env node
/**
 * Test discovery ratchet.
 *
 * The repository has used two reviewed Vitest discovery contracts:
 * - legacy: TypeScript test files nested under __tests__ directories;
 * - current: every TypeScript .test.ts file under src.
 *
 * Candidate test files excluded by the recorded include pattern can still be
 * run by a dedicated workflow, so this verifier never calls them "never run in
 * CI" without an exact workflow receipt.
 *
 * The recorded debt is base-bound: a pull request may remove entries by
 * making a candidate discoverable or deleting it, but it cannot add a newly
 * excluded test to its own baseline.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { posix } from 'node:path';

const BASELINE_PATH = 'scripts/test-discovery-baseline.json';
const VITEST_CONFIG_PATH = 'vitest.config.ts';
const LEGACY_INCLUDE_PATTERN = 'src/**/__tests__/**/*.test.ts';
const CURRENT_INCLUDE_PATTERN = 'src/**/*.test.ts';
const SUPPORTED_INCLUDE_PATTERNS = new Set([
  LEGACY_INCLUDE_PATTERN,
  CURRENT_INCLUDE_PATTERN,
]);
const CANDIDATE_TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/i;

function fail(messages) {
  console.error('\nTest discovery contract FAILED:');
  for (const message of messages) console.error(`- ${message}`);
  console.error('');
  process.exit(1);
}

async function collectTestFiles(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectTestFiles(full)));
    } else if (entry.isFile() && CANDIDATE_TEST_FILE.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

function isDefaultVitestTest(file, includePattern) {
  if (!SUPPORTED_INCLUDE_PATTERNS.has(includePattern)) {
    fail([
      `unsupported Vitest include pattern '${includePattern}'. Update this verifier and ${BASELINE_PATH} together.`,
    ]);
  }

  if (includePattern === CURRENT_INCLUDE_PATTERN) {
    return file.startsWith('src/') && file.endsWith('.test.ts');
  }

  return file.startsWith('src/')
    && file.split('/').includes('__tests__')
    && file.endsWith('.test.ts');
}

function baseUndiscoveredTests(baseRef, includePattern) {
  try {
    return execFileSync('git', ['ls-tree', '-r', '--name-only', baseRef, '--', 'src'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
      .filter((file) => CANDIDATE_TEST_FILE.test(file))
      .filter((file) => !isDefaultVitestTest(file, includePattern));
  } catch (error) {
    fail([
      `could not read base test inventory at ${baseRef}; CI must fetch and retain TEST_DISCOVERY_BASE_SHA`,
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

if (!existsSync(BASELINE_PATH)) {
  fail([`missing baseline file ${BASELINE_PATH}`]);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const baselineEntries = baseline.undiscovered;
if (!Array.isArray(baselineEntries)) {
  fail([`${BASELINE_PATH} must contain an undiscovered array`]);
}
if (new Set(baselineEntries).size !== baselineEntries.length) {
  fail([`${BASELINE_PATH} must not contain duplicate entries`]);
}
if (baselineEntries.some((file) => typeof file !== 'string' || !CANDIDATE_TEST_FILE.test(file))) {
  fail([`${BASELINE_PATH} contains a path that is not a supported test-file suffix`]);
}

const includePattern = baseline.includePattern;
const vitestConfig = readFileSync(VITEST_CONFIG_PATH, 'utf8');
if (typeof includePattern !== 'string' || !vitestConfig.includes(includePattern)) {
  fail([
    `${VITEST_CONFIG_PATH} no longer contains the recorded include pattern. Update ${BASELINE_PATH} and this verifier together.`,
  ]);
}
if (!SUPPORTED_INCLUDE_PATTERNS.has(includePattern)) {
  fail([
    `unsupported Vitest include pattern '${includePattern}'. Update this verifier and ${BASELINE_PATH} together.`,
  ]);
}

const allTests = (await collectTestFiles('src')).sort();
const undiscovered = allTests.filter((file) => !isDefaultVitestTest(file, includePattern));
const recorded = new Set(baselineEntries);
const failures = [];
const baseRef = process.env.TEST_DISCOVERY_BASE_SHA?.trim();

if (baseRef && !/^0+$/.test(baseRef)) {
  const baseUndiscovered = new Set(baseUndiscoveredTests(baseRef, includePattern));
  const introducedBaselineEntries = baselineEntries.filter((file) => !baseUndiscovered.has(file));
  if (introducedBaselineEntries.length > 0) {
    failures.push(
      `baseline records test files absent from the base's default-discovery debt: ${introducedBaselineEntries.join(', ')}`,
    );
  }
} else {
  console.log('Base debt comparison skipped locally; CI must set TEST_DISCOVERY_BASE_SHA.');
}

const stale = baselineEntries.filter((file) => !undiscovered.includes(file)).sort();
if (stale.length > 0) {
  failures.push(
    `baseline still lists tests no longer excluded from default discovery: ${stale.join(', ')}. Remove paid-down entries from ${BASELINE_PATH}.`,
  );
}

const added = undiscovered.filter((file) => !recorded.has(file));
if (added.length > 0) {
  failures.push(
    `new tests are excluded from default npm test discovery: ${added.join(', ')}. Move them into a matching default-discovery path or record pre-existing base debt only.`,
  );
}

console.log(`Candidate test files under src/: ${allTests.length}`);
console.log(`  matched by default npm test discovery: ${allTests.length - undiscovered.length}`);
console.log(`  excluded from default npm test discovery: ${undiscovered.length}`);

if (failures.length > 0) fail(failures);

console.log(`\nTest discovery ratchet holding at ${undiscovered.length} known default-excluded file(s).`);
console.log('No new default-excluded test files were introduced.');
