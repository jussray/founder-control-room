#!/usr/bin/env node
/**
 * Test discovery ratchet.
 *
 * vitest.config.ts discovers only `src/(star)(star)/__tests__/(star)(star)/(star).test.ts`.
 * Any test file placed outside a `__tests__/` directory is silently skipped by
 * `npm test` -- it does not fail, it does not warn, it simply never runs.
 *
 * That failure mode has already shipped real regressions twice (the capability
 * score test and the FutureYou missionControl test), so this verifier makes the
 * gap measurable and prevents it from getting worse.
 *
 * Contract:
 *   - the recorded baseline may SHRINK (move a file into `__tests__/`)
 *   - the recorded baseline may NEVER GROW (a new hidden test file fails CI)
 *
 * This verifier deliberately does not fail on the existing backlog. Turning CI
 * red on 37 pre-existing files would block every unrelated change; the ratchet
 * stops the bleeding first and keeps the remaining debt named and visible.
 */

import { readFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';

const BASELINE_PATH = 'scripts/test-discovery-baseline.json';
const VITEST_CONFIG_PATH = 'vitest.config.ts';
const TEST_SUFFIX = '.test.ts';
const DISCOVERED_SEGMENT = '__tests__';

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
    } else if (entry.isFile() && entry.name.endsWith(TEST_SUFFIX)) {
      found.push(full);
    }
  }
  return found;
}

function fail(message) {
  console.error(`\nTest discovery contract FAILED: ${message}\n`);
  process.exit(1);
}

if (!existsSync(BASELINE_PATH)) {
  fail(`missing baseline file ${BASELINE_PATH}`);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const recorded = new Set(baseline.undiscovered ?? []);

// Guard the assumption this verifier is built on: if the include pattern is
// broadened, this script must be revisited rather than silently passing.
const vitestConfig = readFileSync(VITEST_CONFIG_PATH, 'utf8');
if (!vitestConfig.includes(baseline.includePattern)) {
  fail(
    `${VITEST_CONFIG_PATH} no longer contains the recorded include pattern ` +
      `'${baseline.includePattern}'. Update ${BASELINE_PATH} and this verifier together.`,
  );
}

const allTests = (await collectTestFiles('src')).sort();
const undiscovered = allTests.filter((file) => !file.split('/').includes(DISCOVERED_SEGMENT));
const discoveredCount = allTests.length - undiscovered.length;

const added = undiscovered.filter((file) => !recorded.has(file));
const fixed = [...recorded].filter((file) => !undiscovered.includes(file)).sort();

console.log(`Test files under src/: ${allTests.length}`);
console.log(`  discovered by npm test: ${discoveredCount}`);
console.log(`  NOT discovered (never run): ${undiscovered.length}`);

if (fixed.length > 0) {
  console.log(`\n${fixed.length} file(s) moved into test discovery since the baseline:`);
  for (const file of fixed) console.log(`  + ${file}`);
  console.log(`\nShrink the ratchet by removing them from ${BASELINE_PATH}.`);
}

if (added.length > 0) {
  console.error(`\n${added.length} NEW test file(s) are outside a ${DISCOVERED_SEGMENT}/ directory`);
  console.error('and will therefore never run in CI:');
  for (const file of added) console.error(`  - ${file}`);
  fail(
    `move each file into a ${DISCOVERED_SEGMENT}/ directory beside its subject ` +
      `(for example src/foo/bar.test.ts -> src/foo/__tests__/bar.test.ts) so it is actually executed.`,
  );
}

console.log(`\nTest discovery ratchet holding at ${undiscovered.length} known-undiscovered file(s).`);
console.log('No new hidden test files were introduced.');
